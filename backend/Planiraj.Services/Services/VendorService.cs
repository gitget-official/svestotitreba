using Mapster;
using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Model.Enums;
using Planiraj.Model.Exceptions;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Base;
using Planiraj.Services.Database;
using Planiraj.Services.Helpers;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>
/// Ponuđači (saloni). Kreira administrator ili salon sam, za sebe (jedan salon po nalogu); briše administrator.
/// Stranicu uređuje administrator ili vlasnik (FR-12).
/// Pretraga podržava filtere iz FR-6, a istaknuti ponuđači (aktivna pretplata) idu prvi (FR-33).
/// </summary>
public class VendorService
    : BaseCRUDService<VendorDto, VendorSearchObject, Vendor, VendorInsertRequest, VendorUpdateRequest>, IVendorService
{
    public VendorService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Ponuđač";

    protected override IQueryable<Vendor> AddFilter(VendorSearchObject search, IQueryable<Vendor> query)
    {
        if (CurrentUser.IsAdmin())
        {
            if (!search.IncludeInactive)
                query = query.Where(v => v.IsActive);
        }
        else
        {
            var userId = CurrentUser.UserId;
            query = query.Where(v => v.IsActive || (userId != null && v.OwnerUserId == userId));
        }

        if (search.CityId.HasValue)
        {
            var cityId = search.CityId.Value;
            query = query.Where(v => v.CityId == cityId);
        }

        if (search.OwnerUserId.HasValue)
        {
            var ownerId = search.OwnerUserId.Value;
            query = query.Where(v => v.OwnerUserId == ownerId);
        }

        if (search.BookingEnabled.HasValue)
        {
            var bookingEnabled = search.BookingEnabled.Value;
            query = query.Where(v => v.BookingEnabled == bookingEnabled);
        }

        // Kategorija i cijena se gledaju na istoj ponudi: "fotograf do 1500 KM".
        if (search.CategoryId.HasValue || search.PriceMin.HasValue || search.PriceMax.HasValue)
        {
            var categoryId = search.CategoryId;
            var priceMin = search.PriceMin;
            var priceMax = search.PriceMax;
            query = query.Where(v => v.Offerings.Any(o => o.IsActive
                && (categoryId == null || o.ServiceCategoryId == categoryId)
                && (priceMin == null || o.PriceTo >= priceMin)
                && (priceMax == null || o.PriceFrom <= priceMax)));
        }

        if (search.MinRating.HasValue)
        {
            var minRating = search.MinRating.Value;
            query = query.Where(v =>
                (v.Reviews.Where(r => r.Status == ReviewStatus.Approved).Average(r => (double?)r.Rating) ?? 0) >= minRating);
        }

        if (search.AvailableOn.HasValue)
        {
            // @TODO (otvorena odluka #3): ponuđači bez online zakazivanja se za sada uvijek prikazuju.
            var date = search.AvailableOn.Value;
            query = query.Where(v => !v.BookingEnabled
                || !v.Bookings.Any(b => b.EventDate == date && b.Status == BookingStatus.Confirmed));
        }

        if (!string.IsNullOrWhiteSpace(search.Fts))
        {
            var term = search.Fts.Trim();
            query = query.Where(v => v.Name.Contains(term) || (v.Description != null && v.Description.Contains(term)));
        }

        return query;
    }

    protected override IQueryable<Vendor> AddInclude(IQueryable<Vendor> query) => query
        .Include(v => v.City)
        .Include(v => v.Owner)
        .Include(v => v.SubscriptionPlan)
        .Include(v => v.Offerings).ThenInclude(o => o.ServiceCategory)
        .Include(v => v.Images)
        .Include(v => v.WorkingHours)
        .AsSplitQuery();

    protected override IQueryable<Vendor> ApplyOrdering(VendorSearchObject search, IQueryable<Vendor> query)
    {
        var now = DateTime.UtcNow;
        return query
            .OrderByDescending(v => v.SubscriptionPlan != null && v.SubscriptionExpiresAt > now
                ? v.SubscriptionPlan.PriorityWeight
                : 0)
            .ThenByDescending(v =>
                v.Reviews.Where(r => r.Status == ReviewStatus.Approved).Average(r => (double?)r.Rating) ?? 0)
            .ThenBy(v => v.Name)
            .ThenBy(v => v.Id);
    }

    protected override Task AuthorizeReadAsync(Vendor entity)
    {
        if (!entity.IsActive && !CurrentUser.IsAdmin() && entity.OwnerUserId != CurrentUser.UserId)
            throw new NotFoundException($"Ponuđač sa Id={entity.Id} nije pronađen.");
        return Task.CompletedTask;
    }

    protected override Task AuthorizeWriteAsync(Vendor entity)
    {
        AccessRules.EnsureCanManageVendor(CurrentUser, entity.OwnerUserId);
        return Task.CompletedTask;
    }

    protected override async Task BeforeInsertAsync(VendorInsertRequest request, Vendor entity)
    {
        await AccessRules.EnsureCityExistsAsync(Context, request.CityId);

        if (CurrentUser.IsAdmin())
        {
            await EnsureValidOwnerAsync(request.OwnerUserId);
            entity.IsActive = true;
        }
        else if (CurrentUser.Role == UserRole.Vendor)
        {
            // Salon postavlja svoju stranicu sam: uvijek za sebe, jedan salon po nalogu (dodatni preko administratora).
            // Objavljuje se odmah, bez odobrenja; administrator ga može isključiti kao i svaki drugi salon.
            var userId = CurrentUser.RequireUserId();
            if (await Context.Vendors.AnyAsync(v => v.OwnerUserId == userId))
                throw new UserException("Vaš nalog već ima salon. Za dodatni salon javite se administratoru.");
            entity.OwnerUserId = userId;
            entity.IsActive = true;
            entity.SubscriptionPlanId = null;
            entity.SubscriptionExpiresAt = null;
        }
        else
        {
            throw new ForbiddenException("Salon može napraviti samo nalog salona ili administrator.");
        }

        entity.Name = request.Name.Trim();
        entity.Slug = await CreateUniqueSlugAsync(entity.Name);
        entity.CreatedAt = DateTime.UtcNow;
        NormalizeBookingSettings(entity);
    }

    protected override async Task BeforeUpdateAsync(VendorUpdateRequest request, Vendor entity)
    {
        await AccessRules.EnsureCityExistsAsync(Context, request.CityId);
        entity.Name = request.Name.Trim();
        entity.UpdatedAt = DateTime.UtcNow;
        NormalizeBookingSettings(entity);
    }

    protected override Task BeforeDeleteAsync(Vendor entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }

    public async Task<VendorDto> AdminUpdateAsync(int id, VendorAdminUpdateRequest request)
    {
        CurrentUser.EnsureAdmin();
        var entity = await FindTrackedAsync(id);

        await EnsureValidOwnerAsync(request.OwnerUserId);

        if (request.SubscriptionPlanId.HasValue)
        {
            var planId = request.SubscriptionPlanId.Value;
            if (!await Context.SubscriptionPlans.AnyAsync(p => p.Id == planId))
                throw new UserException("Odabrani plan pretplate ne postoji.");
            if (request.SubscriptionExpiresAt == null)
                throw new UserException("Za pretplatu je potrebno unijeti datum isteka.");
        }

        entity.OwnerUserId = request.OwnerUserId;
        entity.IsActive = request.IsActive;
        entity.SubscriptionPlanId = request.SubscriptionPlanId;
        entity.SubscriptionExpiresAt = request.SubscriptionPlanId.HasValue ? request.SubscriptionExpiresAt : null;
        entity.UpdatedAt = DateTime.UtcNow;

        await Context.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    protected override async Task<List<VendorDto>> MapToModelsAsync(List<Vendor> entities)
    {
        var ids = entities.Select(e => e.Id).ToList();

        var ratings = await Context.Reviews.AsNoTracking()
            .Where(r => ids.Contains(r.VendorId) && r.Status == ReviewStatus.Approved)
            .GroupBy(r => r.VendorId)
            .Select(g => new { VendorId = g.Key, Average = g.Average(r => (double)r.Rating), Count = g.Count() })
            .ToDictionaryAsync(x => x.VendorId);

        var now = DateTime.UtcNow;

        return entities.Select(entity =>
        {
            var dto = entity.Adapt<VendorDto>();

            if (ratings.TryGetValue(entity.Id, out var rating))
            {
                dto.AverageRating = Math.Round(rating.Average, 2);
                dto.ReviewCount = rating.Count;
            }

            dto.IsFeatured = entity.SubscriptionPlanId != null && entity.SubscriptionExpiresAt > now;

            var activeOfferings = entity.Offerings.Where(o => o.IsActive).ToList();
            if (activeOfferings.Count > 0)
            {
                dto.PriceFrom = activeOfferings.Min(o => o.PriceFrom);
                dto.PriceTo = activeOfferings.Max(o => o.PriceTo);
            }

            dto.Images = dto.Images.OrderByDescending(i => i.IsCover).ThenBy(i => i.SortOrder).ToList();
            // Ponedjeljak prvi, nedjelja zadnja.
            dto.WorkingHours = dto.WorkingHours.OrderBy(h => ((int)h.DayOfWeek + 6) % 7).ToList();
            return dto;
        }).ToList();
    }

    private async Task EnsureValidOwnerAsync(int? ownerUserId)
    {
        if (!ownerUserId.HasValue)
            return;

        var owner = await Context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == ownerUserId.Value)
                    ?? throw new UserException("Odabrani vlasnik ne postoji.");

        if (owner.Role != UserRole.Vendor)
            throw new UserException("Vlasnik salona mora biti korisnik sa ulogom Vendor.");
    }

    private async Task<string> CreateUniqueSlugAsync(string name)
    {
        var baseSlug = SlugHelper.Generate(name);
        var slug = baseSlug;
        var i = 2;
        while (await Context.Vendors.AnyAsync(v => v.Slug == slug))
            slug = $"{baseSlug}-{i++}";
        return slug;
    }

    private static void NormalizeBookingSettings(Vendor entity)
    {
        if (!entity.BookingEnabled)
            entity.AutoConfirmBookings = false;
        if (!entity.RequiresDeposit)
            entity.DepositNote = null;
    }
}
