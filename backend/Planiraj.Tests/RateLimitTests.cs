using System.Net;
using System.Net.Http.Json;

namespace Planiraj.Tests;

/// <summary>API sa malim ograničenjima, da se 429 vidi brzo.</summary>
public class LimitedApiFactory : ApiFactory
{
    protected override Dictionary<string, string?> Settings => new()
    {
        ["RateLimit:Enabled"] = "true",
        ["RateLimit:PermitPerMinute"] = "5",
        ["RateLimit:AuthPermitPerMinute"] = "3",
        ["Email:DispatcherEnabled"] = "false",
    };
}

public class RateLimitTests(LimitedApiFactory api) : IClassFixture<LimitedApiFactory>
{
    [Fact]
    public async Task Previse_zahtjeva_vraca_429()
    {
        var guest = api.CreateClient();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 7; i++) codes.Add((await guest.GetAsync("/api/cities")).StatusCode);

        Assert.Equal(5, codes.Count(c => c == HttpStatusCode.OK));
        Assert.Equal(HttpStatusCode.TooManyRequests, codes[^1]);

        var res = await guest.GetAsync("/api/cities");
        Assert.True(res.Headers.Contains("Retry-After"));
        Assert.Contains("Previše zahtjeva", await res.Content.ReadAsStringAsync());
    }

}

/// <summary>Posebna baza i brojač, da prethodni test ne potroši ograničenje.</summary>
public class AuthRateLimitTests(LimitedApiFactory api) : IClassFixture<LimitedApiFactory>
{
    [Fact]
    public async Task Prijava_ima_strozije_ogranicenje()
    {
        var guest = api.CreateClient();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
            codes.Add((await guest.PostAsJsonAsync("/api/auth/login", new { login = "x", password = "pogresna" })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, codes[0]);
        Assert.Equal(HttpStatusCode.TooManyRequests, codes[^1]);
    }
}
