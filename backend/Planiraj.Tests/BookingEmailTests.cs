using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Planiraj.Services.Database;

namespace Planiraj.Tests;

/// <summary>Testovi rade u Log načinu sa adresom sajta, da se vide i linkovi u porukama.</summary>
public class EmailApiFactory : ApiFactory
{
    protected override Dictionary<string, string?> Settings => new(base.Settings)
    {
        ["Email:Mode"] = "Log",
        ["Email:SiteUrl"] = "https://planiraj.test/",
    };
}

/// <summary>E-mail obavijesti o rezervacijama (FR-15): ko dobija poruku za koji događaj.</summary>
public class BookingEmailTests(EmailApiFactory api) : IClassFixture<EmailApiFactory>
{
    private const string Amra = "Studio ljepote Amra";         // vlasnik je seed nalog "salon", ručna potvrda
    private const string Panorama = "Sala Panorama";            // bez vlasnika, ručna potvrda
    private const string Oldtimer = "Oldtimer Klasik";          // bez vlasnika, automatska potvrda
    private const string SalonEmail = "salon@planiraj.ba";

    private static int _day = 200;

    private static string NextDate() =>
        DateOnly.FromDateTime(DateTime.Today.AddDays(Interlocked.Increment(ref _day))).ToString("yyyy-MM-dd");

    private int VendorId(string name)
    {
        using var scope = api.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().Vendors.Single(v => v.Name == name).Id;
    }

    private List<EmailMessage> Messages(int bookingId)
    {
        using var scope = api.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().EmailMessages.AsNoTracking()
            .Where(m => m.RelatedId == bookingId).OrderBy(m => m.Id).ToList();
    }

