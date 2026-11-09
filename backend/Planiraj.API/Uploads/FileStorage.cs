namespace Planiraj.API.Uploads;

/// <summary>Podešavanja za upload (sekcija "Uploads" u appsettings).</summary>
public class UploadSettings
{
    /// <summary>Folder za fajlove; relativna putanja je u odnosu na folder API-ja.</summary>
    public string Root { get; set; } = "uploads";
    /// <summary>Javna adresa fajlova; prazno = "/api/uploads" na istoj domeni kao API (radi i kroz proxy frontenda).</summary>
    public string PublicBaseUrl { get; set; } = "";
    public int MaxSizeMb { get; set; } = 5;
}

/// <summary>Čuvanje slika. Sada na disku servera; kasnije se može zamijeniti npr. Cloudflare R2 bez izmjena kontrolera.</summary>
public interface IFileStorage
{
    /// <summary>Sačuva fajl i vrati njegovu javnu adresu.</summary>
    Task<string> SaveAsync(string folder, string extension, Stream content, CancellationToken ct = default);
}

public class LocalFileStorage(UploadSettings settings, IWebHostEnvironment env) : IFileStorage
{
    public const string RequestPath = "/api/uploads";

    public string RootPath { get; } = Path.GetFullPath(Path.Combine(env.ContentRootPath, settings.Root));

    public async Task<string> SaveAsync(string folder, string extension, Stream content, CancellationToken ct = default)
    {
        var name = $"{Guid.NewGuid():N}{extension}";
        var dir = Path.Combine(RootPath, folder);
        Directory.CreateDirectory(dir);
        await using (var file = File.Create(Path.Combine(dir, name)))
            await content.CopyToAsync(file, ct);

        var baseUrl = string.IsNullOrWhiteSpace(settings.PublicBaseUrl) ? RequestPath : settings.PublicBaseUrl.TrimEnd('/');
        return $"{baseUrl}/{folder.Replace('\\', '/')}/{name}";
    }
}

/// <summary>Prepoznaje sliku po prvim bajtovima (ne po imenu fajla ni po zaglavlju koje šalje preglednik).</summary>
public static class ImageSniffer
{
    public static string? Extension(ReadOnlySpan<byte> head)
    {
        if (head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF) return ".jpg";
        if (head.Length >= 8 && head[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return ".png";
        if (head.Length >= 12 && head[..4].SequenceEqual("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8)) return ".webp";
        return null;
    }
}
