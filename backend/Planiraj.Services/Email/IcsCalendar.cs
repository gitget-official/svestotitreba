using System.Globalization;
using System.Text;

namespace Planiraj.Services.Email;

/// <summary>
/// Minimalni iCalendar (RFC 5545) događaj kao prilog e-mailu, da mladenci termin dodaju u kalendar jednim klikom.
/// METHOD:PUBLISH (ne poziv), vrijeme bez vremenske zone ("floating"), tj. lokalno vrijeme onoga ko otvara.
/// </summary>
public static class IcsCalendar
{
    public const string ContentType = "text/calendar; charset=utf-8; method=PUBLISH";

    /// <param name="uid">Stalni identifikator događaja (isti za istu rezervaciju).</param>
    /// <param name="startTime">Bez vremena: cjelodnevni događaj. Sa vremenom: događaj od jednog sata (okvirno).</param>
    public static string Event(
        string uid, DateOnly date, TimeOnly? startTime, string summary, string? description, string? location, DateTime stampUtc)
    {
        var sb = new StringBuilder();
        void Line(string value) => sb.Append(Fold(value)).Append("\r\n");

        Line("BEGIN:VCALENDAR");
        Line("VERSION:2.0");
        Line("PRODID:-//Planiraj//Rezervacije//BS");
        Line("CALSCALE:GREGORIAN");
        Line("METHOD:PUBLISH");
        Line("BEGIN:VEVENT");
        Line("UID:" + Escape(uid));
        Line("DTSTAMP:" + stampUtc.ToUniversalTime().ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture));
        if (startTime is { } time)
        {
            var start = date.ToDateTime(time);
            Line("DTSTART:" + start.ToString("yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture));
            Line("DTEND:" + start.AddHours(1).ToString("yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture));
        }
        else
        {
            Line("DTSTART;VALUE=DATE:" + date.ToString("yyyyMMdd", CultureInfo.InvariantCulture));
            Line("DTEND;VALUE=DATE:" + date.AddDays(1).ToString("yyyyMMdd", CultureInfo.InvariantCulture));
        }
        Line("SUMMARY:" + Escape(summary));
        if (!string.IsNullOrWhiteSpace(description)) Line("DESCRIPTION:" + Escape(description));
        if (!string.IsNullOrWhiteSpace(location)) Line("LOCATION:" + Escape(location));
        Line("STATUS:CONFIRMED");
        Line("TRANSP:OPAQUE");
        Line("END:VEVENT");
        Line("END:VCALENDAR");
        return sb.ToString();
    }

    /// <summary>Zarez, tačka-zarez, obrnuta kosa crta i novi red se moraju escapeovati.</summary>
    internal static string Escape(string value) => value
        .Replace("\\", "\\\\")
        .Replace(";", "\\;")
        .Replace(",", "\\,")
        .Replace("\r\n", "\\n")
        .Replace("\n", "\\n")
        .Replace("\r", "\\n");

    /// <summary>Redovi duži od 75 bajtova (UTF-8) se lome; nastavak počinje razmakom. Ne lomi se usred znaka.</summary>
    internal static string Fold(string line)
    {
        if (Encoding.UTF8.GetByteCount(line) <= 75) return line;
        var sb = new StringBuilder();
        var bytes = 0;
        var limit = 75;
        var index = 0;
        while (index < line.Length)
        {
            var length = char.IsSurrogatePair(line, index) ? 2 : 1;
            var size = Encoding.UTF8.GetByteCount(line.AsSpan(index, length));
            if (bytes + size > limit)
            {
                sb.Append("\r\n ");
                bytes = 1;
                limit = 75;
            }
            sb.Append(line, index, length);
            bytes += size;
            index += length;
        }
        return sb.ToString();
    }
}
