using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Planiraj.Tests;

/// <summary>"Sačuvano" i "Moj plan" na serveru.</summary>
public class FavoritesAndPlanTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private async Task<int[]> VendorIdsAsync(int n)
    {
        var list = await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/vendors?pageSize=" + n);
        return list.GetProperty("items").EnumerateArray().Select(v => v.GetProperty("id").GetInt32()).ToArray();
    }

    [Fact]
    public async Task Sacuvano_dodaj_ukloni_bez_duplikata()
    {
        var (client, _) = await api.GoogleAsync("fav1");
        var ids = await VendorIdsAsync(3);

        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/favorites") ?? []);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/favorites/{ids[0]}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/favorites/{ids[0]}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/favorites/999999", null)).StatusCode);
        Assert.Single(await client.GetFromJsonAsync<JsonElement[]>("/api/favorites") ?? []);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/favorites/{ids[0]}")).StatusCode);
        Assert.Empty(await client.GetFromJsonAsync<JsonElement[]>("/api/favorites") ?? []);
    }

    [Fact]
    public async Task Sync_spaja_listu_iz_preglednika_sa_profilom()
    {
        var (client, _) = await api.GoogleAsync("fav2");
        var ids = await VendorIdsAsync(3);
        await client.PostAsync($"/api/favorites/{ids[0]}", null);

        var res = await client.PostAsJsonAsync("/api/favorites/sync", new { vendorIds = new[] { ids[1], ids[0], 999999, ids[2], ids[1] } });
        var list = await res.Content.ReadFromJsonAsync<JsonElement[]>();
        Assert.Equal(3, list!.Length);
        Assert.Equal(ids.OrderBy(x => x), list.Select(f => f.GetProperty("vendorId").GetInt32()).OrderBy(x => x));
    }

    [Fact]
    public async Task Sacuvano_je_odvojeno_po_korisniku()
    {
        var (a, _) = await api.GoogleAsync("fav3a");
        var (b, _) = await api.GoogleAsync("fav3b");
        var ids = await VendorIdsAsync(1);
        await a.PostAsync($"/api/favorites/{ids[0]}", null);
        Assert.Empty(await b.GetFromJsonAsync<JsonElement[]>("/api/favorites") ?? []);
    }

    [Fact]
    public async Task Plan_cuvanje_citanje_brisanje()
    {
        var (client, _) = await api.GoogleAsync("plan1");
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/plans/me")).StatusCode);

        var plan = new
        {
            answers = new { categoryIds = new[] { 1, 4 }, budget = 15000, cityId = 1, date = "2027-06-12", guests = 150 },
            items = new[] { new { categoryId = 1, vendorId = 3, vendorName = "Sala", priceFrom = 5000, priceTo = 8000 } },
            manual = false
        };
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/plans/me", plan)).StatusCode);

        var got = await client.GetFromJsonAsync<JsonElement>("/api/plans/me");
        Assert.Equal(15000, got.GetProperty("answers").GetProperty("budget").GetInt32());
        Assert.Equal(3, got.GetProperty("items")[0].GetProperty("vendorId").GetInt32());
        Assert.Equal(JsonValueKind.Null, got.GetProperty("savedAt").ValueKind);

        await client.PutAsJsonAsync("/api/plans/me", plan with { manual = true });
        got = await client.GetFromJsonAsync<JsonElement>("/api/plans/me");
        Assert.NotEqual(JsonValueKind.Null, got.GetProperty("savedAt").ValueKind);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/plans/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/plans/me")).StatusCode);
    }

    [Fact]
    public async Task Neispravan_plan_se_odbija()
    {
        var (client, _) = await api.GoogleAsync("plan2");
        var res = await client.PutAsJsonAsync("/api/plans/me", new { answers = new[] { 1 }, items = new[] { 1 } });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
