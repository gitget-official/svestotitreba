using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Planiraj.Model.Dtos;
using Planiraj.Model.Enums;
using Planiraj.Services.Security;

namespace Planiraj.API.Auth;

public static class AppClaims
{
    public const string UserId = "sub";
    public const string Name = "name";
    public const string Email = "email";
    public const string Role = "role";
    /// <summary>Sigurnosni pečat korisnika (User.SecurityStamp); token sa starim pečatom se odbija.</summary>
    public const string SecurityStamp = "sst";
}

public class JwtSettings
{
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    /// <summary>Tajni ključ, najmanje 32 znaka. U produkciji ide u varijable okruženja, ne u appsettings.</summary>
    public string Key { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 480;

    public static void EnsureValidKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length < 32)
            throw new InvalidOperationException(
                "Jwt:Key mora imati najmanje 32 znaka (appsettings.Development.json ili varijabla okruženja Jwt__Key).");
    }

    /// <summary>
    /// Ključ iz appsettings.Development.json je javan (u repozitoriju): izvan razvoja bi svako mogao potpisati
    /// token za bilo koji nalog, pa se API tada ne pokreće.
    /// </summary>
    public static void EnsureNotDevelopmentKey(string? key, string contentRootPath)
    {
        if (string.IsNullOrEmpty(key)) return;
        var devKey = new ConfigurationBuilder()
            .SetBasePath(contentRootPath)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build()["Jwt:Key"];
        if (!string.IsNullOrEmpty(devKey) && string.Equals(devKey, key, StringComparison.Ordinal))
            throw new InvalidOperationException(
                "Jwt:Key je razvojni ključ iz appsettings.Development.json. Izvan razvoja postavite novi tajni ključ (Jwt__Key).");
    }
}

public interface ITokenService
{
    (string Token, DateTime ExpiresAt) CreateToken(UserDto user, string securityStamp);
}

public class TokenService : ITokenService
{
    private readonly JwtSettings _settings;

    public TokenService(IOptions<JwtSettings> options)
    {
        _settings = options.Value;
        JwtSettings.EnsureValidKey(_settings.Key);
    }

    public (string Token, DateTime ExpiresAt) CreateToken(UserDto user, string securityStamp)
    {
        var expiresAt = DateTime.UtcNow.AddMinutes(_settings.ExpiresMinutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.Key));

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _settings.Issuer,
            Audience = _settings.Audience,
            Expires = expiresAt,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                [AppClaims.UserId] = user.Id.ToString(),
                [AppClaims.Name] = user.Username,
                [AppClaims.Email] = user.Email,
                [AppClaims.Role] = user.Role.ToString(),
                [AppClaims.SecurityStamp] = securityStamp
            }
        };

        return (new JsonWebTokenHandler().CreateToken(descriptor), expiresAt);
    }
}

/// <summary>Čita prijavljenog korisnika iz JWT tokena trenutnog HTTP zahtjeva.</summary>
public class HttpCurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentUserService(IHttpContextAccessor accessor)
    {
        _accessor = accessor;
    }

    public int? UserId
    {
        get
        {
            var value = _accessor.HttpContext?.User.FindFirst(AppClaims.UserId)?.Value;
            return int.TryParse(value, out var id) ? id : null;
        }
    }

    public UserRole? Role
    {
        get
        {
            var value = _accessor.HttpContext?.User.FindFirst(AppClaims.Role)?.Value;
            return Enum.TryParse<UserRole>(value, out var role) ? role : null;
        }
    }
}