    private async Task<int> CreateBookingAsync(HttpClient couple, string vendor, string? note = null)
    {
        var res = await couple.PostAsJsonAsync("/api/bookings",
            new { vendorId = VendorId(vendor), eventDate = NextDate(), startTime = "17:30:00", note });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    [Fact]
    public async Task Novi_zahtjev_obavjestava_salon_i_mladence_a_napomena_je_enkodirana()
    {
        var (couple, _) = await api.GoogleAsync("ana");
        var id = await CreateBookingAsync(couple, Amra, "<b>Probna</b> frizura & šminka");

        var messages = Messages(id);
        Assert.Equal(2, messages.Count);

        var vendor = messages.Single(m => m.ToAddress == SalonEmail);
        Assert.Equal("booking.created.vendor", vendor.Type);
        Assert.Equal(EmailStatus.Pending, vendor.Status);
        Assert.StartsWith("Novi zahtjev za termin", vendor.Subject);
        Assert.Equal("ana@gmail.com", vendor.ReplyTo);                    // salon odgovara direktno mladencima
        Assert.Contains("ana@gmail.com", vendor.TextBody);
        Assert.Contains("&lt;b&gt;Probna&lt;/b&gt;", vendor.HtmlBody);    // korisnički unos ne može ubaciti HTML
        Assert.DoesNotContain("<b>Probna</b>", vendor.HtmlBody);
        Assert.Contains("<b>Probna</b> frizura & šminka", vendor.TextBody);
        Assert.Contains("https://planiraj.test/salon/rezervacije", vendor.HtmlBody);
        Assert.Contains("17:30", vendor.TextBody);

        var mine = messages.Single(m => m.ToAddress == "ana@gmail.com");
        Assert.Equal("booking.created.couple", mine.Type);
        Assert.Contains("https://planiraj.test/moje-rezervacije", mine.TextBody);
        Assert.Null(mine.AttachmentContent);
    }

    [Fact]
    public async Task Salon_bez_vlasnika_ne_dobija_nista_i_javni_kontakt_se_nikad_ne_koristi()
    {
        var (couple, _) = await api.GoogleAsync("bojana");
        var id = await CreateBookingAsync(couple, Panorama);

        var messages = Messages(id);
        Assert.Equal("bojana@gmail.com", Assert.Single(messages).ToAddress);

        // Javni e-mailovi sa stranica salona (seed: info@{slug}.ba) nikad ne dobijaju poruke.
        using var scope = api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PlanirajDbContext>();
        var vendorEmails = db.Vendors.Where(v => v.Email != null).Select(v => v.Email!.ToLower()).ToList();
        Assert.DoesNotContain(db.EmailMessages.Select(m => m.ToAddress).ToList(), vendorEmails.Contains);
    }

    [Fact]
    public async Task Automatska_potvrda_salje_mladencima_potvrdu_sa_kalendarom()
    {
        var (couple, _) = await api.GoogleAsync("cvijeta");
        var id = await CreateBookingAsync(couple, Oldtimer);

        var confirmed = Assert.Single(Messages(id));
        Assert.Equal("booking.confirmed.couple", confirmed.Type);
        Assert.StartsWith("Termin je potvrđen", confirmed.Subject);
        Assert.Equal("termin.ics", confirmed.AttachmentFileName);
        Assert.Contains("BEGIN:VEVENT", confirmed.AttachmentContent);
        Assert.Contains($"UID:booking-{id}@planiraj.test", confirmed.AttachmentContent);
        Assert.Contains("T173000", confirmed.AttachmentContent);
    }

    [Fact]
    public async Task Potvrda_ide_mladencima_a_ne_salonu_koji_je_potvrdio()
    {
        var (couple, _) = await api.GoogleAsync("dina");
        var id = await CreateBookingAsync(couple, Amra);
        var salon = await api.LoginAsync("salon", "Salon123!");

        Assert.Equal(HttpStatusCode.OK, (await salon.PutAsync($"/api/bookings/{id}/confirm", null)).StatusCode);

        var messages = Messages(id);
        var confirmed = messages.Single(m => m.Type == "booking.confirmed.couple");
        Assert.Equal("dina@gmail.com", confirmed.ToAddress);
        Assert.Contains("BEGIN:VCALENDAR", confirmed.AttachmentContent);
        Assert.DoesNotContain(messages, m => m.Type == "booking.confirmed.vendor");
    }

    [Fact]
    public async Task Odbijanje_salje_mladencima_poruku_salona()
    {
        var (couple, _) = await api.GoogleAsync("elma");
        var id = await CreateBookingAsync(couple, Amra);
        var salon = await api.LoginAsync("salon", "Salon123!");

        var res = await salon.PutAsJsonAsync($"/api/bookings/{id}/reject", new { note = "Taj dan smo već zauzeti." });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var rejected = Messages(id).Single(m => m.Type == "booking.rejected.couple");
        Assert.Equal("elma@gmail.com", rejected.ToAddress);
        Assert.Contains("Taj dan smo već zauzeti.", rejected.TextBody);
        Assert.Contains("https://planiraj.test/istrazi", rejected.TextBody);
    }

    [Fact]
    public async Task Otkazivanje_mladenaca_obavjestava_samo_salon()
    {
        var (couple, _) = await api.GoogleAsync("fata");
        var id = await CreateBookingAsync(couple, Amra);

        var res = await couple.PutAsJsonAsync($"/api/bookings/{id}/cancel", new { note = "Promijenili smo datum." });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var cancelled = Messages(id).Where(m => m.Type.StartsWith("booking.cancelled")).ToList();
        var vendor = Assert.Single(cancelled);
        Assert.Equal(SalonEmail, vendor.ToAddress);
        Assert.StartsWith("Mladenci su otkazali termin", vendor.Subject);
        Assert.Contains("Promijenili smo datum.", vendor.TextBody);
    }

    [Fact]
    public async Task Admin_otkazuje_obje_strane_dobijaju_poruku()
    {
        var (couple, _) = await api.GoogleAsync("gordana");
        var id = await CreateBookingAsync(couple, Amra);
        var admin = await api.LoginAsync("admin", "Admin123!");

        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/bookings/{id}/cancel", new { note = "Salon je zatvoren." })).StatusCode);

        var cancelled = Messages(id).Where(m => m.Type.StartsWith("booking.cancelled")).ToList();
        Assert.Equal(2, cancelled.Count);
        Assert.Contains(cancelled, m => m.ToAddress == SalonEmail && m.Type == "booking.cancelled.vendor");
        Assert.Contains(cancelled, m => m.ToAddress == "gordana@gmail.com" && m.Type == "booking.cancelled.couple");
    }

    [Fact]
    public async Task Izmjena_zahtjeva_obavjestava_salon()
    {
        var (couple, _) = await api.GoogleAsync("hana");
        var id = await CreateBookingAsync(couple, Amra);

        var res = await couple.PutAsJsonAsync($"/api/bookings/{id}", new { eventDate = NextDate(), startTime = "11:00:00", note = "Ipak ujutro." });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var updated = Messages(id).Single(m => m.Type == "booking.updated.vendor");
        Assert.Equal(SalonEmail, updated.ToAddress);
        Assert.Contains("11:00", updated.TextBody);
        Assert.Contains("Ipak ujutro.", updated.TextBody);
        Assert.DoesNotContain(Messages(id), m => m.Type == "booking.updated.couple");
    }

    [Fact]
    public async Task Brisanje_profila_javlja_salonu_bez_podataka_mladenaca_i_brise_neposlane_poruke()
    {
        var (couple, _) = await api.GoogleAsync("brisanje");
        var id = await CreateBookingAsync(couple, Amra, "Napomena koja se briše.");
        Assert.Contains(Messages(id), m => m.ToAddress == "brisanje@gmail.com");

        Assert.Equal(HttpStatusCode.NoContent, (await couple.DeleteAsync("/api/auth/me")).StatusCode);

        var messages = Messages(id);
        Assert.DoesNotContain(messages, m => m.ToAddress == "brisanje@gmail.com");   // neposlana poruka mladencima je obrisana
        var notice = messages.Single(m => m.Type == "booking.cancelled.vendor");
        Assert.Equal(SalonEmail, notice.ToAddress);
        Assert.Contains("obrisali svoj profil", notice.TextBody);
        Assert.DoesNotContain("brisanje@gmail.com", notice.TextBody);
        Assert.DoesNotContain("brisanje@gmail.com", notice.HtmlBody);
        Assert.Null(notice.ReplyTo);
        Assert.DoesNotContain("Test Korisnik", notice.TextBody);
    }
}

/// <summary>Zadano (Email:Mode = Disabled) se ništa ne upisuje u red.</summary>
public class DisabledEmailFactory : ApiFactory
{
    protected override Dictionary<string, string?> Settings => new(base.Settings) { ["Email:Mode"] = "Disabled" };
}

public class DisabledEmailTests(DisabledEmailFactory api) : IClassFixture<DisabledEmailFactory>
{
    [Fact]
    public async Task Iskljucen_email_ne_upisuje_nista()
    {
        var (couple, _) = await api.GoogleAsync("isklj");
        int vendorId;
        using (var scope = api.Services.CreateScope())
            vendorId = scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().Vendors.Single(v => v.Name == "Studio ljepote Amra").Id;

        var res = await couple.PostAsJsonAsync("/api/bookings",
            new { vendorId, eventDate = DateOnly.FromDateTime(DateTime.Today.AddDays(90)).ToString("yyyy-MM-dd") });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        using var check = api.Services.CreateScope();
        Assert.Empty(check.ServiceProvider.GetRequiredService<PlanirajDbContext>().EmailMessages);
    }
}
