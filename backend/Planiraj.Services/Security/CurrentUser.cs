using Planiraj.Model.Enums;
using Planiraj.Model.Exceptions;

namespace Planiraj.Services.Security;

/// <summary>Trenutno prijavljeni korisnik. Implementacija je u API projektu (čita JWT claimove).</summary>
public interface ICurrentUserService
{
    int? UserId { get; }
    UserRole? Role { get; }
}

public static class CurrentUserExtensions
{
    public static bool IsAdmin(this ICurrentUserService user) => user.Role == UserRole.Admin;

    public static int RequireUserId(this ICurrentUserService user) =>
        user.UserId ?? throw new ForbiddenException("Potrebna je prijava.");

    public static void EnsureAdmin(this ICurrentUserService user)
    {
        if (!user.IsAdmin())
            throw new ForbiddenException("Samo administrator može izvršiti ovu akciju.");
    }

    public static void EnsureRole(this ICurrentUserService user, UserRole role, string message)
    {
        if (user.Role != role)
            throw new ForbiddenException(message);
    }
}
