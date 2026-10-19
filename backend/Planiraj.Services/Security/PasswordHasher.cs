using System.Security.Cryptography;
using Planiraj.Services.Database;

namespace Planiraj.Services.Security;

/// <summary>PBKDF2 (SHA-256) hashiranje lozinki sa nasumičnim saltom (NFR-3).</summary>
public static class PasswordHasher
{
    private const int SaltSize = 16;
    private const int KeySize = 32;
    private const int Iterations = 100_000;

    public static (string Hash, string Salt) Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return (Convert.ToBase64String(hash), Convert.ToBase64String(salt));
    }

    public static bool Verify(string password, string hash, string salt)
    {
        if (string.IsNullOrEmpty(hash) || string.IsNullOrEmpty(salt))
            return false;

        var saltBytes = Convert.FromBase64String(salt);
        var computed = Rfc2898DeriveBytes.Pbkdf2(password, saltBytes, Iterations, HashAlgorithmName.SHA256, KeySize);
        return CryptographicOperations.FixedTimeEquals(computed, Convert.FromBase64String(hash));
    }

    public static void SetPassword(User user, string password)
    {
        var (hash, salt) = Hash(password);
        user.PasswordHash = hash;
        user.PasswordSalt = salt;
    }
}
