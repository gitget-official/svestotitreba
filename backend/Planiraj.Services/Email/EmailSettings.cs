namespace Planiraj.Services.Email;

/// <summary>Šta se radi sa e-mailovima.</summary>
public enum EmailMode
{
    /// <summary>Zadano: ništa se ne upisuje u red i ništa se ne šalje.</summary>
    Disabled,
    /// <summary>Poruke idu u red, a "slanje" ih samo zapiše u log. Za razvoj i probu.</summary>
    Log,
    /// <summary>Stvarno slanje preko SMTP servera (Brevo, Mailjet, Postmark, Amazon SES...).</summary>
    Smtp
}

/// <summary>Sekcija "Email" u appsettings.json.</summary>
public class EmailSettings
{
    public const string SectionName = "Email";

    public EmailMode Mode { get; set; } = EmailMode.Disabled;

    public string FromAddress { get; set; } = string.Empty;
    /// <summary>Ime pošiljaoca i naziv platforme u porukama.</summary>
    public string FromName { get; set; } = "Planiraj";

    /// <summary>
    /// Adresa frontenda za linkove u porukama. Ako je prazno, uzima se Seo:SiteUrl, pa prvi Cors:Origins.
    /// </summary>
    public string? SiteUrl { get; set; }

    /// <summary>
    /// Ako je postavljeno, SVE poruke idu na ovu adresu (originalni primalac piše u naslovu).
    /// Za razvoj i testni server, da nijedna poruka ne ode pravom korisniku.
    /// </summary>
    public string? RedirectAllTo { get; set; }

    /// <summary>
    /// Ako lista nije prazna, šalje se samo na ove adrese. Stavka može biti cijela adresa
    /// ("ja@gmail.com") ili domena sa @ ("@moja-firma.ba"). Ostale poruke se preskaču.
    /// </summary>
    public string[] AllowedRecipients { get; set; } = [];

    /// <summary>Domene na koje se nikad ne šalje (uz ugrađene rezervisane domene: .invalid, .test, example.com...).</summary>
    public string[] BlockedDomains { get; set; } = [];

    /// <summary>Pokreće pozadinsko slanje. U testovima je isključeno (testovi pozivaju obradu ručno).</summary>
    public bool DispatcherEnabled { get; set; } = true;
    public int PollSeconds { get; set; } = 15;
    public int BatchSize { get; set; } = 20;
    public int MaxAttempts { get; set; } = 5;
    /// <summary>Poruka starija od ovoga se više ne šalje (npr. poslije dužeg prekida, da ne ode gomila zastarjelih obavijesti).</summary>
    public int MaxAgeHours { get; set; } = 24;
    /// <summary>Koliko dana se čuvaju poslane i neuspjele poruke (sadrže lične podatke), pa se brišu.</summary>
    public int RetentionDays { get; set; } = 30;

    public SmtpSettings Smtp { get; set; } = new();
}

public class SmtpSettings
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string? Username { get; set; }
    /// <summary>Tajna: postavlja se preko varijable okruženja Email__Smtp__Password, nikad u appsettings.json.</summary>
    public string? Password { get; set; }
    /// <summary>"StartTls" (port 587, zadano), "SslOnConnect" (port 465) ili "None" (samo lokalni testni server).</summary>
    public string Security { get; set; } = "StartTls";
}
