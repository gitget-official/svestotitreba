using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

        stream.Position = 0;
        var url = await storage.SaveAsync(Path.Combine("vendors", vendorId.ToString()), extension, stream, ct);
        return new UploadResult(url);
    }
}
