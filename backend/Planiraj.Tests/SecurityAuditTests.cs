using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Planiraj.Model.Enums;
using Planiraj.Services.Database;
using Planiraj.Services.Seed;

namespace Planiraj.Tests;

// Regresioni testovi za nalaze sigurnosne revizije (docs/security/SECURITY-AUDIT-REPORT.md).

/// <summary>Isti API u memoriji, ali u Production okruženju (kao na serveru).</summary>
public class ProductionApiFactory : ApiFactory
{
    protected virtual Dictionary<string, string?> ProductionSettings => new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder); // postavlja i Seed:Enabled = true, što se u produkciji mora zanemariti
        builder.UseEnvironment("Production");
        foreach (var (k, v) in ProductionSettings) builder.UseSetting(k, v);
    }
}

public class ProductionBootstrapFactory : ProductionApiFactory
{
    public const string Password = "Pocetna-Lozinka-2026!";

    protected override Dictionary<string, string?> ProductionSettings => new()
    {
        ["Bootstrap:AdminUsername"] = "vlasnik",
        ["Bootstrap:AdminEmail"] = "Vlasnik@Primjer.ba",
        ["Bootstrap:AdminPassword"] = Password,
    };
}

/// <summary>F-01: produkcija nikad ne pravi demo naloge sa javnim lozinkama.</summary>
public class ProductionSeedTests(ProductionApiFactory api) : IClassFixture<ProductionApiFactory>
{
    [Fact]
    public void Isporuceni_appsettings_ne_ukljucuje_demo_podatke()
    {
        var cfg = new ConfigurationBuilder().AddJsonFile(Path.Combine(ApiProjectDir(), "appsettings.json")).Build();
        Assert.Equal("False", cfg["Seed:Enabled"], ignoreCase: true);
    }

