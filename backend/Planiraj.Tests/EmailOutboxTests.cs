using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Planiraj.API.Email;
using Planiraj.Services.Database;
using Planiraj.Services.Email;

namespace Planiraj.Tests;

/// <summary>Obrada reda: slanje, ponovni pokušaji, zastarjele i nedozvoljene poruke, preusmjeravanje.</summary>
public class EmailOutboxTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private (PlanirajDbContext Db, EmailOutboxProcessor Processor, IServiceScope Scope) Create(EmailSettings settings)
    {
        var scope = api.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PlanirajDbContext>();
        var processor = new EmailOutboxProcessor(db, api.Emails, settings, new EmailRecipientPolicy(settings),
            TimeProvider.System, NullLogger<EmailOutboxProcessor>.Instance);
        return (db, processor, scope);
    }

    private static EmailMessage Message(string to, DateTime? createdAt = null, string? replyTo = null) => new()
    {
        Type = "test",
        ToAddress = to,
        ToName = "Primalac",
        ReplyTo = replyTo,
        Subject = "Probna poruka",
        HtmlBody = "<p>Zdravo</p>",
        TextBody = "Zdravo",
        AttachmentFileName = "termin.ics",
        AttachmentContentType = IcsCalendar.ContentType,
        AttachmentContent = "BEGIN:VCALENDAR",
        CreatedAt = createdAt ?? DateTime.UtcNow,
        NextAttemptAt = DateTime.UtcNow.AddSeconds(-1),
    };

    /// <summary>Testovi u klasi dijele bazu: svaki počinje od praznog reda.</summary>
    private async Task ResetAsync()
    {
        using var scope = api.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().EmailMessages.ExecuteDeleteAsync();
        api.Emails.Clear();
        api.Emails.Fail = false;
    }

    [Fact]
    public async Task Salje_poruke_i_preskace_nedozvoljene_i_zastarjele()
    {
        await ResetAsync();
        var (db, processor, scope) = Create(new EmailSettings { Mode = EmailMode.Log });
        using var _ = scope;
        var ok = Message("Mladenci@Gmail.com", replyTo: "salon@gmail.com");
        var deleted = Message("obrisan-5@obrisano.invalid");
        var old = Message("stara@gmail.com", createdAt: DateTime.UtcNow.AddDays(-2));
        var retained = Message("davno@gmail.com", createdAt: DateTime.UtcNow.AddDays(-40));
        retained.Status = EmailStatus.Sent;
        db.EmailMessages.AddRange(ok, deleted, old, retained);
        await db.SaveChangesAsync();

        Assert.Equal(3, await processor.ProcessAsync());

        Assert.Equal(EmailStatus.Sent, ok.Status);
        Assert.Equal("mladenci@gmail.com", ok.SentTo);
        Assert.Equal(EmailStatus.Skipped, deleted.Status);
        Assert.Equal(EmailStatus.Expired, old.Status);

        var sent = Assert.Single(api.Emails.Sent);
        Assert.Equal("mladenci@gmail.com", sent.To);
        Assert.Equal("salon@gmail.com", sent.ReplyTo);
        Assert.Equal("termin.ics", sent.Attachment?.FileName);

        // poslane poruke starije od RetentionDays se brišu (lični podaci)
        Assert.False(await db.EmailMessages.AnyAsync(m => m.Id == retained.Id));
    }

    [Fact]
    public async Task Neuspjelo_slanje_se_ponavlja_pa_odustaje()
    {
        await ResetAsync();
        var (db, processor, scope) = Create(new EmailSettings { Mode = EmailMode.Smtp, MaxAttempts = 3 });
        using var _ = scope;
        var message = Message("ponovo@gmail.com");
        db.EmailMessages.Add(message);
        await db.SaveChangesAsync();
        api.Emails.Fail = true;

        await processor.ProcessAsync();
        Assert.Equal(EmailStatus.Pending, message.Status);
        Assert.Equal(1, message.Attempts);
        Assert.True(message.NextAttemptAt > DateTime.UtcNow);
        Assert.Contains("nije dostupan", message.LastError);

        // dok ne dođe vrijeme novog pokušaja, poruka se ne dira
        await processor.ProcessAsync();
        Assert.Equal(1, message.Attempts);

        for (var i = 0; i < 2; i++)
        {
            message.NextAttemptAt = DateTime.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
            await processor.ProcessAsync();
        }
        Assert.Equal(EmailStatus.Failed, message.Status);
        Assert.Equal(3, message.Attempts);
        Assert.Empty(api.Emails.Sent);
        api.Emails.Fail = false;
    }

    [Fact]
    public async Task Preusmjeravanje_salje_sve_na_testnu_adresu_bez_reply_to()
    {
        await ResetAsync();
        var settings = new EmailSettings { Mode = EmailMode.Smtp, RedirectAllTo = "tester@moja-firma.ba" };
        var (db, processor, scope) = Create(settings);
        using var _ = scope;
        var message = Message("pravi.korisnik@gmail.com", replyTo: "mladenci@gmail.com");
        db.EmailMessages.Add(message);
        await db.SaveChangesAsync();

        await processor.ProcessAsync();

        var sent = Assert.Single(api.Emails.Sent);
        Assert.Equal("tester@moja-firma.ba", sent.To);
        Assert.Null(sent.ReplyTo);
        Assert.Equal("[za: pravi.korisnik@gmail.com] Probna poruka", sent.Subject);
        Assert.Equal("tester@moja-firma.ba", message.SentTo);
        Assert.Equal("pravi.korisnik@gmail.com", message.ToAddress);
    }

    [Fact]
    public async Task Lista_dozvoljenih_preskace_ostale()
    {
        await ResetAsync();
        var settings = new EmailSettings { Mode = EmailMode.Smtp, AllowedRecipients = ["@moja-firma.ba"] };
        var (db, processor, scope) = Create(settings);
        using var _ = scope;
        var allowed = Message("ja@moja-firma.ba");
        var other = Message("neko@gmail.com");
        db.EmailMessages.AddRange(allowed, other);
        await db.SaveChangesAsync();

        await processor.ProcessAsync();

        Assert.Equal(EmailStatus.Sent, allowed.Status);
        Assert.Equal(EmailStatus.Skipped, other.Status);
        Assert.Equal("ja@moja-firma.ba", Assert.Single(api.Emails.Sent).To);
    }
}

