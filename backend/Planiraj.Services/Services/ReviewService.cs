using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Model.Enums;
using Planiraj.Model.Exceptions;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Base;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>
/// Recenzije (FR-16 – FR-18). Ostavljaju ih mladenci, objavljuju se tek nakon odobrenja administratora.
/// [OTVORENO] Za sada recenziju može ostaviti svaki prijavljeni par (odluka #4 u zahtjevima).
/// </summary>
public class ReviewService
    : BaseCRUDService<ReviewDto, ReviewSearchObject, Review, ReviewInsertRequest, ReviewUpdateRequest>, IReviewService
{
    public ReviewService(PlanirajDbContext context, ICurrentUserService currentUser) : base(context, currentUser)
    {
    }

    protected override string EntityName => "Recenzija";

    protected override IQueryable<Review> AddFilter(ReviewSearchObject search, IQueryable<Review> query)
    {
        // Ostali vide samo odobrene recenzije, plus svoje vlastite (bez obzira na status).
        if (!CurrentUser.IsAdmin())
        {
            var userId = CurrentUser.UserId;
            query = query.Where(r => r.Status == ReviewStatus.Approved || (userId != null && r.UserId == userId));
        }

        if (search.VendorId.HasValue)
        {
            var vendorId = search.VendorId.Value;
            query = query.Where(r => r.VendorId == vendorId);
        }

        if (search.UserId.HasValue)
        {
            var filterUserId = search.UserId.Value;
            query = query.Where(r => r.UserId == filterUserId);
        }

        if (search.Status.HasValue)
        {
            var status = search.Status.Value;
            query = query.Where(r => r.Status == status);
        }

        return query;
    }

    protected override IQueryable<Review> AddInclude(IQueryable<Review> query) =>
        query.Include(r => r.Vendor).Include(r => r.User);

    protected override IQueryable<Review> ApplyOrdering(ReviewSearchObject search, IQueryable<Review> query) =>
        query.OrderByDescending(r => r.CreatedAt);

    protected override Task AuthorizeReadAsync(Review entity)
    {
        if (entity.Status != ReviewStatus.Approved && !CurrentUser.IsAdmin() && entity.UserId != CurrentUser.UserId)
            throw new NotFoundException($"Recenzija sa Id={entity.Id} nije pronađena.");
        return Task.CompletedTask;
    }

    /// <summary>Mijenjati može autor; brisati autor ili administrator.</summary>
    protected override Task AuthorizeWriteAsync(Review entity)
    {
        if (!CurrentUser.IsAdmin() && entity.UserId != CurrentUser.UserId)
            throw new ForbiddenException("Možete mijenjati samo svoje recenzije.");
        return Task.CompletedTask;
    }

    protected override async Task BeforeInsertAsync(ReviewInsertRequest request, Review entity)
    {
        CurrentUser.EnsureRole(UserRole.Couple, "Recenzije mogu ostavljati samo mladenci.");
        var userId = CurrentUser.RequireUserId();

        if (!await Context.Vendors.AnyAsync(v => v.Id == request.VendorId && v.IsActive))
            throw new UserException("Odabrani ponuđač ne postoji.");

        if (await Context.Reviews.AnyAsync(r => r.VendorId == request.VendorId && r.UserId == userId))
            throw new ConflictException("Već ste ostavili recenziju za ovog ponuđača. Možete je izmijeniti.");

        entity.UserId = userId;
        entity.Status = ReviewStatus.Pending;
        entity.CreatedAt = DateTime.UtcNow;
    }

    protected override Task BeforeUpdateAsync(ReviewUpdateRequest request, Review entity)
    {
        if (entity.UserId != CurrentUser.UserId)
            throw new ForbiddenException("Administrator ne mijenja tuđe recenzije, samo ih moderira.");

        // Izmijenjena recenzija ponovo ide na moderaciju.
        entity.Status = ReviewStatus.Pending;
        entity.ModeratedAt = null;
        entity.ModeratedByUserId = null;
        entity.UpdatedAt = DateTime.UtcNow;
        return Task.CompletedTask;
    }

    public Task<ReviewDto> ApproveAsync(int id) => ModerateAsync(id, ReviewStatus.Approved);

    public Task<ReviewDto> RejectAsync(int id) => ModerateAsync(id, ReviewStatus.Rejected);

    private async Task<ReviewDto> ModerateAsync(int id, ReviewStatus status)
    {
        CurrentUser.EnsureAdmin();
        var review = await FindTrackedAsync(id);

        review.Status = status;
        review.ModeratedAt = DateTime.UtcNow;
        review.ModeratedByUserId = CurrentUser.UserId;

        await Context.SaveChangesAsync();
        return await GetByIdAsync(id);
    }
}
