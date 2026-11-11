using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Planiraj.Tests;

/// <summary>Centar grada: seed ga popuni, administrator ga mijenja, gost ga čita.</summary>
public class CityCoordinatesTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Seedovani_gradovi_imaju_centar()
    {
        var list = await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/cities?pageSize=100");
        var sarajevo = list.GetProperty("items").EnumerateArray().Single(c => c.GetProperty("name").GetString() == "Sarajevo");
        Assert.Equal(43.8563, sarajevo.GetProperty("latitude").GetDouble(), 3);
        Assert.Equal(18.4131, sarajevo.GetProperty("longitude").GetDouble(), 3);
    }

    [Fact]
    public async Task Admin_postavlja_centar_novog_grada()
    {
        var admin = await api.LoginAsync("admin", "Admin123!");
        var res = await admin.PostAsJsonAsync("/api/cities", new { name = "Jajce", latitude = 44.3419, longitude = 17.27 });
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        var city = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(44.3419, city.GetProperty("latitude").GetDouble(), 4);

        var id = city.GetProperty("id").GetInt32();
        var cleared = await admin.PutAsJsonAsync($"/api/cities/{id}", new { name = "Jajce", latitude = (double?)null, longitude = (double?)null });
        Assert.True(cleared.IsSuccessStatusCode);
        Assert.Equal(JsonValueKind.Null, (await cleared.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("latitude").ValueKind);
    }

    [Fact]
    public async Task Koordinate_van_opsega_se_odbijaju()
    {
        var admin = await api.LoginAsync("admin", "Admin123!");
        var res = await admin.PostAsJsonAsync("/api/cities", new { name = "Nigdje", latitude = 123.0, longitude = 18.0 });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
