using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Planiraj.Tests;

/// <summary>Brisanje vlastitog profila.</summary>
public class DeleteAccountTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Mladenci_brisu_profil_podaci_se_anonimiziraju()
    {
        // seed nalog mladenaca ima rezervacije u budućnosti i recenzije
        var couple = await api.LoginAsync("mladenci", "Mladenci123!");
        var me = await couple.GetFromJsonAsync<JsonElement>("/api/auth/me");
        var userId = me.GetProperty("id").GetInt32();
        var bookingsBefore = (await couple.GetFromJsonAsync<JsonElement>("/api/bookings?pageSize=100")).GetProperty("items").GetArrayLength();
        Assert.True(bookingsBefore > 0);
        await couple.PostAsync("/api/favorites/1", null);
        await couple.PutAsJsonAsync("/api/plans/me", new { answers = new { categoryIds = new[] { 1 } }, items = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.NoContent, (await couple.DeleteAsync("/api/auth/me")).StatusCode);

        // stari token odmah prestaje važiti, a prijava više ne radi
        Assert.Equal(HttpStatusCode.Unauthorized, (await couple.GetAsync("/api/auth/me")).StatusCode);
        var relogin = await api.CreateClient().PostAsJsonAsync("/api/auth/login", new { login = "mladenci", password = "Mladenci123!" });
        Assert.Equal(HttpStatusCode.Unauthorized, relogin.StatusCode);

        var admin = await api.LoginAsync("admin", "Admin123!");
        var user = await admin.GetFromJsonAsync<JsonElement>($"/api/users/{userId}");
        Assert.Equal("Obrisan", user.GetProperty("firstName").GetString());
        Assert.Equal("korisnik", user.GetProperty("lastName").GetString());
        Assert.EndsWith("@obrisano.invalid", user.GetProperty("email").GetString());
        Assert.Equal(JsonValueKind.Null, user.GetProperty("phoneNumber").ValueKind);
        Assert.False(user.GetProperty("isActive").GetBoolean());

        // buduće rezervacije su otkazane i bez napomene; salon vidi da je profil obrisan
        var bookings = (await admin.GetFromJsonAsync<JsonElement>("/api/bookings?pageSize=100")).GetProperty("items")
            .EnumerateArray().Where(b => b.GetProperty("userId").GetInt32() == userId).ToList();
        Assert.Equal(bookingsBefore, bookings.Count);
        Assert.All(bookings, b =>
        {
            Assert.Equal("Cancelled", b.GetProperty("status").GetString());
            Assert.Equal(JsonValueKind.Null, b.GetProperty("note").ValueKind);
            Assert.Equal("Obrisan korisnik", b.GetProperty("userFullName").GetString());
        });

        // recenzije ostaju, ali bez imena
        var reviews = (await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/reviews?pageSize=100")).GetProperty("items")
            .EnumerateArray().Where(r => r.GetProperty("userId").GetInt32() == userId).ToList();
        Assert.NotEmpty(reviews);
        Assert.All(reviews, r => Assert.Equal("Obrisan korisnik", r.GetProperty("userFullName").GetString()));

        // obrisan nalog admin ne može ponovo uključiti
        var update = await admin.PutAsJsonAsync($"/api/users/{userId}", new
        {
            firstName = "Vrati", lastName = "Me", email = "vrati@gmail.com", username = "vrati", role = "Couple", isActive = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
    }

    [Fact]
    public async Task Google_korisnik_obrise_profil_pa_nova_prijava_pravi_novi()
    {
        var (client, first) = await api.GoogleAsync("brisanje");
        var oldId = first.GetProperty("user").GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/auth/me")).StatusCode);

        var (_, again) = await api.GoogleAsync("brisanje");
        Assert.True(again.GetProperty("isNew").GetBoolean());
        Assert.NotEqual(oldId, again.GetProperty("user").GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task Salon_ne_moze_sam_obrisati_nalog()
    {
        var salon = await api.LoginAsync("salon", "Salon123!");
        Assert.Equal(HttpStatusCode.BadRequest, (await salon.DeleteAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await salon.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Gost_ne_moze_brisati()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().DeleteAsync("/api/auth/me")).StatusCode);
    }
}
