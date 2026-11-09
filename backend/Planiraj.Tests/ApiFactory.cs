using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Planiraj.Model.Dtos;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;

namespace Planiraj.Tests;

/// <summary>
/// Cijeli API u memoriji: SQLite baza umjesto SQL Servera (sa seed podacima) i lažna provjera Google tokena.
/// Svaka test klasa dobija svoju bazu.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    /// <summary>Privremeni folder za uploadovane slike; briše se na kraju.</summary>
    public string UploadRoot { get; } = Path.Combine(Path.GetTempPath(), "planiraj-test-" + Guid.NewGuid().ToString("N"));

    /// <summary>Ograničenje zahtjeva je u testovima isključeno; RateLimitTests ga uključuje sa malim brojevima.</summary>
    protected virtual Dictionary<string, string?> Settings => new()
    {
        ["RateLimit:Enabled"] = "false",
    };

    public ApiFactory()
    {
        _connection.Open();
        // Šema iz modela, a migracije označene kao primijenjene: API pri startu ne pokušava pokrenuti SQL Server migracije.
        using var db = new PlanirajDbContext(Options());
        db.Database.EnsureCreated();
        db.Database.ExecuteSqlRaw("CREATE TABLE IF NOT EXISTS __EFMigrationsHistory (MigrationId TEXT PRIMARY KEY, ProductVersion TEXT NOT NULL)");
        foreach (var m in db.Database.GetMigrations())
            db.Database.ExecuteSqlRaw("INSERT INTO __EFMigrationsHistory VALUES ({0}, '10.0.0')", m);
    }

    private DbContextOptions<PlanirajDbContext> Options() => new DbContextOptionsBuilder<PlanirajDbContext>()
        .UseSqlite(_connection)
        .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning))
        .Options;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Jwt:Key", "testni-kljuc-koji-ima-vise-od-32-znaka-0123456789");
        builder.UseSetting("Google:ClientId", FakeGoogle.ClientIdValue);
        builder.UseSetting("Seed:Enabled", "true");
        builder.UseSetting("Uploads:Root", UploadRoot);
        foreach (var (k, v) in Settings) builder.UseSetting(k, v);

        builder.ConfigureServices(s =>
        {
            foreach (var d in s.Where(d => d.ServiceType == typeof(DbContextOptions<PlanirajDbContext>)
                                           || d.ServiceType.FullName!.Contains("IDbContextOptionsConfiguration")).ToList())
                s.Remove(d);
            s.AddDbContext<PlanirajDbContext>(o => o
                .UseSqlite(_connection)
                .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));
            s.AddSingleton<IGoogleTokenValidator, FakeGoogle>();
        });
    }

    /// <summary>Prijava preko (lažnog) Googlea; isti credential = ista osoba.</summary>
    public async Task<(HttpClient Client, JsonElement Auth)> GoogleAsync(string credential)
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/google", new { credential });
        res.EnsureSuccessStatusCode();
        var auth = await res.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("token").GetString());
        return (client, auth);
    }

    /// <summary>Prijava salona preko (lažnog) Googlea, na stranici za salone.</summary>
    public async Task<(HttpClient Client, JsonElement Auth)> GoogleSalonAsync(string credential)
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/google/salon", new { credential });
        res.EnsureSuccessStatusCode();
        var auth = await res.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("token").GetString());
        return (client, auth);
    }

    /// <summary>Prijava seed naloga korisničkim imenom i lozinkom.</summary>
    public async Task<HttpClient> LoginAsync(string login, string password)
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { login, password });
        res.EnsureSuccessStatusCode();
        var auth = await res.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("token").GetString());
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
            if (Directory.Exists(UploadRoot)) Directory.Delete(UploadRoot, recursive: true);
        }
    }
}

/// <summary>Umjesto Googlea: credential "ana" je osoba ana@gmail.com sa Google ID-om "sub-ana".</summary>
public class FakeGoogle : IGoogleTokenValidator
{
    public const string ClientIdValue = "test.apps.googleusercontent.com";
    public string? ClientId => ClientIdValue;

    public Task<GoogleIdentity?> ValidateAsync(string credential) =>
        Task.FromResult<GoogleIdentity?>(credential == "los-token"
            ? null
            : new GoogleIdentity("sub-" + credential, credential + "@gmail.com", true, "Test", "Korisnik", "Test Korisnik"));
}
