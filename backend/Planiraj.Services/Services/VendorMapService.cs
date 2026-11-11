using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;

namespace Planiraj.Services.Services;

/// <summary>
/// Mapa ponuđača na početnoj. Bez straničenja: frontend sam grupiše tačke po zumu.
/// Tri ravna upita (ponuđači, kategorije, naslovne slike) umjesto jednog ugniježđenog, jer ga SQLite ne
/// zna prevesti (APPLY), a ovako je i na SQL Serveru jednostavno i brzo.
/// </summary>
public class VendorMapService(PlanirajDbContext context) : IVendorMapService
{
    public async Task<IReadOnlyList<VendorMapPointDto>> GetPointsAsync()
    {
        var vendors = await context.Vendors.AsNoTracking()
            .Where(v => v.IsActive)
            .Where(v => (v.Latitude != null && v.Longitude != null)
                || (v.City.Latitude != null && v.City.Longitude != null))
            .OrderBy(v => v.Id)
            .Select(v => new
            {
                v.Id,
                v.Name,
                v.Slug,
                v.CityId,
                CityName = v.City.Name,
                v.Latitude,
                v.Longitude,
                CityLatitude = v.City.Latitude,
                CityLongitude = v.City.Longitude,
            })
            .ToListAsync();

        // Kategorije: slugovi aktivnih ponuda u aktivnim kategorijama (za filtere "Sale", "Fotografi"...).
        var categories = (await context.VendorOfferings.AsNoTracking()
                .Where(o => o.IsActive && o.ServiceCategory.IsActive && o.Vendor.IsActive)
                .Select(o => new { o.VendorId, o.ServiceCategory.Slug })
                .Distinct()
                .ToListAsync())
            .ToLookup(o => o.VendorId, o => o.Slug);

        // Naslovna slika, a ako nije označena, prva po redoslijedu.
        var images = (await context.VendorImages.AsNoTracking()
                .Where(i => i.Vendor.IsActive)
                .Select(i => new { i.VendorId, i.Url, i.IsCover, i.SortOrder, i.Id })
                .ToListAsync())
            .GroupBy(i => i.VendorId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(i => i.IsCover).ThenBy(i => i.SortOrder).ThenBy(i => i.Id).First().Url);

        return vendors.Select(v =>
        {
            var exact = v.Latitude != null && v.Longitude != null;
            return new VendorMapPointDto(
                v.Id,
                v.Name,
                v.Slug,
                v.CityId,
                v.CityName,
                categories[v.Id].Order().ToList(),
                exact ? v.Latitude!.Value : v.CityLatitude!.Value,
                exact ? v.Longitude!.Value : v.CityLongitude!.Value,
                !exact,
                images.GetValueOrDefault(v.Id));
        }).ToList();
    }
}
