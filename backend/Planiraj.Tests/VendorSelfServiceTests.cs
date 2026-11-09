using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Planiraj.Tests;

/// <summary>Salon se sam registruje preko Googlea, postavlja svoju stranicu i uploaduje slike; admin može isto za njega.</summary>
public class VendorSelfServiceTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private static readonly byte[] Png =
        Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private static object NewVendor(string name) => new
    {
        name,
        cityId = 1,
        description = "Opis salona.",
        address = "Ulica 1",
        phoneNumber = "+387 61 000 000",
        bookingEnabled = false,
        ownerUserId = 1 // salon ne može postaviti drugog vlasnika: server ga zanemari
    };

    private static MultipartFormDataContent File(byte[] bytes, string name = "slika.png")
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(file, "file", name);
        return content;
    }

    [Fact]
    public async Task Salon_se_registruje_preko_Googlea_i_postavlja_stranicu()
    {
        var (salon, auth) = await api.GoogleSalonAsync("salon-novi");
        Assert.True(auth.GetProperty("isNew").GetBoolean());
        var me = auth.GetProperty("user");
        Assert.Equal("Vendor", me.GetProperty("role").GetString());

        var res = await salon.PostAsJsonAsync("/api/vendors", NewVendor("Sala Novi Početak"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var vendor = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(me.GetProperty("id").GetInt32(), vendor.GetProperty("ownerUserId").GetInt32());
        Assert.True(vendor.GetProperty("isActive").GetBoolean());
        var id = vendor.GetProperty("id").GetInt32();

        // odmah javno vidljiv, bez odobrenja
        Assert.Equal(HttpStatusCode.OK, (await api.CreateClient().GetAsync($"/api/vendors/{id}")).StatusCode);

        // drugi salon na istom nalogu ide preko administratora
        Assert.Equal(HttpStatusCode.BadRequest, (await salon.PostAsJsonAsync("/api/vendors", NewVendor("Drugi"))).StatusCode);

        // sam uređuje tekst i dodaje usluge
        var offering = await salon.PostAsJsonAsync("/api/offerings", new
        {
            vendorId = id, serviceCategoryId = 1, title = "Paket do 200 gostiju", priceFrom = 3000, priceTo = 6000, isActive = true
        });
        Assert.Equal(HttpStatusCode.OK, offering.StatusCode);

        // ponovna prijava istim Google nalogom: isti salon, nije novi
        var (_, again) = await api.GoogleSalonAsync("salon-novi");
        Assert.False(again.GetProperty("isNew").GetBoolean());
    }

    [Fact]
    public async Task Salon_uploaduje_sliku_i_ona_se_servira()
    {
        var (salon, _) = await api.GoogleSalonAsync("salon-slike");
        var vendor = await (await salon.PostAsJsonAsync("/api/vendors", NewVendor("Foto Studio Slika"))).Content.ReadFromJsonAsync<JsonElement>();
        var id = vendor.GetProperty("id").GetInt32();

        var up = await salon.PostAsync($"/api/uploads/vendors/{id}", File(Png));
        Assert.Equal(HttpStatusCode.OK, up.StatusCode);
        var url = (await up.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
        Assert.StartsWith($"/api/uploads/vendors/{id}/", url);
        Assert.EndsWith(".png", url);

        var served = await api.CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal(Png, await served.Content.ReadAsByteArrayAsync());

        // slika u galeriju i kao logo
        Assert.Equal(HttpStatusCode.OK, (await salon.PostAsJsonAsync("/api/vendorimages", new { vendorId = id, url, isCover = true })).StatusCode);
        var images = await api.CreateClient().GetFromJsonAsync<JsonElement>($"/api/vendorimages?vendorId={id}");
        Assert.Equal(url, images.GetProperty("items")[0].GetProperty("url").GetString());
    }

    [Fact]
    public async Task Upload_odbija_pogresan_fajl_i_tudji_salon()
    {
        var (salon, _) = await api.GoogleSalonAsync("salon-zastita");
        var vendor = await (await salon.PostAsJsonAsync("/api/vendors", NewVendor("Torte Zaštita"))).Content.ReadFromJsonAsync<JsonElement>();
        var id = vendor.GetProperty("id").GetInt32();

        // tekst preimenovan u .png
        Assert.Equal(HttpStatusCode.BadRequest, (await salon.PostAsync($"/api/uploads/vendors/{id}", File("nije slika"u8.ToArray()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await salon.PostAsync($"/api/uploads/vendors/{id}", new MultipartFormDataContent())).StatusCode);

        // drugi salon ne može uploadovati u tuđi salon, gost ni u jedan
        var (other, _) = await api.GoogleSalonAsync("salon-drugi");
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PostAsync($"/api/uploads/vendors/{id}", File(Png))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().PostAsync($"/api/uploads/vendors/{id}", File(Png))).StatusCode);

        // mladenci ne mogu praviti salon
        var (couple, _) = await api.GoogleAsync("mladenci-salon");
        Assert.Equal(HttpStatusCode.Forbidden, (await couple.PostAsJsonAsync("/api/vendors", NewVendor("Ne"))).StatusCode);
    }

    [Fact]
    public async Task Admin_radi_sve_isto_za_salon()
    {
        var (salon, auth) = await api.GoogleSalonAsync("salon-admin");
        var vendor = await (await salon.PostAsJsonAsync("/api/vendors", NewVendor("Muzika Admin"))).Content.ReadFromJsonAsync<JsonElement>();
        var id = vendor.GetProperty("id").GetInt32();

        var admin = await api.LoginAsync("admin", "Admin123!");
        var up = await admin.PostAsync($"/api/uploads/vendors/{id}", File(Png));
        Assert.Equal(HttpStatusCode.OK, up.StatusCode);
        var url = (await up.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString();
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/vendorimages", new { vendorId = id, url })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/offerings", new
        {
            vendorId = id, serviceCategoryId = 1, title = "Bend", priceFrom = 800, priceTo = 1500, isActive = true
        })).StatusCode);

        // admin pravi salon za nekoga ko ne želi sam (i dodjeljuje vlasnika)
        var created = await admin.PostAsJsonAsync("/api/vendors", new { name = "Salon Za Klijenta", cityId = 1 });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
    }

    [Fact]
    public async Task Mladenci_i_salon_su_odvojeni_nalozi()
    {
        await api.GoogleAsync("isti-covjek");
        var res = await api.CreateClient().PostAsJsonAsync("/api/auth/google/salon", new { credential = "isti-covjek" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("profil mladenaca", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Salon_koji_je_napravio_admin_se_povezuje_sa_Googleom_po_emailu()
    {
        // admin napravi nalog salona sa e-mailom vlasnik@gmail.com; lažni Google za "vlasnik" daje isti e-mail.
        // Sa stranice mladenaca se ne smije prijaviti kao par, a sa stranice salona se poveže sa postojećim nalogom.
        var admin = await api.LoginAsync("admin", "Admin123!");
        var create = await admin.PostAsJsonAsync("/api/users", new
        {
            firstName = "Vlasnik", lastName = "Salona", email = "vlasnik@gmail.com", username = "vlasnik", role = "Vendor", password = "Lozinka123!"
        });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var userId = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        var asCouple = await api.CreateClient().PostAsJsonAsync("/api/auth/google", new { credential = "vlasnik" });
        Assert.Equal(HttpStatusCode.BadRequest, asCouple.StatusCode);

        var (_, auth) = await api.GoogleSalonAsync("vlasnik");
        Assert.False(auth.GetProperty("isNew").GetBoolean());
        Assert.Equal(userId, auth.GetProperty("user").GetProperty("id").GetInt32());
    }
}
