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

    public Task<UserDto> GetCurrentAsync() => LoadAsync(_currentUser.RequireUserId());

    public async Task<UserDto> UpdateProfileAsync(ProfileUpdateRequest request)
    {
        var user = await FindCurrentAsync();
        await AccessRules.EnsureCityExistsAsync(_context, request.CityId);

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.PhoneNumber = request.PhoneNumber;
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
