using System.Text;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using Planiraj.Services.Email;

namespace Planiraj.API.Email;

/// <summary>Email:Mode = Log. Ništa ne šalje, samo zapiše poruku u log (za razvoj).</summary>
public class LogEmailSender(ILogger<LogEmailSender> logger) : IEmailSender
{
    public Task SendAsync(OutgoingEmail email, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "E-mail (Log način, NIJE poslan)\nZa: {To}\nReply-To: {ReplyTo}\nNaslov: {Subject}\nPrilog: {Attachment}\n\n{Text}",
            email.To, email.ReplyTo ?? "-", email.Subject, email.Attachment?.FileName ?? "-", email.Text);
        return Task.CompletedTask;
    }
}

/// <summary>Email:Mode = Smtp. Radi sa svakim transakcijskim provajderom koji nudi SMTP.</summary>
public class SmtpEmailSender(EmailSettings settings) : IEmailSender
{
    public async Task SendAsync(OutgoingEmail email, CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(settings.FromName, settings.FromAddress));
        message.To.Add(new MailboxAddress(email.ToName ?? string.Empty, email.To));
        if (email.ReplyTo != null)
            message.ReplyTo.Add(MailboxAddress.Parse(email.ReplyTo));
        message.Subject = email.Subject;
        // Automatska poruka: ne odgovarati automatskim odgovorima ("van ureda" i sl.).
        message.Headers.Add("Auto-Submitted", "auto-generated");
        message.Headers.Add("X-Auto-Response-Suppress", "All");

        var body = new BodyBuilder { HtmlBody = email.Html, TextBody = email.Text };
        if (email.Attachment != null)
            body.Attachments.Add(email.Attachment.FileName, Encoding.UTF8.GetBytes(email.Attachment.Content),
                ContentType.Parse(email.Attachment.ContentType));
        message.Body = body.ToMessageBody();

        var security = settings.Smtp.Security.ToLowerInvariant() switch
        {
            "sslonconnect" => SecureSocketOptions.SslOnConnect,
            "none" => SecureSocketOptions.None,
            _ => SecureSocketOptions.StartTls
        };

        using var client = new SmtpClient { Timeout = 30_000 };
        await client.ConnectAsync(settings.Smtp.Host, settings.Smtp.Port, security, cancellationToken);
        if (!string.IsNullOrEmpty(settings.Smtp.Username))
            await client.AuthenticateAsync(settings.Smtp.Username, settings.Smtp.Password ?? string.Empty, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }
}
