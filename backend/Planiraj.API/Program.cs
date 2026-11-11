using System.Text;
using System.Text.Json.Serialization;
using Mapster;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Planiraj.API.Auth;
using Microsoft.Extensions.FileProviders;
using Planiraj.API.Middleware;
using Planiraj.API.Uploads;
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
builder.Services.AddSingleton(builder.Configuration.GetSection("Uploads").Get<UploadSettings>() ?? new UploadSettings());
builder.Services.AddSingleton<LocalFileStorage>();
builder.Services.AddSingleton<IFileStorage>(sp => sp.GetRequiredService<LocalFileStorage>());
builder.Services.AddScoped<IOfferingService, OfferingService>();
builder.Services.AddScoped<IVendorImageService, VendorImageService>();
builder.Services.AddScoped<IWorkingHourService, WorkingHourService>();
builder.Services.AddScoped<IReviewService, ReviewService>();
builder.Services.AddScoped<IBookingService, BookingService>();
builder.Services.AddScoped<IFavoriteService, FavoriteService>();
builder.Services.AddScoped<IPlanService, PlanService>();
builder.Services.AddScoped<ISitemapService, SitemapService>();
builder.Services.AddScoped<IVendorMapService, VendorMapService>();

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
        // Token važi samo dok nalog postoji i aktivan je: obrisan ili isključen nalog odmah gubi pristup.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async ctx =>
            {
                var sub = ctx.Principal?.FindFirst(AppClaims.UserId)?.Value;
                var auth = ctx.HttpContext.RequestServices.GetRequiredService<IAuthService>();
                if (!int.TryParse(sub, out var userId) || !await auth.IsActiveAsync(userId))
                    ctx.Fail("Nalog više nije aktivan.");
            }
        };
    });
builder.Services.AddAuthorization();

// ---------- API ----------
builder.Services.AddControllers(o => o.Conventions.Add(new PublicReadConvention()))
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

var rateLimit = builder.Configuration.GetSection("RateLimit").Get<RateLimitSettings>() ?? new RateLimitSettings();
builder.Services.AddPlanirajRateLimits(rateLimit);

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? new[] { "http://localhost:4200" };
builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

await InitializeDatabaseAsync(app);

if (rateLimit.TrustForwardedHeaders) app.UseForwardedHeaders();
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
// Slike koje su saloni uploadovali (vidi UploadsController); keširaju se dugo jer svaka ima jedinstveno ime.
var uploads = app.Services.GetRequiredService<LocalFileStorage>();
Directory.CreateDirectory(uploads.RootPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploads.RootPath),
    RequestPath = LocalFileStorage.RequestPath,
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        ctx.Context.Response.Headers.XContentTypeOptions = "nosniff";
    }
});
app.UseCors("Frontend");
app.UseAuthentication();
app.UseRateLimiter();
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

/// <summary>Za integracione testove (WebApplicationFactory).</summary>
public partial class Program;
