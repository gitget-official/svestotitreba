using Planiraj.Model.Dtos;
using Planiraj.Services.Database;
using Planiraj.Services.Email;

namespace Planiraj.Services.Notifications;

/// <summary>
/// Događaji poruka u stvarnom vremenu (implementacija je SignalR u API projektu). Svaki učesnik dobija razgovor
/// viđen sa svoje strane. Greška ovdje ne smije oboriti zahtjev: poruka je već snimljena, a preglednik je dobija
/// i pri sljedećem učitavanju.
/// </summary>
public interface IChatRealtime
{
    /// <summary>Nova poruka u razgovoru.</summary>
    Task MessageAsync(int userId, ChatSendResultDto payload);

    /// <summary>Razgovor se promijenio bez nove poruke (npr. druga strana je pročitala poruke).</summary>
    Task ConversationAsync(int userId, ConversationDto conversation);
}

/// <summary>E-mail o novoj poruci (FR-15).</summary>
public interface IChatEmailNotifier
{
    /// <summary>Dodaje e-mail u red (bez SaveChanges; snima se zajedno sa porukom).</summary>
    void Queue(Conversation conversation, ChatMessage message, User recipient);
}

/// <summary>
/// E-mail o novoj poruci. ChatService ga traži samo za prvu nepročitanu poruku u razgovoru, pa primalac ne dobija
/// e-mail za svaku poruku dok ne otvori razgovor. Salonu se piše samo na e-mail naloga vlasnika (kao za rezervacije).
/// </summary>
public class ChatEmailNotifier(IEmailOutbox outbox, EmailSettings settings) : IChatEmailNotifier
{
    /// <summary>Koliko teksta poruke ide u e-mail; ostatak se čita na platformi.</summary>
    private const int QuoteLength = 500;

    public void Queue(Conversation conversation, ChatMessage message, User recipient)
    {
        var b = new EmailBuilder(settings.FromName, settings.SiteUrl);
        var vendor = conversation.Vendor;
        var couple = conversation.CoupleUser;
        var text = message.Body.Length > QuoteLength ? message.Body[..QuoteLength] + "…" : message.Body;

        string type, subject;
        if (message.FromVendor)
        {
            type = "chat.message.couple";
            subject = $"Nova poruka: {vendor.Name}";
            b.Preheader(Preheader(text))
             .Heading("Nova poruka od salona")
             .Paragraph($"Salon „{vendor.Name}“ vam je poslao poruku.")
             .Quote("Poruka", text)
             .Button("Otvorite poruke", $"/poruke/{conversation.Id}")
             .Footer("Ovu poruku ste dobili jer ste pisali salonu putem platforme. Sljedeći e-mail o ovom razgovoru dobijate tek kad pročitate nove poruke.");
        }
        else
        {
            var name = $"{couple.FirstName} {couple.LastName}".Trim();
            type = "chat.message.vendor";
            subject = $"Nova poruka: {name}";
            b.Preheader(Preheader(text))
             .Heading("Nova poruka od mladenaca")
             .Paragraph($"Mladenci {name} su vam poslali poruku preko stranice „{vendor.Name}“.")
             .Quote("Poruka", text)
             .Button("Odgovorite", $"/salon/poruke/{conversation.Id}")
             .Footer($"Ovu poruku ste dobili jer upravljate stranicom „{vendor.Name}“ na {settings.FromName}. Sljedeći e-mail o ovom razgovoru dobijate tek kad pročitate nove poruke.");
        }

        outbox.Queue(type, new EmailRecipient(recipient.Email, $"{recipient.FirstName} {recipient.LastName}".Trim()),
            b.Build(subject), conversation.Id);
    }

    private static string Preheader(string text) => text.Length > 90 ? text[..90] + "…" : text;
}
