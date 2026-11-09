using System.Text;
using System.Text.Json.Serialization;
using Mapster;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Planiraj.API.Auth;
using Planiraj.API.Middleware;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Mapping;
using Planiraj.Services.Security;
using Planiraj.Services.Seed;
using Planiraj.Services.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------- Baza ----------
builder.Services.AddDbContext<PlanirajDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("PlanirajDb")));

MappingConfig.Register(TypeAdapterConfig.GlobalSettings);

// ---------- Servisi ----------
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, HttpCurrentUserService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<ICityService, CityService>();
builder.Services.AddScoped<IServiceCategoryService, ServiceCategoryService>();
builder.Services.AddScoped<ISubscriptionPlanService, SubscriptionPlanService>();
builder.Services.AddScoped<IVendorService, VendorService>();
builder.Services.AddScoped<IOfferingService, OfferingService>();
builder.Services.AddScoped<IVendorImageService, VendorImageService>();
builder.Services.AddScoped<IWorkingHourService, WorkingHourService>();
builder.Services.AddScoped<IReviewService, ReviewService>();
builder.Services.AddScoped<IBookingService, BookingService>();

// ---------- JWT autentifikacija ----------
var jwtSection = builder.Configuration.GetSection("Jwt");
builder.Services.Configure<JwtSettings>(jwtSection);
var jwt = jwtSection.Get<JwtSettings>() ?? new JwtSettings();

builder.Services.AddSingleton<ITokenService, TokenService>();

// ---------- Google prijava (mladenci) ----------
builder.Services.Configure<GoogleSettings>(builder.Configuration.GetSection("Google"));
builder.Services.AddSingleton<IGoogleTokenValidator, GoogleTokenValidator>();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Provjera ključa je ovdje (a ne na startu) da "dotnet ef" alati rade i bez ključa.
        JwtSettings.EnsureValidKey(jwt.Key);
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = AppClaims.Name,
            RoleClaimType = AppClaims.Role
        };
    });
builder.Services.AddAuthorization();

// ---------- API ----------
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddRouting(o => o.LowercaseUrls = true);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Planiraj API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Prijavite se preko /api/auth/login i ovdje zalijepite token."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? new[] { "http://localhost:4200" };
builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

await InitializeDatabaseAsync(app);

app.UseMiddleware<ExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// U razvoju frontend proxy gađa http://localhost:5080, pa preusmjeravanje na HTTPS ne smije biti aktivno.
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Primjenjuje migracije i puni bazu početnim podacima (samo ako je prazna).
static async Task InitializeDatabaseAsync(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<PlanirajDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseInit");

    if (!db.Database.GetMigrations().Any())
    {
        logger.LogWarning(
            "Nema EF migracija. U folderu backend pokrenite: " +
            "dotnet ef migrations add InitialCreate --project Planiraj.Services --startup-project Planiraj.API --output-dir Database/Migrations");
        return;
    }

    await db.Database.MigrateAsync();

    if (app.Configuration.GetValue("Seed:Enabled", true))
    {
        await DbSeeder.SeedAsync(db);
        logger.LogInformation("Baza je spremna (migracije primijenjene, seed provjeren).");
    }
}
