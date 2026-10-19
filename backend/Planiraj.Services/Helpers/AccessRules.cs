using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Exceptions;
using Planiraj.Services.Database;
using Planiraj.Services.Security;

namespace Planiraj.Services.Helpers;

/// <summary>Zajednička pravila pristupa i validacije koja koristi više servisa.</summary>
public static class AccessRules
{
    /// <summary>Administrator ili vlasnik (OwnerUserId) ponuđača.</summary>
    public static async Task EnsureCanManageVendorAsync(PlanirajDbContext context, ICurrentUserService currentUser, int vendorId)
    {
        var vendor = await context.Vendors.AsNoTracking()
            .Where(v => v.Id == vendorId)
            .Select(v => new { v.OwnerUserId })
            .FirstOrDefaultAsync()
            ?? throw new NotFoundException($"Ponuđač sa Id={vendorId} nije pronađen.");

        EnsureCanManageVendor(currentUser, vendor.OwnerUserId);
    }

    public static void EnsureCanManageVendor(ICurrentUserService currentUser, int? ownerUserId)
    {
        if (currentUser.IsAdmin())
            return;

        if (ownerUserId == null || ownerUserId != currentUser.UserId)
            throw new ForbiddenException("Možete upravljati samo svojim salonom.");
    }

    public static async Task EnsureUniqueUserAsync(PlanirajDbContext context, string email, string? username, int? excludeUserId)
    {
        if (await context.Users.AnyAsync(u => u.Email == email && u.Id != excludeUserId))
            throw new ConflictException("Korisnik sa ovom e-mail adresom već postoji.");

        if (username != null && await context.Users.AnyAsync(u => u.Username == username && u.Id != excludeUserId))
            throw new ConflictException("Korisničko ime je zauzeto.");
    }

    public static async Task EnsureCityExistsAsync(PlanirajDbContext context, int? cityId)
    {
        if (cityId.HasValue && !await context.Cities.AnyAsync(c => c.Id == cityId.Value))
            throw new UserException("Odabrani grad ne postoji.");
    }
}
