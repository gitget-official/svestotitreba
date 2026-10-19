using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Model.Exceptions;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Base;
using Planiraj.Services.Database;
using Planiraj.Services.Helpers;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>Usluge ponuđača po kategorijama, sa cijenom od–do (FR-10, FR-11).</summary>
public class OfferingService
    : BaseCRUDService<OfferingDto, OfferingSearchObject, VendorOffering, OfferingInsertRequest, OfferingUpdateRequest>, IOfferingService
{
    public OfferingService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Usluga";

    protected override IQueryable<VendorOffering> AddFilter(OfferingSearchObject search, IQueryable<VendorOffering> query)
    {
        if (!CurrentUser.IsAdmin())
        {
            var userId = CurrentUser.UserId;
            query = query.Where(o => (o.IsActive && o.Vendor.IsActive)
                                     || (userId != null && o.Vendor.OwnerUserId == userId));
        }

        if (search.VendorId.HasValue)
        {
            var vendorId = search.VendorId.Value;
            query = query.Where(o => o.VendorId == vendorId);
        }

        if (search.CategoryId.HasValue)
        {
            var categoryId = search.CategoryId.Value;
            query = query.Where(o => o.ServiceCategoryId == categoryId);
        }

        if (search.CityId.HasValue)
        {
            var cityId = search.CityId.Value;
            query = query.Where(o => o.Vendor.CityId == cityId);
        }

        if (search.PriceMin.HasValue)
        {
            var priceMin = search.PriceMin.Value;
            query = query.Where(o => o.PriceTo >= priceMin);
        }

        if (search.PriceMax.HasValue)
        {
            var priceMax = search.PriceMax.Value;
            query = query.Where(o => o.PriceFrom <= priceMax);
        }

        if (search.IsActive.HasValue)
        {
            var isActive = search.IsActive.Value;
            query = query.Where(o => o.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(search.Fts))
        {
            var term = search.Fts.Trim();
            query = query.Where(o => o.Title.Contains(term)
                                     || (o.Description != null && o.Description.Contains(term))
                                     || o.Vendor.Name.Contains(term));
        }

        return query;
    }

    protected override IQueryable<VendorOffering> AddInclude(IQueryable<VendorOffering> query) =>
        query.Include(o => o.Vendor).Include(o => o.ServiceCategory);

    protected override IQueryable<VendorOffering> ApplyOrdering(OfferingSearchObject search, IQueryable<VendorOffering> query) =>
        query.OrderBy(o => o.PriceFrom).ThenBy(o => o.Title);

    protected override Task AuthorizeReadAsync(VendorOffering entity)
    {
        var visible = (entity.IsActive && entity.Vendor.IsActive)
                      || CurrentUser.IsAdmin()
                      || entity.Vendor.OwnerUserId == CurrentUser.UserId;
        if (!visible)
            throw new NotFoundException($"Usluga sa Id={entity.Id} nije pronađena.");
        return Task.CompletedTask;
    }

    protected override Task AuthorizeWriteAsync(VendorOffering entity) =>
        AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, entity.VendorId);

    protected override async Task BeforeInsertAsync(OfferingInsertRequest request, VendorOffering entity)
    {
        await AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, request.VendorId);
        await EnsureCategoryAsync(request.ServiceCategoryId);
        ValidatePrice(request.PriceFrom, request.PriceTo);

        entity.Title = request.Title.Trim();
        entity.Currency = "KM";
        entity.IsActive = true;
        entity.CreatedAt = DateTime.UtcNow;
    }

    protected override async Task BeforeUpdateAsync(OfferingUpdateRequest request, VendorOffering entity)
    {
        await EnsureCategoryAsync(request.ServiceCategoryId);
        ValidatePrice(request.PriceFrom, request.PriceTo);

        entity.Title = request.Title.Trim();
        entity.UpdatedAt = DateTime.UtcNow;
    }

    private async Task EnsureCategoryAsync(int categoryId)
    {
        if (!await Context.ServiceCategories.AnyAsync(c => c.Id == categoryId && c.IsActive))
            throw new UserException("Odabrana kategorija usluge ne postoji ili nije aktivna.");
    }

    private static void ValidatePrice(decimal priceFrom, decimal priceTo)
    {
        if (priceFrom < 0 || priceTo < 0)
            throw new UserException("Cijena ne može biti negativna.");
        if (priceFrom > priceTo)
            throw new UserException("Cijena \"od\" ne može biti veća od cijene \"do\".");
    }
}

