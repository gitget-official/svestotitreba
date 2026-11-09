using Mapster;
using Microsoft.EntityFrameworkCore;
using Planiraj.Model.Dtos;
using Planiraj.Model.Enums;
using Planiraj.Model.Exceptions;
using Planiraj.Model.Requests;
using Planiraj.Services.Database;
using Planiraj.Services.Helpers;
using Planiraj.Services.Interfaces;
using Planiraj.Services.Security;

namespace Planiraj.Services.Services;

/// <summary>Prijava, registracija mladenaca i upravljanje vlastitim profilom (FR-1, FR-2, FR-3).</summary>
public class AuthService : IAuthService
{
    private readonly PlanirajDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public AuthService(PlanirajDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async Task<UserDto?> ValidateCredentialsAsync(string login, string password)
    {
        var username = login.Trim();
        var email = username.ToLowerInvariant();

        var user = await _context.Users
            .Include(u => u.City)
            .FirstOrDefaultAsync(u => u.Email == email || u.Username == username);

        if (user == null || !user.IsActive || !PasswordHasher.Verify(password, user.PasswordHash, user.PasswordSalt))
            return null;

        user.LastLoginAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return user.Adapt<UserDto>();
    }

    public async Task<UserDto> RegisterCoupleAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var username = request.Username.Trim();

        await AccessRules.EnsureUniqueUserAsync(_context, email, username, null);
        await AccessRules.EnsureCityExistsAsync(_context, request.CityId);

        var user = new User
        {
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = email,
            Username = username,
            PhoneNumber = request.PhoneNumber,
            AvatarUrl = NullIfEmpty(request.AvatarUrl),
            CityId = request.CityId,
            Role = UserRole.Couple,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        PasswordHasher.SetPassword(user, request.Password);

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return await LoadAsync(user.Id);
    }

    public Task<(UserDto User, bool IsNew)> LoginWithGoogleAsync(GoogleIdentity identity) =>
        GoogleLoginAsync(identity, UserRole.Couple);

    public Task<(UserDto User, bool IsNew)> LoginVendorWithGoogleAsync(GoogleIdentity identity) =>
        GoogleLoginAsync(identity, UserRole.Vendor);

    /// <summary>
    /// Zajednička Google prijava. <paramref name="role"/> je uloga sa čije stranice se korisnik prijavljuje
    /// (mladenci ili saloni): novi nalog dobija tu ulogu, a postojeći nalog iste e-mail adrese se povezuje samo
    /// ako ima tu ulogu. Već povezan nalog se prijavljuje bez obzira na stranicu, osim mladenaca na stranici za salone.
    /// </summary>
    private async Task<(UserDto User, bool IsNew)> GoogleLoginAsync(GoogleIdentity identity, UserRole role)
    {
        if (!identity.EmailVerified)
            throw new UserException("Google nalog nema potvrđen e-mail. Potvrdite ga kod Googlea pa pokušajte ponovo.");

        var email = identity.Email.Trim().ToLowerInvariant();

        // 1) nalog je već povezan sa ovim Google nalogom
        var user = await _context.Users.FirstOrDefaultAsync(u => u.GoogleId == identity.Subject);
        if (user != null && role == UserRole.Vendor && user.Role == UserRole.Couple)
            throw new UserException(CoupleNotVendor);

        // 2) nalog sa istim e-mailom postoji (npr. salon koji je napravio admin): povezuje se samo ako ima istu ulogu.
        //    Administratori se i dalje prijavljuju korisničkim imenom i lozinkom.
        if (user == null)
        {
            user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user != null)
            {
                if (user.Role == UserRole.Couple && role == UserRole.Vendor)
                    throw new UserException(CoupleNotVendor);
                if (user.Role == UserRole.Vendor && role == UserRole.Couple)
                    throw new UserException("Ova e-mail adresa pripada salonu. Prijavite se na stranici za salone.");
                if (user.Role != role)
                    throw new UserException("Ovaj nalog se prijavljuje korisničkim imenom i lozinkom.");
                user.GoogleId = identity.Subject;
            }
        }

        if (user != null)
        {
            if (!user.IsActive)
                throw new ForbiddenException("Nalog je deaktiviran.");
            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return (await LoadAsync(user.Id), false);
        }

        // 3) novi nalog (mladenci ili salon), bez lozinke; ime i prezime se mogu urediti kasnije
        var (first, last) = SplitName(identity, email);
        user = new User
        {
            FirstName = first,
            LastName = last,
            Email = email,
            Username = await UniqueUsernameAsync(email),
            GoogleId = identity.Subject,
            Role = role,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return (await LoadAsync(user.Id), true);
    }

    private const string CoupleNotVendor =
        "Ovaj Google nalog je već profil mladenaca. Za salon se prijavite drugim Google nalogom (npr. poslovnim).";

    /// <summary>Ime i prezime iz Googlea (given/family name), inače iz punog imena ili dijela e-maila prije @.</summary>
    internal static (string First, string Last) SplitName(GoogleIdentity identity, string email)
    {
        static string Clip(string? s)
        {
            var t = (s ?? string.Empty).Trim();
            return t.Length > 100 ? t[..100] : t;
        }
        var first = Clip(identity.GivenName);
        var last = Clip(identity.FamilyName);
        if (first.Length == 0 && !string.IsNullOrWhiteSpace(identity.Name))
        {
            var parts = identity.Name.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            first = Clip(parts[0]);
            if (last.Length == 0 && parts.Length > 1) last = Clip(parts[1]);
        }
        if (first.Length == 0) first = Clip(email.Split('@')[0]);
        return (first, last);
    }

    /// <summary>Korisničko ime iz e-maila (mala slova, brojevi, tačka, crtica, donja crta), uz broj ako je zauzeto.</summary>
    private async Task<string> UniqueUsernameAsync(string email)
    {
        var baseName = UsernameFromEmail(email);
        var candidate = baseName;
        for (var i = 2; await _context.Users.AnyAsync(u => u.Username == candidate); i++)
        {
            var suffix = i.ToString();
            candidate = (baseName.Length + suffix.Length > 50 ? baseName[..(50 - suffix.Length)] : baseName) + suffix;
        }
        return candidate;
    }

    internal static string UsernameFromEmail(string email)
    {
        var local = email.Split('@')[0].ToLowerInvariant();
        var clean = new string(local.Where(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c is '.' or '_' or '-').ToArray()).Trim('.', '_', '-');
        if (clean.Length < 3) clean += "mladenci";
        return clean.Length > 40 ? clean[..40] : clean;
    }

    public Task<UserDto> GetCurrentAsync() => LoadAsync(_currentUser.RequireUserId());

    public async Task<UserDto> UpdateProfileAsync(ProfileUpdateRequest request)
    {
        var user = await FindCurrentAsync();
        await AccessRules.EnsureCityExistsAsync(_context, request.CityId);

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.PhoneNumber = request.PhoneNumber;
        user.AvatarUrl = NullIfEmpty(request.AvatarUrl);
        user.CityId = request.CityId;

        await _context.SaveChangesAsync();
        return await LoadAsync(user.Id);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request)
    {
        var user = await FindCurrentAsync();

        if (!PasswordHasher.Verify(request.CurrentPassword, user.PasswordHash, user.PasswordSalt))
            throw new UserException("Trenutna lozinka nije ispravna.");

        if (request.CurrentPassword == request.NewPassword)
            throw new UserException("Nova lozinka mora biti različita od trenutne.");

        PasswordHasher.SetPassword(user, request.NewPassword);
        user.MustChangePassword = false;
        await _context.SaveChangesAsync();
    }

    public async Task DeleteAccountAsync()
    {
        var user = await FindCurrentAsync();
        if (user.Role != UserRole.Couple)
            throw new UserException("Nalog salona ili administratora briše administrator. Pišite nam na e-mail.");

        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);

        _context.Favorites.RemoveRange(_context.Favorites.Where(f => f.UserId == user.Id));
        _context.SavedPlans.RemoveRange(_context.SavedPlans.Where(p => p.UserId == user.Id));

        var bookings = await _context.Bookings.Where(b => b.UserId == user.Id).ToListAsync();
        foreach (var b in bookings)
        {
            b.Note = null;
            if (b.Status is BookingStatus.Pending or BookingStatus.Confirmed && b.EventDate >= today)
            {
                b.Status = BookingStatus.Cancelled;
                b.StatusNote = "Mladenci su obrisali profil.";
                b.UpdatedAt = now;
            }
        }

        // Red korisnika ostaje zbog recenzija i rezervacija salona, ali bez ičega što ga identifikuje.
        user.FirstName = "Obrisan";
        user.LastName = "korisnik";
        user.Email = $"obrisan-{user.Id}@obrisano.invalid";
        user.Username = $"obrisan-{user.Id}";
        user.PhoneNumber = null;
        user.AvatarUrl = null;
        user.CityId = null;
        user.GoogleId = null;
        user.PasswordHash = string.Empty;
        user.PasswordSalt = string.Empty;
        user.IsActive = false;
        user.DeletedAt = now;

        await _context.SaveChangesAsync();
    }

    public Task<bool> IsActiveAsync(int userId) =>
        _context.Users.AnyAsync(u => u.Id == userId && u.IsActive && u.DeletedAt == null);

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private async Task<User> FindCurrentAsync()
    {
        var id = _currentUser.RequireUserId();
        return await _context.Users.FindAsync(id)
               ?? throw new NotFoundException("Korisnik nije pronađen.");
    }

    private async Task<UserDto> LoadAsync(int id)
    {
        var user = await _context.Users.AsNoTracking()
                       .Include(u => u.City)
                       .FirstOrDefaultAsync(u => u.Id == id)
                   ?? throw new NotFoundException("Korisnik nije pronađen.");
        return user.Adapt<UserDto>();
    }
}
