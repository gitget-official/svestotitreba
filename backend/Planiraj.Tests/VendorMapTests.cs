using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Planiraj.Services.Database;

namespace Planiraj.Tests;

/// <summary>Javna mapa ponuđača na početnoj: /api/vendors/map.</summary>
public class VendorMapTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _guest = api.CreateClient();

    private async Task<List<JsonElement>> PointsAsync()
    {
        var res = await _guest.GetAsync("/api/vendors/map");
        Assert.True(res.StatusCode == HttpStatusCode.OK, await res.Content.ReadAsStringAsync());
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
    }

    private async Task WithDbAsync(Func<PlanirajDbContext, Task> action)
    {
        using var scope = api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PlanirajDbContext>();
        await action(db);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Gost_dobija_sve_aktivne_ponudjace_sa_lokacijom()
    {
        var points = await PointsAsync();
        // Ostali testovi u klasi mijenjaju bazu, pa se očekivani broj računa iz nje, a ne iz seeda.
        var expected = 0;
        await WithDbAsync(async db => expected = await db.Vendors.CountAsync(v => v.IsActive
            && ((v.Latitude != null && v.Longitude != null) || (v.City.Latitude != null && v.City.Longitude != null))));
        Assert.True(expected > 20);
        Assert.Equal(expected, points.Count);

        var p = points[0];
        Assert.False(string.IsNullOrEmpty(p.GetProperty("name").GetString()));
        Assert.False(string.IsNullOrEmpty(p.GetProperty("cityName").GetString()));
        Assert.InRange(p.GetProperty("latitude").GetDouble(), 42.5, 45.3);
        Assert.InRange(p.GetProperty("longitude").GetDouble(), 15.7, 19.7);
        Assert.NotEmpty(p.GetProperty("categories").EnumerateArray());
    }

    [Fact]
    public async Task Mapa_ne_otkriva_kontakte_ni_adresu()
    {
        var p = (await PointsAsync())[0];
        foreach (var hidden in new[] { "phoneNumber", "email", "address", "ownerUserId", "website" })
            Assert.False(p.TryGetProperty(hidden, out _), hidden);
    }

    [Fact]
    public async Task Ponudjac_bez_lokacije_je_u_centru_grada()
    {
        int id = 0;
        double cityLat = 0, cityLon = 0;
        await WithDbAsync(async db =>
        {
            var v = await db.Vendors.Include(x => x.City).Where(x => x.IsActive).OrderBy(x => x.Id).FirstAsync();
            v.Latitude = null;
            v.Longitude = null;
            id = v.Id;
            cityLat = v.City.Latitude!.Value;
            cityLon = v.City.Longitude!.Value;
        });

        var p = (await PointsAsync()).Single(x => x.GetProperty("id").GetInt32() == id);
        Assert.True(p.GetProperty("isApproximate").GetBoolean());
        Assert.Equal(cityLat, p.GetProperty("latitude").GetDouble(), 6);
        Assert.Equal(cityLon, p.GetProperty("longitude").GetDouble(), 6);
    }

    [Fact]
    public async Task Bez_lokacije_i_bez_centra_grada_nema_tacke()
    {
        int id = 0;
        await WithDbAsync(async db =>
        {
            var city = new City { Name = "Grad bez centra" };
            db.Cities.Add(city);
            var v = await db.Vendors.Where(x => x.IsActive).OrderByDescending(x => x.Id).FirstAsync();
            v.Latitude = null;
            v.Longitude = null;
            v.City = city;
            id = v.Id;
        });

        Assert.DoesNotContain(await PointsAsync(), x => x.GetProperty("id").GetInt32() == id);
    }

    [Fact]
    public async Task Iskljucen_ponudjac_nije_na_mapi()
    {
        var admin = await api.LoginAsync("admin", "Admin123!");
        var id = (await PointsAsync())[1].GetProperty("id").GetInt32();

        var res = await admin.PutAsJsonAsync($"/api/vendors/{id}/admin", new
        {
            ownerUserId = (int?)null,
            isActive = false,
            subscriptionPlanId = (int?)null,
            subscriptionExpiresAt = (DateTime?)null
        });
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        Assert.DoesNotContain(await PointsAsync(), x => x.GetProperty("id").GetInt32() == id);
    }
}
