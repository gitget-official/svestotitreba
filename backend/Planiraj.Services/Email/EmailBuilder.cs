using System.Text;
using System.Text.Encodings.Web;
using System.Text.Unicode;

namespace Planiraj.Services.Email;

/// <summary>
/// Gradi poruku u zajedničkom izgledu, istovremeno kao HTML i kao čisti tekst. Svaki tekst koji se doda se
/// HTML-enkodira, pa korisnički unos (napomena, ime) ne može ubaciti HTML u poruku.
/// </summary>
public sealed class EmailBuilder
{
    private static readonly HtmlEncoder Encoder = HtmlEncoder.Create(UnicodeRanges.All);

    private const string Accent = "#9c4f63";
    private const string Muted = "#6b6470";
    private const string Border = "#ece6ea";

    private readonly string _brand;
    private readonly string? _siteUrl;
    private readonly StringBuilder _html = new();
    private readonly StringBuilder _text = new();
    private string? _preheader;
    private string? _footer;

    public EmailBuilder(string brand, string? siteUrl)
    {
        _brand = brand;
        _siteUrl = string.IsNullOrWhiteSpace(siteUrl) ? null : siteUrl.TrimEnd('/');
    }

    private static string E(string value) => Encoder.Encode(value);

    /// <summary>Kratak tekst koji klijenti prikazuju pored naslova u listi poruka.</summary>
    public EmailBuilder Preheader(string text)
    {
        _preheader = text;
        return this;
    }

    public EmailBuilder Heading(string text)
    {
        _html.Append($"<h1 style=\"margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:#2b2430\">{E(text)}</h1>");
        _text.AppendLine(text).AppendLine(new string('=', Math.Min(text.Length, 60))).AppendLine();
        return this;
    }

    public EmailBuilder Paragraph(string text)
    {
        _html.Append($"<p style=\"margin:0 0 16px;font-size:16px;line-height:1.55;color:#2b2430\">{E(text)}</p>");
        _text.AppendLine(text).AppendLine();
        return this;
    }

    /// <summary>Tabela "naziv: vrijednost"; prazne vrijednosti se preskaču.</summary>
    public EmailBuilder Details(params (string Label, string? Value)[] rows)
    {
        var filled = rows.Where(r => !string.IsNullOrWhiteSpace(r.Value)).ToList();
        if (filled.Count == 0) return this;

        _html.Append($"<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;margin:0 0 20px;border:1px solid {Border};border-radius:10px;border-collapse:separate\">");
        foreach (var (label, value) in filled)
        {
            _html.Append("<tr>")
                .Append($"<td style=\"padding:10px 14px;font-size:14px;color:{Muted};width:38%;vertical-align:top\">{E(label)}</td>")
                .Append($"<td style=\"padding:10px 14px;font-size:15px;color:#2b2430;vertical-align:top\">{E(value!)}</td>")
                .Append("</tr>");
            _text.AppendLine($"{label}: {value}");
        }
        _html.Append("</table>");
        _text.AppendLine();
        return this;
    }

    /// <summary>Citat (npr. napomena mladenaca ili razlog odbijanja); preskače se kad je prazno.</summary>
    public EmailBuilder Quote(string label, string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return this;
        var lines = text.Trim().Replace("\r\n", "\n").Split('\n');
        _html.Append($"<p style=\"margin:0 0 6px;font-size:14px;color:{Muted}\">{E(label)}</p>")
            .Append($"<blockquote style=\"margin:0 0 20px;padding:10px 14px;border-left:3px solid {Accent};background:#faf6f8;font-size:15px;line-height:1.5;color:#2b2430\">")
            .Append(string.Join("<br>", lines.Select(E)))
            .Append("</blockquote>");
        _text.AppendLine($"{label}:");
        foreach (var line in lines) _text.AppendLine($"> {line}");
        _text.AppendLine();
        return this;
    }

    /// <summary>Dugme sa linkom na stranicu aplikacije (putanja počinje sa "/"). Bez adrese sajta se izostavlja.</summary>
    public EmailBuilder Button(string label, string path)
    {
        if (_siteUrl == null) return this;
        var url = _siteUrl + path;
        _html.Append("<p style=\"margin:8px 0 24px\">")
            .Append($"<a href=\"{E(url)}\" style=\"display:inline-block;padding:12px 22px;border-radius:999px;background:{Accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600\">{E(label)}</a>")
            .Append("</p>");
        _text.AppendLine($"{label}: {url}").AppendLine();
        return this;
    }

    /// <summary>Zašto je korisnik dobio poruku.</summary>
    public EmailBuilder Footer(string text)
    {
        _footer = text;
        return this;
    }

    public EmailContent Build(string subject, EmailAttachment? attachment = null)
    {
        var html = new StringBuilder();
        html.Append("<!doctype html><html lang=\"bs\"><head><meta charset=\"utf-8\">")
            .Append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
            .Append($"<title>{E(subject)}</title></head>")
            .Append("<body style=\"margin:0;padding:0;background:#f6f2f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif\">");
        if (_preheader != null)
            html.Append($"<div style=\"display:none;max-height:0;overflow:hidden;opacity:0\">{E(_preheader)}</div>");
        html.Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f6f2f4\"><tr><td align=\"center\" style=\"padding:24px 12px\">")
            .Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:560px\">")
            .Append($"<tr><td style=\"padding:0 4px 16px;font-size:18px;font-weight:600;color:{Accent}\">{E(_brand)}</td></tr>")
            .Append("<tr><td style=\"background:#ffffff;border-radius:16px;padding:28px 24px\">")
            .Append(_html)
            .Append("</td></tr>");
        if (_footer != null)
            html.Append($"<tr><td style=\"padding:16px 8px 0;font-size:12px;line-height:1.5;color:{Muted}\">{E(_footer)}</td></tr>");
        html.Append("</table></td></tr></table></body></html>");

        var text = new StringBuilder();
        text.Append(_text);
        if (_footer != null) text.AppendLine("--").AppendLine(_footer);
        text.Append(_brand);

        return new EmailContent(subject, html.ToString(), text.ToString(), attachment);
    }
}
