using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Planiraj.API.Auth;
using Planiraj.API.Uploads;
using Planiraj.Services.Database;
using Planiraj.Services.Helpers;
using Planiraj.Services.Security;

namespace Planiraj.API.Controllers;

/// <summary>
/// /api/uploads: upload slika salona (galerija i logo). Smije vlasnik tog salona ili administrator.
/// Vraća javnu adresu slike, koja se zatim upisuje kao slika galerije (/api/vendorimages) ili logo salona.
/// </summary>
[ApiController]
[Authorize]
[Route("api/uploads")]
public class UploadsController(IFileStorage storage, UploadSettings settings, PlanirajDbContext context, ICurrentUserService currentUser)
    : ControllerBase
{
    public record UploadResult(string Url);

    [HttpPost("vendors/{vendorId:int}")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    [EnableRateLimiting(RateLimits.Upload)]
    public async Task<ActionResult<UploadResult>> UploadVendorImage(int vendorId, IFormFile? file, CancellationToken ct)
    {
        await AccessRules.EnsureCanManageVendorAsync(context, currentUser, vendorId);

        if (file == null || file.Length == 0)
            return BadRequest(new { status = 400, message = "Izaberite sliku." });
        if (file.Length > settings.MaxSizeMb * 1024L * 1024L)
            return BadRequest(new { status = 400, message = $"Slika je veća od {settings.MaxSizeMb} MB." });

        await using var stream = file.OpenReadStream();
        var head = new byte[12];
        var read = await stream.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false, ct);
        var extension = ImageSniffer.Extension(head.AsSpan(0, read));
        if (extension == null)
            return BadRequest(new { status = 400, message = "Dozvoljene su samo slike JPG, PNG i WebP." });

        // Ograničen prostor po salonu: kad je limit dostignut, prvo se brišu stari fajlovi koje nijedna slika
        // ni logo ne koriste (npr. obrisane slike galerije ili upload koji nikad nije sačuvan).
        var folder = Path.Combine("vendors", vendorId.ToString());
        if (storage.Count(folder) >= settings.MaxFilesPerVendor)
        {
            var used = await ReferencedFileNamesAsync(vendorId, ct);
            var remaining = storage.DeleteUnreferenced(folder, used.Contains, TimeSpan.FromMinutes(settings.OrphanGraceMinutes));
            if (remaining >= settings.MaxFilesPerVendor)
                return BadRequest(new
                {
                    status = 400,
                    message = $"Salon može imati najviše {settings.MaxFilesPerVendor} slika. Obrišite slike koje ne koristite pa pokušajte ponovo."
                });
        }

        stream.Position = 0;
        var url = await storage.SaveAsync(folder, extension, stream, ct);
        return new UploadResult(url);
    }

    /// <summary>Imena fajlova (GUID.ext) koje koriste slike galerije i logo ovog salona.</summary>
    private async Task<HashSet<string>> ReferencedFileNamesAsync(int vendorId, CancellationToken ct)
    {
        var urls = await context.VendorImages.Where(i => i.VendorId == vendorId).Select(i => i.Url).ToListAsync(ct);
        var logo = await context.Vendors.Where(v => v.Id == vendorId).Select(v => v.LogoUrl).FirstOrDefaultAsync(ct);
        if (logo != null) urls.Add(logo);
        return urls.Select(u => u.Split('?', '#')[0]).Select(u => u[(u.LastIndexOf('/') + 1)..])
            .Where(n => n.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
