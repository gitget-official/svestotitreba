using Microsoft.Extensions.Logging;
using Planiraj.Services.Database;

namespace Planiraj.Services.Email;

/// <summary>Gotov sadržaj poruke (naslov, HTML, tekst i eventualni prilog).</summary>
public sealed record EmailContent(string Subject, string Html, string Text, EmailAttachment? Attachment = null);

public sealed record EmailAttachment(string FileName, string ContentType, string Content);

/// <summary>Primalac poruke.</summary>
public sealed record EmailRecipient(string Address, string? Name);

/// <summary>Upisuje e-mailove u red za slanje. Ne poziva SaveChanges: poruka se snima zajedno sa promjenom koja ju je izazvala.</summary>
public interface IEmailOutbox
{
    /// <summary>Vraća true ako je poruka dodana u red (false kad je e-mail isključen ili primalac nije dozvoljen).</summary>
    bool Queue(string type, EmailRecipient to, EmailContent content, int? relatedId = null, string? replyTo = null);
}

public class EmailOutbox(
    PlanirajDbContext context,
    EmailSettings settings,
    EmailRecipientPolicy policy,
    TimeProvider time,
    ILogger<EmailOutbox> logger) : IEmailOutbox
{
    public bool Queue(string type, EmailRecipient to, EmailContent content, int? relatedId = null, string? replyTo = null)
    {
        if (settings.Mode == EmailMode.Disabled)
            return false;

        var decision = policy.Resolve(to.Address);
        if (!decision.Allowed)
        {
            logger.LogInformation("E-mail {Type} nije dodan u red: {Reason}", type, decision.SkipReason);
            return false;
        }

        var now = time.GetUtcNow().UtcDateTime;
        context.EmailMessages.Add(new EmailMessage
        {
            Type = type,
            ToAddress = to.Address.Trim().ToLowerInvariant(),
            ToName = Clip(to.Name, 200),
            ReplyTo = replyTo != null && EmailRecipientPolicy.IsValid(replyTo) ? replyTo : null,
            Subject = Clip(content.Subject, 300)!,
            HtmlBody = content.Html,
            TextBody = content.Text,
            AttachmentFileName = content.Attachment?.FileName,
            AttachmentContentType = content.Attachment?.ContentType,
            AttachmentContent = content.Attachment?.Content,
            RelatedId = relatedId,
            Status = EmailStatus.Pending,
            CreatedAt = now,
            NextAttemptAt = now
        });
        return true;
    }

    private static string? Clip(string? value, int max) =>
        value == null ? null : value.Length > max ? value[..max] : value;
}
