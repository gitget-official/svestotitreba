using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Planiraj.Tests;

public class GoogleLoginTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Prva_prijava_pravi_profil_mladenaca_druga_ga_prepoznaje()
    {
        var (client, first) = await api.GoogleAsync("lejla");
        Assert.True(first.GetProperty("isNew").GetBoolean());
        var user = first.GetProperty("user");
        Assert.Equal("Couple", user.GetProperty("role").GetString());
        Assert.False(user.GetProperty("hasPassword").GetBoolean());

        var (_, second) = await api.GoogleAsync("lejla");
        Assert.False(second.GetProperty("isNew").GetBoolean());
        Assert.Equal(user.GetProperty("id").GetInt32(), second.GetProperty("user").GetProperty("id").GetInt32());

        var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal("lejla@gmail.com", me.GetProperty("email").GetString());
    }

    [Fact]
    public async Task Neispravan_token_se_odbija()
    {
        var res = await api.CreateClient().PostAsJsonAsync("/api/auth/google", new { credential = "los-token" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Konfiguracija_vraca_client_id()
    {
        var cfg = await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/auth/config");
        Assert.Equal(FakeGoogle.ClientIdValue, cfg.GetProperty("googleClientId").GetString());
    }
}
