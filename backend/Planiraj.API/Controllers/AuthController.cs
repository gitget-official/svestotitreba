using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Planiraj.API.Auth;
using Planiraj.Model.Dtos;
using Planiraj.Model.Requests;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>/api/auth — prijava, registracija mladenaca i vlastiti profil.</summary>
[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ITokenService _tokenService;
    private readonly IGoogleTokenValidator _google;

    public AuthController(IAuthService authService, ITokenService tokenService, IGoogleTokenValidator google)
    {
        _authService = authService;
        _tokenService = tokenService;
        _google = google;
    }

    /// <summary>Javna podešavanja prijave (Google client id), da frontend zna treba li prikazati Google dugme.</summary>
    [AllowAnonymous]
    [HttpGet("config")]
    public AuthConfigDto Config() => new() { GoogleClientId = _google.ClientId };

    /// <summary>
    /// Prijava i registracija mladenaca preko Googlea. Prima ID token sa Googleovog dugmeta, provjerava ga
    /// i vraća naš JWT. Novi nalog dobija IsNew = true (frontend vodi na dovršavanje profila).
    /// </summary>
    [AllowAnonymous]
    [HttpPost("google")]
    [EnableRateLimiting(RateLimits.Auth)]
    public Task<ActionResult<AuthResponse>> Google([FromBody] GoogleLoginRequest request) =>
        GoogleLoginAsync(request, _authService.LoginWithGoogleAsync);

    /// <summary>
    /// Prijava i registracija salona preko Googlea (posebna stranica za salone). Novi nalog dobija ulogu
    /// Vendor i IsNew = true, pa frontend vodi na postavljanje salona.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("google/salon")]
    [EnableRateLimiting(RateLimits.Auth)]
    public Task<ActionResult<AuthResponse>> GoogleSalon([FromBody] GoogleLoginRequest request) =>
        GoogleLoginAsync(request, _authService.LoginVendorWithGoogleAsync);

    private async Task<ActionResult<AuthResponse>> GoogleLoginAsync(
        GoogleLoginRequest request, Func<GoogleIdentity, Task<(UserDto User, bool IsNew)>> login)
    {
        if (_google.ClientId == null)
            return StatusCode(503, new { status = 503, message = "Prijava preko Googlea još nije podešena." });

        var identity = await _google.ValidateAsync(request.Credential);
        if (identity == null)
            return Unauthorized(new { status = 401, message = "Prijava preko Googlea nije uspjela. Pokušajte ponovo." });

        var (user, isNew) = await login(identity);
        var response = CreateAuthResponse(user);
        response.IsNew = isNew;
        return response;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _authService.ValidateCredentialsAsync(request.Login, request.Password);
        if (user == null)
            return Unauthorized(new { status = 401, message = "Pogrešno korisničko ime ili lozinka." });

        return CreateAuthResponse(user);
    }

    /// <summary>Samostalna registracija mladenaca (FR-2). Ponuđačima nalog kreira administrator.</summary>
    [AllowAnonymous]
    [HttpPost("register")]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        var user = await _authService.RegisterCoupleAsync(request);
        return CreateAuthResponse(user);
    }

    [Authorize]
    [HttpGet("me")]
    public Task<UserDto> Me() => _authService.GetCurrentAsync();

    [Authorize]
    [HttpPut("me")]
    public Task<UserDto> UpdateProfile([FromBody] ProfileUpdateRequest request) => _authService.UpdateProfileAsync(request);

    /// <summary>Brisanje vlastitog profila (mladenci). Poslije toga token više ne važi.</summary>
    [Authorize]
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteAccount()
    {
        await _authService.DeleteAccountAsync();
        return NoContent();
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        await _authService.ChangePasswordAsync(request);
        return NoContent();
    }

    private AuthResponse CreateAuthResponse(UserDto user)
    {
        var (token, expiresAt) = _tokenService.CreateToken(user);
        return new AuthResponse { Token = token, ExpiresAt = expiresAt, User = user };
    }
}
