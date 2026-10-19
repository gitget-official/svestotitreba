using Mapster;
using Planiraj.Model.Exceptions;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Base;

/// <summary>
/// Generički CRUD servis. Redoslijed:
/// Insert: map request -> BeforeInsert (autorizacija + validacija) -> save.
/// Update: AuthorizeWrite -> map request -> BeforeUpdate (validacija) -> save.
/// Delete: AuthorizeWrite -> BeforeDelete -> remove -> save.
/// </summary>
public abstract class BaseCRUDService<TModel, TSearch, TDbEntity, TInsert, TUpdate>
    : BaseService<TModel, TSearch, TDbEntity>, ICRUDService<TModel, TSearch, TInsert, TUpdate>
    where TSearch : BaseSearchObject
    where TDbEntity : BaseEntity
{
    protected BaseCRUDService(PlanirajDbContext context, ICurrentUserService currentUser)
        : base(context, currentUser)
    {
    }

    public virtual async Task<TModel> InsertAsync(TInsert request)
    {
        var entity = request!.Adapt<TDbEntity>();
        await BeforeInsertAsync(request, entity);

        Context.Set<TDbEntity>().Add(entity);
        await Context.SaveChangesAsync();

        return await GetByIdAsync(entity.Id);
    }

    public virtual async Task<TModel> UpdateAsync(int id, TUpdate request)
    {
        var entity = await FindTrackedAsync(id);
        await AuthorizeWriteAsync(entity);

        request.Adapt(entity);
        await BeforeUpdateAsync(request, entity);

        await Context.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    public virtual async Task DeleteAsync(int id)
    {
        var entity = await FindTrackedAsync(id);
        await AuthorizeWriteAsync(entity);
        await BeforeDeleteAsync(entity);

        Context.Set<TDbEntity>().Remove(entity);
        await Context.SaveChangesAsync();
    }

    protected async Task<TDbEntity> FindTrackedAsync(int id) =>
        await Context.Set<TDbEntity>().FindAsync(id)
        ?? throw new NotFoundException($"{EntityName} sa Id={id} nije pronađen.");

    /// <summary>Ko smije mijenjati/brisati postojeći zapis.</summary>
    protected virtual Task AuthorizeWriteAsync(TDbEntity entity) => Task.CompletedTask;

    protected virtual Task BeforeInsertAsync(TInsert request, TDbEntity entity) => Task.CompletedTask;

    protected virtual Task BeforeUpdateAsync(TUpdate request, TDbEntity entity) => Task.CompletedTask;

    protected virtual Task BeforeDeleteAsync(TDbEntity entity) => Task.CompletedTask;
}
