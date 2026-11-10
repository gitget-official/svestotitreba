using System.Net.Mail;

namespace Planiraj.Services.Email;

/// <summary>Rezultat provjere primaoca: na koju adresu stvarno ide poruka ili zašto se preskače.</summary>
public sealed record RecipientDecision(string? Address, string? SkipReason, bool Redirected)
{
    public bool Allowed => Address != null;

    public static RecipientDecision Skip(string reason) => new(null, reason, false);
}

/// <summary>
/// Zaštita od slanja pogrešnim ljudima. Provjerava se i kad poruka ulazi u red i neposredno prije slanja
/// (postavke su se mogle promijeniti u međuvremenu).
/// </summary>
public class EmailRecipientPolicy(EmailSettings settings)
{
    /// <summary>Domene koje po standardu (RFC 2606, RFC 6761) nikad nisu stvarne adrese.</summary>
    private static readonly string[] ReservedSuffixes = [".invalid", ".test", ".example", ".localhost", ".local"];
    private static readonly string[] ReservedDomains = ["example.com", "example.net", "example.org", "localhost"];

    public RecipientDecision Resolve(string? address)
    {
        if (string.IsNullOrWhiteSpace(address))
            return RecipientDecision.Skip("Nema adrese primaoca.");

        var email = address.Trim().ToLowerInvariant();
        if (!IsValid(email))
            return RecipientDecision.Skip("Neispravna adresa primaoca.");

        var domain = email[(email.LastIndexOf('@') + 1)..];
        if (ReservedDomains.Any(d => Matches(domain, d)) || ReservedSuffixes.Any(domain.EndsWith))
            return RecipientDecision.Skip("Rezervisana domena (nije stvarna adresa).");

        if (settings.BlockedDomains.Any(d => Matches(domain, d.Trim().TrimStart('@').ToLowerInvariant())))
            return RecipientDecision.Skip("Domena je blokirana (Email:BlockedDomains).");

        var allowed = settings.AllowedRecipients.Where(a => !string.IsNullOrWhiteSpace(a)).ToArray();
        if (allowed.Length > 0 && !allowed.Any(a => AllowedMatches(email, domain, a.Trim().ToLowerInvariant())))
            return RecipientDecision.Skip("Primalac nije na listi dozvoljenih (Email:AllowedRecipients).");

        if (!string.IsNullOrWhiteSpace(settings.RedirectAllTo))
            return new RecipientDecision(settings.RedirectAllTo.Trim(), null, Redirected: true);

        return new RecipientDecision(email, null, Redirected: false);
    }

    public static bool IsValid(string email)
    {
        if (email.Length > 256 || email.Contains(' ') || email.Count(c => c == '@') != 1)
            return false;
        try
        {
            var parsed = new MailAddress(email);
            return parsed.Address.Equals(email, StringComparison.OrdinalIgnoreCase) && parsed.Host.Contains('.');
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>Domena ili njena poddomena (mail.example.com odgovara example.com).</summary>
    private static bool Matches(string domain, string blocked) =>
        blocked.Length > 0 && (domain == blocked || domain.EndsWith("." + blocked));

    private static bool AllowedMatches(string email, string domain, string entry) =>
        entry.StartsWith('@') ? Matches(domain, entry[1..]) : email == entry;
}
