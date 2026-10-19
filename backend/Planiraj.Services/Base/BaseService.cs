using Mapster;
using Microsoft.EntityFrameworkCore;
using Planiraj.Model;
using Planiraj.Model.Exceptions;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Base;

/// <summary>
/// Generički servis za čitanje: filtriranje, include, sortiranje, paginacija i mapiranje u DTO.
/// Izvedeni servisi pregaze samo ono što im treba.
/// </summary>
public abstract class BaseService<TModel, TSearch, TDbEntity> : IService<TModel, TSearch>
    where TSearch : BaseSearchObject
    where TDbEntity : BaseEntity
{
    private const int MaxPageSize = 100;

    protected readonly PlanirajDbContext Context;
    protected readonly ICurrentUserService CurrentUser;

    protected BaseService(PlanirajDbContext context, ICurrentUserService currentUser)
    {
        Context = context;
        CurrentUser = currentUser;
    }

    /// <summary>Naziv entiteta u porukama o greškama.</summary>
    protected virtual string EntityName => typeof(TDbEntity).Name;

    public virtual async Task<PagedResult<TModel>> GetPagedAsync(TSearch search)
    {
        IQueryable<TDbEntity> query = Context.Set<TDbEntity>().AsNoTracking();
        query = AddFilter(search, query);

        var totalCount = await query.CountAsync();

        query = AddInclude(query);
        query = ApplyOrdering(search, query);

        var page = Math.Max(1, search.Page);
        var pageSize = Math.Clamp(search.PageSize, 1, MaxPageSize);

        var entities = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return new PagedResult<TModel>
        {
            Items = await MapToModelsAsync(entities),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }

    public virtual async Task<TModel> GetByIdAsync(int id)
    {
        var entity = await AddInclude(Context.Set<TDbEntity>().AsNoTracking())
            .FirstOrDefaultAsync(e => e.Id == id)
            ?? throw new NotFoundException($"{EntityName} sa Id={id} nije pronađen.");

        await AuthorizeReadAsync(entity);

        var models = await MapToModelsAsync(new List<TDbEntity> { entity });
        return models[0];
    }

    protected virtual IQueryable<TDbEntity> AddFilter(TSearch search, IQueryable<TDbEntity> query) => query;

    protected virtual IQueryable<TDbEntity> AddInclude(IQueryable<TDbEntity> query) => query;

    protected virtual IQueryable<TDbEntity> ApplyOrdering(TSearch search, IQueryable<TDbEntity> query) =>
        query.OrderBy(e => e.Id);

    /// <summary>Provjera prava čitanja pojedinačnog zapisa (GET /{id}).</summary>
    protected virtual Task AuthorizeReadAsync(TDbEntity entity) => Task.CompletedTask;

    protected virtual Task<List<TModel>> MapToModelsAsync(List<TDbEntity> entities) =>
        Task.FromResult(entities.Select(e => e.Adapt<TModel>()).ToList());
}