/// <summary>Galerija slika ponuđača. Za sada se čuva URL; upload fajlova dolazi kasnije.</summary>
public class VendorImageService
    : BaseCRUDService<VendorImageDto, VendorImageSearchObject, VendorImage, VendorImageInsertRequest, VendorImageUpdateRequest>, IVendorImageService
{
    public VendorImageService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Slika";

    protected override IQueryable<VendorImage> AddFilter(VendorImageSearchObject search, IQueryable<VendorImage> query)
    {
        if (!CurrentUser.IsAdmin())
        {
            var userId = CurrentUser.UserId;
            query = query.Where(i => i.Vendor.IsActive || (userId != null && i.Vendor.OwnerUserId == userId));
        }

        if (search.VendorId.HasValue)
        {
            var vendorId = search.VendorId.Value;
            query = query.Where(i => i.VendorId == vendorId);
        }
        return query;
    }

    protected override IQueryable<VendorImage> ApplyOrdering(VendorImageSearchObject search, IQueryable<VendorImage> query) =>
        query.OrderBy(i => i.VendorId).ThenByDescending(i => i.IsCover).ThenBy(i => i.SortOrder);

    protected override Task AuthorizeWriteAsync(VendorImage entity) =>
        AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, entity.VendorId);

    protected override async Task BeforeInsertAsync(VendorImageInsertRequest request, VendorImage entity)
    {
        await AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, request.VendorId);
        if (entity.IsCover)
            await ClearOtherCoversAsync(entity.VendorId, null);
    }

    protected override async Task BeforeUpdateAsync(VendorImageUpdateRequest request, VendorImage entity)
    {
        if (entity.IsCover)
            await ClearOtherCoversAsync(entity.VendorId, entity.Id);
    }

    /// <summary>Samo jedna naslovna slika po ponuđaču.</summary>
    private async Task ClearOtherCoversAsync(int vendorId, int? keepImageId)
    {
        var others = await Context.VendorImages
            .Where(i => i.VendorId == vendorId && i.IsCover && i.Id != keepImageId)
            .ToListAsync();
        foreach (var image in others)
            image.IsCover = false;
    }
}

/// <summary>Radno vrijeme ponuđača, jedan zapis po danu u sedmici.</summary>
public class WorkingHourService
    : BaseCRUDService<WorkingHourDto, WorkingHourSearchObject, WorkingHour, WorkingHourInsertRequest, WorkingHourUpdateRequest>, IWorkingHourService
{
    public WorkingHourService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Radno vrijeme";

    protected override IQueryable<WorkingHour> AddFilter(WorkingHourSearchObject search, IQueryable<WorkingHour> query)
    {
        if (search.VendorId.HasValue)
        {
            var vendorId = search.VendorId.Value;
            query = query.Where(h => h.VendorId == vendorId);
        }
        return query;
    }

    protected override IQueryable<WorkingHour> ApplyOrdering(WorkingHourSearchObject search, IQueryable<WorkingHour> query) =>
        query.OrderBy(h => h.VendorId).ThenBy(h => h.DayOfWeek);

    protected override Task AuthorizeWriteAsync(WorkingHour entity) =>
        AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, entity.VendorId);

    protected override async Task BeforeInsertAsync(WorkingHourInsertRequest request, WorkingHour entity)
    {
        await AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, request.VendorId);

        if (await Context.WorkingHours.AnyAsync(h => h.VendorId == request.VendorId && h.DayOfWeek == request.DayOfWeek))
            throw new ConflictException("Radno vrijeme za ovaj dan već postoji. Izmijenite postojeći zapis.");

        Normalize(entity);
    }

    protected override Task BeforeUpdateAsync(WorkingHourUpdateRequest request, WorkingHour entity)
    {
        Normalize(entity);
        return Task.CompletedTask;
    }

    private static void Normalize(WorkingHour entity)
    {
        if (entity.IsClosed)
        {
            entity.OpenTime = null;
            entity.CloseTime = null;
            return;
        }

        if (entity.OpenTime is null || entity.CloseTime is null)
            throw new UserException("Za radni dan potrebno je unijeti vrijeme otvaranja i zatvaranja.");
        if (entity.OpenTime >= entity.CloseTime)
            throw new UserException("Vrijeme otvaranja mora biti prije vremena zatvaranja.");
    }
}
