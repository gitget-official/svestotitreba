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
using Planiraj.Services.Notifications;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>
/// Rezervacije termina (FR-19 – FR-23). Samo kod ponuđača koji imaju uključeno zakazivanje.
/// Potvrda je automatska ili ručna, po izboru ponuđača. Avans je za sada samo informativan (@TODO odluka #5).
/// Svaka promjena dodaje e-mail obavijesti u red u istoj transakciji (FR-15, vidi BookingNotifier).
/// </summary>
public class BookingService
    : BaseCRUDService<BookingDto, BookingSearchObject, Booking, BookingInsertRequest, BookingUpdateRequest>, IBookingService
{
    private readonly IBookingNotifier _notifier;

    public BookingService(PlanirajDbContext context, ICurrentUserService currentUser, IBookingNotifier notifier)
        : base(context, currentUser)
    {
        _notifier = notifier;
    }

    /// <summary>
    /// Rezervacija i obavijesti u jednoj transakciji: obavijestima treba Id rezervacije (link, kalendar),
    /// pa se snima dvaput, ali ili se snimi oboje ili ništa.
    /// </summary>
    public override async Task<BookingDto> InsertAsync(BookingInsertRequest request)
    {
        await using var transaction = await Context.Database.BeginTransactionAsync();
        var result = await base.InsertAsync(request);
        await _notifier.QueueAsync(result.Id, BookingEmailEvent.Created);
        await Context.SaveChangesAsync();
        await transaction.CommitAsync();
        return result;
    }

    protected override string EntityName => "Rezervacija";

    protected override IQueryable<Booking> AddFilter(BookingSearchObject search, IQueryable<Booking> query)
    {
        var userId = CurrentUser.UserId;
        query = CurrentUser.Role switch
        {
            UserRole.Admin => query,
            UserRole.Vendor => query.Where(b => b.Vendor.OwnerUserId == userId),
            _ => query.Where(b => b.UserId == userId)
        };

        if (search.VendorId.HasValue)
        {
            var vendorId = search.VendorId.Value;
            query = query.Where(b => b.VendorId == vendorId);
        }

        if (search.UserId.HasValue)
        {
            var filterUserId = search.UserId.Value;
            query = query.Where(b => b.UserId == filterUserId);
        }

        if (search.Status.HasValue)
        {
            var status = search.Status.Value;
            query = query.Where(b => b.Status == status);
        }

        if (search.DateFrom.HasValue)
        {
            var from = search.DateFrom.Value;
            query = query.Where(b => b.EventDate >= from);
        }

        if (search.DateTo.HasValue)
        {
            var to = search.DateTo.Value;
            query = query.Where(b => b.EventDate <= to);
        }

        return query;
    }

    protected override IQueryable<Booking> AddInclude(IQueryable<Booking> query) =>
        query.Include(b => b.Vendor).Include(b => b.Offering).Include(b => b.User);

    protected override IQueryable<Booking> ApplyOrdering(BookingSearchObject search, IQueryable<Booking> query) =>
        query.OrderBy(b => b.EventDate).ThenBy(b => b.StartTime);

    protected override Task AuthorizeReadAsync(Booking entity)
    {
        var allowed = CurrentUser.Role switch
        {
            UserRole.Admin => true,
            UserRole.Vendor => entity.Vendor.OwnerUserId == CurrentUser.UserId,
            _ => entity.UserId == CurrentUser.UserId
        };
        if (!allowed)
            throw new NotFoundException($"Rezervacija sa Id={entity.Id} nije pronađena.");
        return Task.CompletedTask;
    }

    /// <summary>Izmjena: korisnik koji je napravio rezervaciju ili administrator.</summary>
    protected override Task AuthorizeWriteAsync(Booking entity)
    {
        if (!CurrentUser.IsAdmin() && entity.UserId != CurrentUser.UserId)
            throw new ForbiddenException("Možete mijenjati samo svoje rezervacije.");
        return Task.CompletedTask;
    }

    protected override async Task BeforeInsertAsync(BookingInsertRequest request, Booking entity)
    {
        CurrentUser.EnsureRole(UserRole.Couple, "Rezervacije mogu praviti samo mladenci.");

        var vendor = await Context.Vendors.AsNoTracking().FirstOrDefaultAsync(v => v.Id == request.VendorId && v.IsActive)
                     ?? throw new UserException("Odabrani ponuđač ne postoji.");

        if (!vendor.BookingEnabled)
            throw new UserException("Ovaj ponuđač ne prima rezervacije putem platforme. Kontaktirajte ga putem poruka ili telefona.");

        ValidateDate(request.EventDate);
        await ValidateOfferingAsync(vendor.Id, request.OfferingId);
        await EnsureSlotAvailableAsync(vendor.Id, request.EventDate, request.StartTime, null);

        entity.UserId = CurrentUser.RequireUserId();
        entity.Status = vendor.AutoConfirmBookings ? BookingStatus.Confirmed : BookingStatus.Pending;
        entity.CreatedAt = DateTime.UtcNow;
    }

    protected override async Task BeforeUpdateAsync(BookingUpdateRequest request, Booking entity)
    {
        if (entity.Status != BookingStatus.Pending)
            throw new UserException("Moguće je mijenjati samo rezervacije koje čekaju potvrdu.");

        ValidateDate(request.EventDate);
        await ValidateOfferingAsync(entity.VendorId, request.OfferingId);
        await EnsureSlotAvailableAsync(entity.VendorId, request.EventDate, request.StartTime, entity.Id);

        entity.UpdatedAt = DateTime.UtcNow;
        await _notifier.QueueAsync(entity.Id, BookingEmailEvent.Updated);
    }

    /// <summary>Brisanje samo administrator; ostali koriste otkazivanje.</summary>
    protected override Task BeforeDeleteAsync(Booking entity)
    {
        CurrentUser.EnsureAdmin();
        return Task.CompletedTask;
    }

    public async Task<BookingDto> ConfirmAsync(int id)
    {
        var booking = await FindTrackedAsync(id);
        await AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, booking.VendorId);

        if (booking.Status != BookingStatus.Pending)
            throw new UserException("Moguće je potvrditi samo rezervaciju koja čeka potvrdu.");

        await EnsureSlotAvailableAsync(booking.VendorId, booking.EventDate, booking.StartTime, booking.Id);

        booking.Status = BookingStatus.Confirmed;
        booking.UpdatedAt = DateTime.UtcNow;
        await _notifier.QueueAsync(booking.Id, BookingEmailEvent.Confirmed);
        await Context.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    public async Task<BookingDto> RejectAsync(int id, BookingStatusChangeRequest request)
    {
        var booking = await FindTrackedAsync(id);
        await AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, booking.VendorId);

        if (booking.Status != BookingStatus.Pending)
            throw new UserException("Moguće je odbiti samo rezervaciju koja čeka potvrdu.");

        booking.Status = BookingStatus.Rejected;
        booking.StatusNote = request.Note;
        booking.UpdatedAt = DateTime.UtcNow;
        await _notifier.QueueAsync(booking.Id, BookingEmailEvent.Rejected);
        await Context.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    public async Task<BookingDto> CancelAsync(int id, BookingStatusChangeRequest request)
    {
        var booking = await FindTrackedAsync(id);

        // Otkazati mogu mladenci (svoju rezervaciju) ili ponuđač/administrator.
        if (booking.UserId != CurrentUser.UserId)
            await AccessRules.EnsureCanManageVendorAsync(Context, CurrentUser, booking.VendorId);

        if (booking.Status is not (BookingStatus.Pending or BookingStatus.Confirmed))
            throw new UserException("Ova rezervacija je već zatvorena.");

        booking.Status = BookingStatus.Cancelled;
        booking.StatusNote = request.Note;
        booking.UpdatedAt = DateTime.UtcNow;
        await _notifier.QueueAsync(booking.Id, BookingEmailEvent.Cancelled);
        await Context.SaveChangesAsync();
        return await GetByIdAsync(id);
    }

    private static void ValidateDate(DateOnly eventDate)
    {
        if (eventDate < DateOnly.FromDateTime(DateTime.Today))
            throw new UserException("Datum rezervacije ne može biti u prošlosti.");
    }

    private async Task ValidateOfferingAsync(int vendorId, int? offeringId)
    {
        if (offeringId.HasValue
            && !await Context.VendorOfferings.AnyAsync(o => o.Id == offeringId.Value && o.VendorId == vendorId && o.IsActive))
            throw new UserException("Odabrana usluga ne pripada ovom ponuđaču.");
    }

    /// <summary>Jednostavno pravilo (FR-22): isti dan i isto vrijeme ne mogu imati dvije potvrđene rezervacije.</summary>
    private async Task EnsureSlotAvailableAsync(int vendorId, DateOnly date, TimeOnly? startTime, int? excludeBookingId)
    {
        var taken = await Context.Bookings.AnyAsync(b =>
            b.VendorId == vendorId
            && b.EventDate == date
            && b.StartTime == startTime
            && b.Status == BookingStatus.Confirmed
            && b.Id != excludeBookingId);

        if (taken)
            throw new ConflictException("Odabrani termin je već zauzet.");
    }
}