    [Fact]
    public async Task Produkcija_nema_demo_naloge_ali_ima_sifarnike()
    {
        var anonymous = api.CreateClient();
        var login = await anonymous.PostAsJsonAsync("/api/auth/login", new { login = "admin", password = DbSeeder.AdminPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        var cities = await anonymous.GetFromJsonAsync<JsonElement>("/api/cities?pageSize=100");
        Assert.True(cities.GetProperty("totalCount").GetInt32() >= 10);
        var categories = await anonymous.GetFromJsonAsync<JsonElement>("/api/servicecategories?pageSize=100");
        Assert.True(categories.GetProperty("totalCount").GetInt32() >= 7);
        var vendors = await anonymous.GetFromJsonAsync<JsonElement>("/api/vendors");
        Assert.Equal(0, vendors.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Produkcija_salje_sigurnosna_zaglavlja()
    {
        var res = await api.CreateClient().GetAsync("/api/cities");
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", res.Headers.GetValues("Referrer-Policy").Single());
        Assert.Contains("frame-ancestors 'none'", res.Headers.GetValues("Content-Security-Policy").Single());
    }

    internal static string ApiProjectDir()
    {
        var dir = AppContext.BaseDirectory;
        while (dir != null && !File.Exists(Path.Combine(dir, "Planiraj.sln"))) dir = Path.GetDirectoryName(dir);
        return Path.Combine(dir!, "Planiraj.API");
    }
}

/// <summary>F-01: prvi administrator dolazi iz tajni okruženja i mora promijeniti lozinku.</summary>
public class ProductionBootstrapTests(ProductionBootstrapFactory api) : IClassFixture<ProductionBootstrapFactory>
{
    [Fact]
    public async Task Bootstrap_pravi_administratora_koji_mora_promijeniti_lozinku()
    {
        var res = await api.CreateClient().PostAsJsonAsync("/api/auth/login", new { login = "vlasnik@primjer.ba", password = ProductionBootstrapFactory.Password });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var user = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("user");
        Assert.Equal("Admin", user.GetProperty("role").GetString());
        Assert.True(user.GetProperty("mustChangePassword").GetBoolean());
    }
}

/// <summary>F-01: startne provjere (bez pokretanja cijelog API-ja).</summary>
public class StartupGuardTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly PlanirajDbContext _db;

    public StartupGuardTests()
    {
        _connection.Open();
        _db = new PlanirajDbContext(new DbContextOptionsBuilder<PlanirajDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
    }

    [Fact]
    public async Task Bootstrap_odbija_slabu_ili_demo_lozinku_i_ne_pravi_drugog_admina()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => DbSeeder.BootstrapAdminAsync(_db, "a", "a@a.ba", "kratka"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => DbSeeder.BootstrapAdminAsync(_db, "a", "a@a.ba", DbSeeder.AdminPassword));
        Assert.False(await DbSeeder.BootstrapAdminAsync(_db, null, null, null));

        Assert.True(await DbSeeder.BootstrapAdminAsync(_db, "prvi", "prvi@a.ba", "Dovoljno-Duga-Lozinka"));
        Assert.False(await DbSeeder.BootstrapAdminAsync(_db, "drugi", "drugi@a.ba", "Dovoljno-Duga-Lozinka"));
        Assert.Equal(1, await _db.Users.CountAsync(u => u.Role == UserRole.Admin));
    }

    [Fact]
    public async Task Prepoznaje_demo_naloge_sa_javnim_lozinkama()
    {
        await DbSeeder.SeedAsync(_db);
        Assert.Equal(["admin", "mladenci", "salon"], (await DbSeeder.FindDemoAccountsAsync(_db)).Order());
    }

    [Fact]
    public void Razvojni_jwt_kljuc_se_odbija_izvan_razvoja()
    {
        var api = ProductionSeedTests.ApiProjectDir();
        var devKey = new ConfigurationBuilder().AddJsonFile(Path.Combine(api, "appsettings.Development.json")).Build()["Jwt:Key"];
        Assert.Throws<InvalidOperationException>(() => Planiraj.API.Auth.JwtSettings.EnsureNotDevelopmentKey(devKey, api));
        Planiraj.API.Auth.JwtSettings.EnsureNotDevelopmentKey("neki-drugi-tajni-kljuc-od-vise-od-32-znaka", api);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}

/// <summary>F-02: Google prijava ne smije dijeliti nalog sa nekim ko je unaprijed registrovao tuđi e-mail.</summary>
public class GooglePreHijackTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Povezivanje_sa_Googleom_ponistava_lozinku_i_tokene_napadaca()
    {
        var reg = await api.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            firstName = "Napadac", lastName = "X", email = "meta@gmail.com", username = "napadac-meta", password = "NapadacLozinka1"
        });
        Assert.Equal(HttpStatusCode.OK, reg.StatusCode);
        var attackerToken = (await reg.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();

        var (victim, auth) = await api.GoogleAsync("meta");
        Assert.False(auth.GetProperty("user").GetProperty("hasPassword").GetBoolean());

        var login = await api.CreateClient().PostAsJsonAsync("/api/auth/login", new { login = "napadac-meta", password = "NapadacLozinka1" });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        var stale = api.CreateClient();
        stale.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", attackerToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await stale.GetAsync("/api/auth/me")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await victim.GetAsync("/api/auth/me")).StatusCode);
    }
}

/// <summary>F-03: promjena lozinke, reset i promjena uloge poništavaju ranije izdane tokene.</summary>
public class TokenRevocationTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Promjena_lozinke_ponistava_stare_tokene_a_vraca_novi()
    {
        var stolen = await api.LoginAsync("mladenci", DbSeeder.CouplePassword);
        var owner = await api.LoginAsync("mladenci", DbSeeder.CouplePassword);

        var res = await owner.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = DbSeeder.CouplePassword, newPassword = "Nova-Lozinka-2026" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var fresh = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();

        Assert.Equal(HttpStatusCode.Unauthorized, (await stolen.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.GetAsync("/api/auth/me")).StatusCode);

        var current = api.CreateClient();
        current.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", fresh);
        Assert.Equal(HttpStatusCode.OK, (await current.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Reset_lozinke_i_promjena_uloge_od_strane_admina_ponistavaju_tokene()
    {
        var admin = await api.LoginAsync("admin", DbSeeder.AdminPassword);
        var create = await admin.PostAsJsonAsync("/api/users", new
        {
            firstName = "Drugi", lastName = "Admin", email = "drugi.admin@planiraj.ba", username = "drugi-admin", role = "Admin", password = "Pocetna-123"
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var second = await api.LoginAsync("drugi-admin", "Pocetna-123");
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync("/api/users")).StatusCode);

        // Spušten na mladence: stari token sa ulogom Admin više ne važi.
        var demote = await admin.PutAsJsonAsync($"/api/users/{id}", new
        {
            firstName = "Drugi", lastName = "Admin", email = "drugi.admin@planiraj.ba", role = "Couple", isActive = true
        });
        Assert.Equal(HttpStatusCode.OK, demote.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/users")).StatusCode);

        // Reset lozinke: token izdan prije reseta više ne važi.
        var again = await api.LoginAsync("drugi-admin", "Pocetna-123");
        var reset = await admin.PutAsJsonAsync($"/api/users/{id}", new
        {
            firstName = "Drugi", lastName = "Admin", email = "drugi.admin@planiraj.ba", role = "Couple", isActive = true, newPassword = "Reset-Lozinka-2026"
        });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await again.GetAsync("/api/auth/me")).StatusCode);

        // Admin koji je radio izmjene ostaje prijavljen.
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/users")).StatusCode);
    }
}

/// <summary>API sa malim limitom slika po salonu; nekorišteni fajlovi se odmah smiju obrisati.</summary>
public class SmallUploadQuotaFactory : ApiFactory
{
    protected override Dictionary<string, string?> Settings => new()
    {
        ["RateLimit:Enabled"] = "false",
        ["Email:DispatcherEnabled"] = "false",
        ["Uploads:MaxFilesPerVendor"] = "3",
        ["Uploads:OrphanGraceMinutes"] = "0",
    };
}

/// <summary>F-04: prostor po salonu je ograničen, a nekorišteni fajlovi se brišu.</summary>
public class UploadQuotaTests(SmallUploadQuotaFactory api) : IClassFixture<SmallUploadQuotaFactory>
{
    private static readonly byte[] Png =
        Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private static MultipartFormDataContent File()
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(file, "file", "x.png");
        return content;
    }

    private async Task<(HttpClient Salon, int VendorId)> NewSalonAsync(string who)
    {
        var (salon, _) = await api.GoogleSalonAsync(who);
        var vendor = await (await salon.PostAsJsonAsync("/api/vendors", new { name = "Salon " + who, cityId = 1 })).Content.ReadFromJsonAsync<JsonElement>();
        return (salon, vendor.GetProperty("id").GetInt32());
    }

    private int FilesOf(int vendorId) => Directory.GetFiles(Path.Combine(api.UploadRoot, "vendors", vendorId.ToString())).Length;

    [Fact]
    public async Task Pun_salon_sa_koristenim_slikama_ne_moze_dodati_vise()
    {
        var (salon, id) = await NewSalonAsync("pun-salon");
        for (var i = 0; i < 3; i++)
        {
            var up = await salon.PostAsync($"/api/uploads/vendors/{id}", File());
            var url = (await up.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString();
            Assert.Equal(HttpStatusCode.OK, (await salon.PostAsJsonAsync("/api/vendorimages", new { vendorId = id, url })).StatusCode);
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await salon.PostAsync($"/api/uploads/vendors/{id}", File())).StatusCode);
        Assert.Equal(3, FilesOf(id));
    }

    [Fact]
    public async Task Nekoristeni_fajlovi_se_brisu_kad_je_limit_dostignut()
    {
        var (salon, id) = await NewSalonAsync("prazan-salon");
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.OK, (await salon.PostAsync($"/api/uploads/vendors/{id}", File())).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await salon.PostAsync($"/api/uploads/vendors/{id}", File())).StatusCode);
        Assert.Equal(1, FilesOf(id));
    }
}
