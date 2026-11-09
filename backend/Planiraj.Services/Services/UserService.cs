using Microsoft.EntityFrameworkCore;
using Planiraj.Model;
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

/// <summary>Upravljanje korisnicima: samo administrator (kreiranje naloga za ponuđače, FR-29).</summary>
public class UserService
    : BaseCRUDService<UserDto, UserSearchObject, User, UserInsertRequest, UserUpdateRequest>, IUserService
{
    public UserService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Korisnik";

    public override Task<PagedResult<UserDto>> GetPagedAsync(UserSearchObject search)
    {
        CurrentUser.EnsureAdmin();
        return base.GetPagedAsync(search);
    }

    protected override IQueryable<User> AddFilter(UserSearchObject search, IQueryable<User> query)
    {
        if (search.Role.HasValue)
        {
            var role = search.Role.Value;
            query = query.Where(u => u.Role == role);
        }

        if (search.IsActive.HasValue)
        {
            var isActive = search.IsActive.Value;
            query = query.Where(u => u.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(search.Fts))
        {
            var term = search.Fts.Trim();
            query = query.Where(u => u.FirstName.Contains(term) || u.LastName.Contains(term)
                                     || u.Email.Contains(term) || u.Username.Contains(term));
        }

        return query;
    }

    protected override IQueryable<User> AddInclude(IQueryable<User> query) => query.Include(u => u.City);

    protected override IQueryable<User> ApplyOrdering(UserSearchObject search, IQueryable<User> query) =>
        query.OrderBy(u => u.LastName).ThenBy(u => u.FirstName);

    protected override Task AuthorizeReadAsync(User entity)
    {
        if (!CurrentUser.IsAdmin() && entity.Id != CurrentUser.UserId)
            throw new ForbiddenException("Nemate pristup podacima ovog korisnika.");
        return Task.CompletedTask;
    }

    protected override Task AuthorizeWriteAsync(User entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }

    protected override async Task BeforeInsertAsync(UserInsertRequest request, User entity)
    {
        CurrentUser.EnsureAdmin();

        entity.Email = request.Email.Trim().ToLowerInvariant();
        entity.Username = request.Username.Trim();
        await AccessRules.EnsureUniqueUserAsync(Context, entity.Email, entity.Username, null);
        await AccessRules.EnsureCityExistsAsync(Context, entity.CityId);

        PasswordHasher.SetPassword(entity, request.Password);
        entity.IsActive = true;
        // FR-3: ponuđač dobija nalog od administratora i mijenja lozinku pri prvoj prijavi.
        entity.MustChangePassword = request.Role == UserRole.Vendor;
        entity.CreatedAt = DateTime.UtcNow;
    }

    protected override async Task BeforeUpdateAsync(UserUpdateRequest request, User entity)
    {
        if (entity.DeletedAt != null)
            throw new UserException("Korisnik je obrisao profil. Taj nalog se više ne može mijenjati.");

        entity.Email = request.Email.Trim().ToLowerInvariant();
        await AccessRules.EnsureUniqueUserAsync(Context, entity.Email, null, entity.Id);
        await AccessRules.EnsureCityExistsAsync(Context, entity.CityId);

        if (entity.Id == CurrentUser.UserId && (!entity.IsActive || entity.Role != UserRole.Admin))
            throw new UserException("Ne možete deaktivirati vlastiti nalog niti sebi promijeniti ulogu.");

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            PasswordHasher.SetPassword(entity, request.NewPassword);
            entity.MustChangePassword = true;
        }
    }

    protected override Task BeforeDeleteAsync(User entity)
    {
        if (entity.Id == CurrentUser.UserId)
            throw new UserException("Ne možete obrisati vlastiti nalog.");
        return Task.CompletedTask;
    }
}
