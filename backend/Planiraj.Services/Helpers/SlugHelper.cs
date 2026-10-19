using System.Text;
using System.Text.RegularExpressions;

namespace Planiraj.Services.Helpers;

/// <summary>Pravi URL-prijateljske nazive ("Studio ljepote Amra" -> "studio-ljepote-amra").</summary>
public static partial class SlugHelper
{
    private static readonly Dictionary<char, string> Replacements = new()
    {
        ['č'] = "c", ['ć'] = "c", ['š'] = "s", ['ž'] = "z", ['đ'] = "dj"
    };

    public static string Generate(string text)
    {
        var builder = new StringBuilder();
        foreach (var ch in text.Trim().ToLowerInvariant())
        {
            if (Replacements.TryGetValue(ch, out var replacement))
                builder.Append(replacement);
            else if (ch < 128 && char.IsLetterOrDigit(ch))
                builder.Append(ch);
            else if (char.IsWhiteSpace(ch) || ch is '-' or '_' or '&' or '/' or '.')
                builder.Append('-');
        }

        var slug = MultipleDashes().Replace(builder.ToString(), "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "stavka" : slug;
    }

    [GeneratedRegex("-{2,}")]
    private static partial Regex MultipleDashes();
}
