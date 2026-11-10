using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Planiraj.Services.Database;

namespace Planiraj.Services.Email;

/// <summary>Poruka spremna za slanje (adresa je već provjerena i po potrebi preusmjerena).</summary>
public sealed record OutgoingEmail(
    string To,
    string? ToName,
    string? ReplyTo,
    string Subject,
    string Html,
    string Text,
    EmailAttachment? Attachment);

/// <summary>Stvarno slanje (log ili SMTP). Implementacije su u API projektu.</summary>
public interface IEmailSender
{
    Task SendAsync(OutgoingEmail email, CancellationToken cancellationToken);
}

/// <summary>
/// Jedan prolaz kroz red: šalje poruke koje čekaju, ponavlja neuspjele sa sve dužim razmakom, preskače
/// zastarjele i nedozvoljene, i briše stare poruke (lični podaci se ne čuvaju duže nego što treba).
/// Pretpostavka je da radi jedna instanca API-ja.
/// </summary>
public class EmailOutboxProcessor(
    PlanirajDbContext context,
    IEmailSender sender,
    EmailSettings settings,
    EmailRecipientPolicy policy,
    TimeProvider time,
    ILogger<EmailOutboxProcessor> logger)
{
    /// <summary>Razmak do ponovnog pokušaja, po broju dosadašnjih neuspjeha.</summary>
    private static readonly TimeSpan[] Backoff =
        [TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15), TimeSpan.FromHours(1)];

    /// <summary>Vraća broj obrađenih poruka.</summary>
    public async Task<int> ProcessAsync(CancellationToken cancellationToken = default)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var batch = await context.EmailMessages
            .Where(m => m.Status == EmailStatus.Pending && m.NextAttemptAt <= now)
            .OrderBy(m => m.Id)
            .Take(Math.Max(1, settings.BatchSize))
            .ToListAsync(cancellationToken);

        foreach (var message in batch)
        {
            await ProcessOneAsync(message, cancellationToken);
            // Snima se poslije svake poruke: ako proces padne, poslana poruka se ne šalje ponovo.
            await context.SaveChangesAsync(cancellationToken);
        }

        await DeleteOldAsync(now, cancellationToken);
        return batch.Count;
    }

    private async Task ProcessOneAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow().UtcDateTime;

        if (message.CreatedAt < now.AddHours(-Math.Max(1, settings.MaxAgeHours)))
        {
            message.Status = EmailStatus.Expired;
            message.LastError = "Poruka je predugo čekala i više se ne šalje.";
            logger.LogWarning("E-mail {Id} ({Type}) je zastario i neće biti poslan.", message.Id, message.Type);
            return;
        }

        var decision = policy.Resolve(message.ToAddress);
        if (!decision.Allowed)
        {
            message.Status = EmailStatus.Skipped;
            message.LastError = decision.SkipReason;
            logger.LogInformation("E-mail {Id} ({Type}) je preskočen: {Reason}", message.Id, message.Type, decision.SkipReason);
            return;
        }

        var subject = decision.Redirected ? $"[za: {message.ToAddress}] {message.Subject}" : message.Subject;
        var attachment = message.AttachmentContent != null && message.AttachmentFileName != null
            ? new EmailAttachment(message.AttachmentFileName, message.AttachmentContentType ?? "application/octet-stream", message.AttachmentContent)
            : null;
        var outgoing = new OutgoingEmail(
            decision.Address!,
            decision.Redirected ? null : message.ToName,
            // Kod preusmjeravanja nema Reply-To, da odgovor na probnu poruku ne ode pravom korisniku.
            decision.Redirected ? null : message.ReplyTo,
            subject,
            message.HtmlBody,
            message.TextBody,
            attachment);

        try
        {
            await sender.SendAsync(outgoing, cancellationToken);
            message.Status = EmailStatus.Sent;
            message.SentAt = time.GetUtcNow().UtcDateTime;
            message.SentTo = decision.Address;
            message.LastError = null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            message.Attempts++;
            message.LastError = ex.Message.Length > 1000 ? ex.Message[..1000] : ex.Message;
            if (message.Attempts >= Math.Max(1, settings.MaxAttempts))
            {
                message.Status = EmailStatus.Failed;
                logger.LogError(ex, "E-mail {Id} ({Type}) nije poslan ni poslije {Attempts} pokušaja.", message.Id, message.Type, message.Attempts);
            }
            else
            {
                message.NextAttemptAt = now + Backoff[Math.Min(message.Attempts - 1, Backoff.Length - 1)];
                logger.LogWarning(ex, "Slanje e-maila {Id} ({Type}) nije uspjelo, novi pokušaj u {Next:u}.", message.Id, message.Type, message.NextAttemptAt);
            }
        }
    }

    private async Task DeleteOldAsync(DateTime now, CancellationToken cancellationToken)
    {
        var cutoff = now.AddDays(-Math.Max(1, settings.RetentionDays));
        await context.EmailMessages
            .Where(m => m.Status != EmailStatus.Pending && m.CreatedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);
    }
}
