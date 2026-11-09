using Google.Apis.Auth;
using Planiraj.Model.Dtos;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Auth;

/// <summary>Podešavanja Google prijave. ClientId je javan (ide i u frontend), nije tajna.</summary>
public class GoogleSettings
{
    public string? ClientId { get; set; }
}

/// <summary>
/// Provjera Google ID tokena bibliotekom Google.Apis.Auth: potpis (Googleovi javni ključevi), izdavač,
/// rok važenja i publika (naš client id).
/// </summary>
public class GoogleTokenValidator : IGoogleTokenValidator
{
    private readonly ILogger<GoogleTokenValidator> _logger;

    public GoogleTokenValidator(Microsoft.Extensions.Options.IOptions<GoogleSettings> options, ILogger<GoogleTokenValidator> logger)
    {
        ClientId = string.IsNullOrWhiteSpace(options.Value.ClientId) ? null : options.Value.ClientId.Trim();
        _logger = logger;
    }

    public string? ClientId { get; }

    public async Task<GoogleIdentity?> ValidateAsync(string credential)
    {
        if (ClientId == null) return null;
        try
        {
            var p = await GoogleJsonWebSignature.ValidateAsync(credential, new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { ClientId },
                IssuedAtClockTolerance = TimeSpan.FromMinutes(1),
                ExpirationTimeClockTolerance = TimeSpan.FromMinutes(1)
            });
            if (string.IsNullOrEmpty(p.Subject) || string.IsNullOrEmpty(p.Email)) return null;
            return new GoogleIdentity(p.Subject, p.Email, p.EmailVerified, p.GivenName, p.FamilyName, p.Name);
        }
        catch (InvalidJwtException e)
        {
            _logger.LogInformation("Google token odbijen: {Reason}", e.Message);
            return null;
        }
    }
}
