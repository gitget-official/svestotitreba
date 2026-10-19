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

/// <summary>Gradovi: čitanje za sve prijavljene, izmjene samo administrator.</summary>
public class CityService
    : BaseCRUDService<CityDto, CitySearchObject, City, CityUpsertRequest, CityUpsertRequest>, ICityService
{
    public CityService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Grad";

    protected override IQueryable<City> AddFilter(CitySearchObject search, IQueryable<City> query)
    {
        if (!string.IsNullOrWhiteSpace(search.Fts))
        {
            var term = search.Fts.Trim();
            query = query.Where(c => c.Name.Contains(term));
        }
        return query;
    }

    protected override IQueryable<City> ApplyOrdering(CitySearchObject search, IQueryable<City> query) =>
        query.OrderBy(c => c.Name);

    protected override Task AuthorizeWriteAsync(City entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }

    protected override async Task BeforeInsertAsync(CityUpsertRequest request, City entity)
    {
        CurrentUser.EnsureAdmin();
        entity.Name = request.Name.Trim();
        await EnsureUniqueAsync(entity.Name, null);
    }

    protected override async Task BeforeUpdateAsync(CityUpsertRequest request, City entity)
    {
        entity.Name = request.Name.Trim();
        await EnsureUniqueAsync(entity.Name, entity.Id);
    }

    private async Task EnsureUniqueAsync(string name, int? excludeId)
    {
        if (await Context.Cities.AnyAsync(c => c.Name == name && c.Id != excludeId))
            throw new ConflictException("Grad sa ovim nazivom već postoji.");
    }
}

/// <summary>Kategorije usluga (FR-30): lista nije fiksna, upravlja administrator.</summary>
public class ServiceCategoryService
    : BaseCRUDService<ServiceCategoryDto, ServiceCategorySearchObject, ServiceCategory, ServiceCategoryInsertRequest, ServiceCategoryUpdateRequest>,
      IServiceCategoryService
{
    public ServiceCategoryService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Kategorija";

    protected override IQueryable<ServiceCategory> AddFilter(ServiceCategorySearchObject search, IQueryable<ServiceCategory> query)
    {
        if (!CurrentUser.IsAdmin())
            query = query.Where(c => c.IsActive);
        else if (search.IsActive.HasValue)
        {
            var isActive = search.IsActive.Value;
            query = query.Where(c => c.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(search.Fts))
        {
            var term = search.Fts.Trim();
            query = query.Where(c => c.Name.Contains(term));
        }
        return query;
    }

    protected override IQueryable<ServiceCategory> ApplyOrdering(ServiceCategorySearchObject search, IQueryable<ServiceCategory> query) =>
        query.OrderBy(c => c.SortOrder).ThenBy(c => c.Name);

    protected override Task AuthorizeReadAsync(ServiceCategory entity)
    {
        if (!entity.IsActive && !CurrentUser.IsAdmin())
            throw new NotFoundException($"Kategorija sa Id={entity.Id} nije pronađena.");
        return Task.CompletedTask;
    }

    protected override Task AuthorizeWriteAsync(ServiceCategory entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }

    protected override async Task BeforeInsertAsync(ServiceCategoryInsertRequest request, ServiceCategory entity)
    {
        CurrentUser.EnsureAdmin();
        entity.Name = request.Name.Trim();
        entity.IsActive = true;
        await EnsureUniqueNameAsync(entity.Name, null);

        var baseSlug = SlugHelper.Generate(entity.Name);
        var slug = baseSlug;
        var i = 2;
        while (await Context.ServiceCategories.AnyAsync(c => c.Slug == slug))
            slug = $"{baseSlug}-{i++}";
        entity.Slug = slug;
    }

    protected override async Task BeforeUpdateAsync(ServiceCategoryUpdateRequest request, ServiceCategory entity)
    {
        entity.Name = request.Name.Trim();
        await EnsureUniqueNameAsync(entity.Name, entity.Id);
    }

    private async Task EnsureUniqueNameAsync(string name, int? excludeId)
    {
        if (await Context.ServiceCategories.AnyAsync(c => c.Name == name && c.Id != excludeId))
            throw new ConflictException("Kategorija sa ovim nazivom već postoji.");
    }
}

/// <summary>Planovi pretplate (FR-33, priprema za monetizaciju).</summary>
public class SubscriptionPlanService
    : BaseCRUDService<SubscriptionPlanDto, SubscriptionPlanSearchObject, SubscriptionPlan, SubscriptionPlanUpsertRequest, SubscriptionPlanUpsertRequest>,
      ISubscriptionPlanService
{
    public SubscriptionPlanService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Plan pretplate";

    protected override IQueryable<SubscriptionPlan> AddFilter(SubscriptionPlanSearchObject search, IQueryable<SubscriptionPlan> query)
    {
        if (!CurrentUser.IsAdmin())
            query = query.Where(p => p.IsActive);
        else if (search.IsActive.HasValue)
        {
            var isActive = search.IsActive.Value;
            query = query.Where(p => p.IsActive == isActive);
        }
        return query;
    }

    protected override IQueryable<SubscriptionPlan> ApplyOrdering(SubscriptionPlanSearchObject search, IQueryable<SubscriptionPlan> query) =>
        query.OrderBy(p => p.Price);

    protected override Task AuthorizeWriteAsync(SubscriptionPlan entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }

    protected override Task BeforeInsertAsync(SubscriptionPlanUpsertRequest request, SubscriptionPlan entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }
}