/// <summary>Pravila za primaoce i provjera postavki pri pokretanju (bez API-ja).</summary>
public class EmailPolicyTests
{
    [Theory]
    [InlineData("obrisan-3@obrisano.invalid")]
    [InlineData("neko@example.com")]
    [InlineData("neko@mail.example.org")]
    [InlineData("test@server.test")]
    [InlineData("racunar@kuca.local")]
    [InlineData("nije-adresa")]
    [InlineData("dva@@gmail.com")]
    [InlineData("")]
    public void Rezervisane_i_neispravne_adrese_se_preskacu(string address)
    {
        var decision = new EmailRecipientPolicy(new EmailSettings()).Resolve(address);
        Assert.False(decision.Allowed);
        Assert.NotNull(decision.SkipReason);
    }

    [Fact]
    public void Blokirane_domene_ukljucuju_poddomene()
    {
        var policy = new EmailRecipientPolicy(new EmailSettings { BlockedDomains = ["planiraj.ba"] });
        Assert.False(policy.Resolve("salon@planiraj.ba").Allowed);
        Assert.False(policy.Resolve("x@mail.planiraj.ba").Allowed);
        Assert.True(policy.Resolve("x@neplaniraj.ba").Allowed);
    }

    [Fact]
    public void Lista_dozvoljenih_prima_adrese_i_domene()
    {
        var policy = new EmailRecipientPolicy(new EmailSettings { AllowedRecipients = ["ja@gmail.com", "@firma.ba"] });
        Assert.True(policy.Resolve("JA@gmail.com").Allowed);
        Assert.True(policy.Resolve("bilo.ko@firma.ba").Allowed);
        Assert.False(policy.Resolve("ti@gmail.com").Allowed);
    }

    [Fact]
    public void Smtp_van_produkcije_trazi_preusmjeravanje_ili_listu()
    {
        var unsafeSettings = new EmailSettings
        {
            Mode = EmailMode.Smtp,
            FromAddress = "noreply@planiraj.ba",
            Smtp = new SmtpSettings { Host = "smtp.provajder.com" }
        };
        var ex = Assert.Throws<InvalidOperationException>(() => EmailSetup.Validate(unsafeSettings, isProduction: false));
        Assert.Contains("RedirectAllTo", ex.Message);

        EmailSetup.Validate(unsafeSettings, isProduction: true);
        unsafeSettings.RedirectAllTo = "ja@gmail.com";
        EmailSetup.Validate(unsafeSettings, isProduction: false);

        Assert.Throws<InvalidOperationException>(() => EmailSetup.Validate(
            new EmailSettings { Mode = EmailMode.Smtp, FromAddress = "noreply@planiraj.ba" }, isProduction: true));
        Assert.Throws<InvalidOperationException>(() => EmailSetup.Validate(
            new EmailSettings { Mode = EmailMode.Smtp, Smtp = new SmtpSettings { Host = "smtp.provajder.com" } }, isProduction: true));
    }

    [Fact]
    public void Kalendar_escapeuje_i_lomi_duge_redove()
    {
        var ics = IcsCalendar.Event("booking-1@planiraj.ba", new DateOnly(2027, 6, 12), null,
            "Sala; Panorama, Sarajevo", "Prvi red\nDrugi red " + new string('š', 80), null, new DateTime(2026, 11, 10, 12, 0, 0, DateTimeKind.Utc));

        Assert.Contains("DTSTART;VALUE=DATE:20270612\r\n", ics);
        Assert.Contains("DTEND;VALUE=DATE:20270613\r\n", ics);
        Assert.Contains("SUMMARY:Sala\\; Panorama\\, Sarajevo\r\n", ics);
        Assert.Contains("DESCRIPTION:Prvi red\\nDrugi red", ics);
        Assert.All(ics.Split("\r\n"), line => Assert.True(System.Text.Encoding.UTF8.GetByteCount(line) <= 75, line));
        Assert.EndsWith("END:VCALENDAR\r\n", ics);
    }
}
