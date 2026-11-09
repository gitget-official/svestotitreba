using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Planiraj.Tests;

/// <summary>Gost bez prijave: smije čitati ponudu, ne smije ništa mijenjati ni vidjeti tuđe podatke.</summary>
public class PublicReadTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _guest = api.CreateClient();

    [Theory]
    [InlineData("/api/vendors")]
    [InlineData("/api/cities")]
    [InlineData("/api/servicecategories")]
    [InlineData("/api/subscriptionplans")]
    [InlineData("/api/offerings")]
    [InlineData("/api/vendorimages")]
    [InlineData("/api/workinghours")]
    [InlineData("/api/reviews")]
    public async Task Gost_cita_ponudu(string url)
    {
        var res = await _guest.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Gost_vidi_stranicu_ponudjaca_i_samo_aktivne()
    {
        var list = await _guest.GetFromJsonAsync<JsonElement>("/api/vendors?pageSize=100");
        var items = list.GetProperty("items").EnumerateArray().ToList();
        Assert.NotEmpty(items);
        Assert.All(items, v => Assert.True(v.GetProperty("isActive").GetBoolean()));

        var id = items[0].GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await _guest.GetAsync($"/api/vendors/{id}")).StatusCode);
    }

    [Fact]
    public async Task Gost_vidi_samo_odobrene_recenzije()
    {
        var list = await _guest.GetFromJsonAsync<JsonElement>("/api/reviews?pageSize=100");
        var items = list.GetProperty("items").EnumerateArray().ToList();
        Assert.NotEmpty(items);
        Assert.All(items, r => Assert.Equal("Approved", r.GetProperty("status").GetString()));
    }

    [Theory]
    [InlineData("/api/bookings")]
    [InlineData("/api/users")]
    [InlineData("/api/favorites")]
    [InlineData("/api/plans/me")]
    [InlineData("/api/auth/me")]
    public async Task Gost_ne_vidi_licne_podatke(string url)
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Gost_ne_moze_mijenjati()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.PostAsJsonAsync("/api/reviews", new { vendorId = 1, rating = 5, comment = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.PostAsJsonAsync("/api/cities", new { name = "X" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.DeleteAsync("/api/vendors/1")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _guest.PostAsJsonAsync("/api/bookings", new { vendorId = 1 })).StatusCode);
    }

    [Fact]
    public async Task Prijavljeni_vidi_svoje_rezervacije()
    {
        var (client, _) = await api.GoogleAsync("rezervacije");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/bookings")).StatusCode);
    }
}
