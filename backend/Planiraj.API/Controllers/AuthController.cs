using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

    public AuthController(IAuthService authService, ITokenService tokenService)
    {
        _authService = authService;
        _tokenService = tokenService;
    }

    [AllowAnonymous]
    [HttpPost("login")]
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
