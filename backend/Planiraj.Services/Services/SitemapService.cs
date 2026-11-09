using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;

namespace Planiraj.Services.Services;

/// <summary>
/// Adrese za sitemap.xml, uvijek iz baze: novi ponuđač je u sitemapu čim ga admin uključi, bez novog builda.
/// Opće stranice i oblik linka ponuđača moraju odgovarati frontendu (scripts/prerender.mjs i core/links.ts).
/// </summary>
public class SitemapService(PlanirajDbContext context) : ISitemapService
{
    private static readonly SitemapEntry[] Pages =
    [
        new("/", null, "1.0"),
        new("/istrazi", null, "0.9"),
        new("/planiranje", null, "0.8"),
        new("/uslovi", null, "0.2"),
        new("/privatnost", null, "0.2"),
    ];

    public async Task<IReadOnlyList<SitemapEntry>> GetEntriesAsync()
    {
        var vendors = await context.Vendors.AsNoTracking()
            .Where(v => v.IsActive)
            .OrderBy(v => v.Id)
            .Select(v => new { v.Id, v.Slug, Modified = v.UpdatedAt ?? v.CreatedAt })
            .ToListAsync();

        return
        [
            .. Pages,
            .. vendors.Select(v => new SitemapEntry($"/ponudjaci/{v.Id}-{v.Slug}", v.Modified, "0.7")),
        ];
    }
}
