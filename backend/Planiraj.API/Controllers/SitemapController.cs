using System.Xml.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>
/// sitemap.xml za pretraživače, uvijek svjež iz baze. Adrese vode na frontend (Seo:SiteUrl, a ako nije
/// postavljen, prvi Cors:Origins). Dostupno na /sitemap.xml i /api/sitemap.xml, pa hosting može
/// proslijediti bilo koju od te dvije adrese.
/// </summary>
[ApiController]
[AllowAnonymous]
public class SitemapController(ISitemapService sitemap, IConfiguration configuration) : ControllerBase
{
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    [HttpGet("/sitemap.xml")]
    [HttpGet("/api/sitemap.xml")]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Get()
    {
        var site = SiteUrl();
        if (site == null)
            return Problem("Seo:SiteUrl nije podešen.", statusCode: StatusCodes.Status503ServiceUnavailable);

        var entries = await sitemap.GetEntriesAsync();
        var xml = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(Ns + "urlset",
                entries.Select(e => new XElement(Ns + "url",
                    new XElement(Ns + "loc", site + e.Path),
                    e.LastModified is { } d ? new XElement(Ns + "lastmod", d.ToString("yyyy-MM-dd")) : null,
                    new XElement(Ns + "priority", e.Priority)))));

        return Content(xml.Declaration + "\n" + xml.Root, "application/xml; charset=utf-8");
    }

    private string? SiteUrl()
    {
        var url = configuration["Seo:SiteUrl"];
        if (string.IsNullOrWhiteSpace(url))
            url = configuration.GetSection("Cors:Origins").Get<string[]>()?.FirstOrDefault();
        return string.IsNullOrWhiteSpace(url) ? null : url.TrimEnd('/');
    }
}
