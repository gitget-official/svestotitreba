using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Xml.Linq;

namespace Planiraj.Tests;

public class SiteApiFactory : ApiFactory
{
    protected override Dictionary<string, string?> Settings => new()
    {
        ["RateLimit:Enabled"] = "false",
        ["Seo:SiteUrl"] = "https://primjer.ba/",
        ["Email:DispatcherEnabled"] = "false",
    };
}

/// <summary>sitemap.xml sa servera: uvijek iz baze, sa adresama frontenda.</summary>
public class SitemapTests(SiteApiFactory api) : IClassFixture<SiteApiFactory>
{
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    private async Task<List<string>> LocsAsync(string url = "/sitemap.xml")
    {
        var res = await api.CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("application/xml", res.Content.Headers.ContentType?.MediaType);
        var xml = XDocument.Parse(await res.Content.ReadAsStringAsync());
        return xml.Descendants(Ns + "loc").Select(l => l.Value).ToList();
    }

    [Fact]
    public async Task Sitemap_ima_opce_stranice_i_sve_aktivne_ponudjace()
    {
        var locs = await LocsAsync();
        Assert.Contains("https://primjer.ba/", locs);
        Assert.Contains("https://primjer.ba/istrazi", locs);
        Assert.Contains("https://primjer.ba/privatnost", locs);

        var vendors = await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/vendors?pageSize=100");
        var total = vendors.GetProperty("totalCount").GetInt32();
        Assert.Equal(total, locs.Count(l => l.StartsWith("https://primjer.ba/ponudjaci/")));
        var first = vendors.GetProperty("items")[0];
        Assert.Contains($"https://primjer.ba/ponudjaci/{first.GetProperty("id").GetInt32()}-{first.GetProperty("slug").GetString()}", locs);
    }

    [Fact]
    public async Task Isti_sitemap_i_na_api_adresi()
    {
        Assert.Equal(await LocsAsync("/sitemap.xml"), await LocsAsync("/api/sitemap.xml"));
    }

    [Fact]
    public async Task Iskljucen_ponudjac_odmah_nestaje_iz_sitemapa()
    {
        var admin = await api.LoginAsync("admin", "Admin123!");
        var vendors = await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/vendors?pageSize=100");
        var v = vendors.GetProperty("items").EnumerateArray().Last();
        var id = v.GetProperty("id").GetInt32();
        var path = $"/ponudjaci/{id}-{v.GetProperty("slug").GetString()}";
        Assert.Contains("https://primjer.ba" + path, await LocsAsync());

        var res = await admin.PutAsJsonAsync($"/api/vendors/{id}/admin", new
        {
            ownerUserId = (int?)null,
            isActive = false,
            subscriptionPlanId = (int?)null,
            subscriptionExpiresAt = (DateTime?)null
        });
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        Assert.DoesNotContain("https://primjer.ba" + path, await LocsAsync());
    }
}

/// <summary>Bez Seo:SiteUrl adrese vode na prvi Cors:Origins (frontend).</summary>
public class SitemapFallbackTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Bez_site_url_koristi_frontend_iz_cors()
    {
        var body = await api.CreateClient().GetStringAsync("/sitemap.xml");
        Assert.Contains("<loc>http://localhost:4200/istrazi</loc>", body);
    }
}
