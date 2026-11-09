using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Model.Exceptions;
using Planiraj.Model.Requests;
using Planiraj.Services.Database;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>"Sačuvano": svaki prijavljeni korisnik vidi i mijenja samo svoju listu.</summary>
public class FavoriteService : IFavoriteService
{
    private readonly PlanirajDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public FavoriteService(PlanirajDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public Task<List<FavoriteDto>> ListAsync() => ListForAsync(_currentUser.RequireUserId());

    public async Task<FavoriteDto> AddAsync(int vendorId)
    {
        var userId = _currentUser.RequireUserId();
        if (!await _context.Vendors.AnyAsync(v => v.Id == vendorId && v.IsActive))
            throw new NotFoundException("Ponuđač nije pronađen.");

        var existing = await _context.Favorites.FirstOrDefaultAsync(f => f.UserId == userId && f.VendorId == vendorId);
        if (existing == null)
        {
            existing = new Favorite { UserId = userId, VendorId = vendorId, CreatedAt = DateTime.UtcNow };
            _context.Favorites.Add(existing);
            await _context.SaveChangesAsync();
        }
        return new FavoriteDto { VendorId = existing.VendorId, CreatedAt = existing.CreatedAt };
    }

    public async Task RemoveAsync(int vendorId)
    {
        var userId = _currentUser.RequireUserId();
        var fav = await _context.Favorites.FirstOrDefaultAsync(f => f.UserId == userId && f.VendorId == vendorId);
        if (fav == null) return;
        _context.Favorites.Remove(fav);
        await _context.SaveChangesAsync();
    }

    public async Task<List<FavoriteDto>> SyncAsync(FavoriteSyncRequest request)
    {
        var userId = _currentUser.RequireUserId();
        var wanted = request.VendorIds.Distinct().ToList();
        if (wanted.Count > 0)
        {
            var have = await _context.Favorites.Where(f => f.UserId == userId).Select(f => f.VendorId).ToListAsync();
            var missing = wanted.Except(have).ToList();
            var valid = await _context.Vendors.Where(v => missing.Contains(v.Id) && v.IsActive).Select(v => v.Id).ToListAsync();
            var now = DateTime.UtcNow;
            // redoslijed sa uređaja ostaje: prvi u listi je najnoviji
            for (var i = 0; i < valid.Count; i++)
                _context.Favorites.Add(new Favorite { UserId = userId, VendorId = valid[i], CreatedAt = now.AddMilliseconds(-wanted.IndexOf(valid[i])) });
            if (valid.Count > 0) await _context.SaveChangesAsync();
        }
        return await ListForAsync(userId);
    }

    private Task<List<FavoriteDto>> ListForAsync(int userId) =>
        _context.Favorites.AsNoTracking()
            .Where(f => f.UserId == userId && f.Vendor.IsActive)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FavoriteDto { VendorId = f.VendorId, CreatedAt = f.CreatedAt })
            .ToListAsync();
}

/// <summary>"Moj plan" (FR-27): jedan plan po korisniku, sadržaj je JSON koji piše frontend.</summary>
public class PlanService : IPlanService
{
    /// <summary>Plan sa desetak kategorija ima par KB; ograničenje čuva bazu od prevelikih zahtjeva.</summary>
    public const int MaxDataLength = 100_000;

    private readonly PlanirajDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public PlanService(PlanirajDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async Task<PlanDto?> GetAsync()
    {
        var userId = _currentUser.RequireUserId();
        var plan = await _context.SavedPlans.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId);
        return plan == null ? null : ToDto(plan);
    }

    public async Task<PlanDto> SaveAsync(PlanSaveRequest request)
    {
        var userId = _currentUser.RequireUserId();
        if (request.Answers.ValueKind != JsonValueKind.Object || request.Items.ValueKind != JsonValueKind.Array)
            throw new UserException("Plan nije ispravan.");

        var data = JsonSerializer.Serialize(new { answers = request.Answers, items = request.Items });
        if (data.Length > MaxDataLength)
            throw new UserException("Plan je prevelik.");

        var plan = await _context.SavedPlans.FirstOrDefaultAsync(p => p.UserId == userId);
        var now = DateTime.UtcNow;
        if (plan == null)
        {
            plan = new SavedPlan { UserId = userId };
            _context.SavedPlans.Add(plan);
        }
        plan.Data = data;
        plan.UpdatedAt = now;
        if (request.Manual) plan.SavedAt = now;
        await _context.SaveChangesAsync();
        return ToDto(plan);
    }

    public async Task DeleteAsync()
    {
        var userId = _currentUser.RequireUserId();
        var plan = await _context.SavedPlans.FirstOrDefaultAsync(p => p.UserId == userId);
        if (plan == null) return;
        _context.SavedPlans.Remove(plan);
        await _context.SaveChangesAsync();
    }

    private static PlanDto ToDto(SavedPlan plan)
    {
        using var doc = JsonDocument.Parse(plan.Data);
        var root = doc.RootElement;
        return new PlanDto
        {
            Answers = root.TryGetProperty("answers", out var a) ? a.Clone() : JsonDocument.Parse("{}").RootElement.Clone(),
            Items = root.TryGetProperty("items", out var i) ? i.Clone() : JsonDocument.Parse("[]").RootElement.Clone(),
            SavedAt = plan.SavedAt,
            UpdatedAt = plan.UpdatedAt
        };
    }
}
