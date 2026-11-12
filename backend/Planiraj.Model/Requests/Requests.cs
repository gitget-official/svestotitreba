using System.ComponentModel.DataAnnotations;
using Planiraj.Model.Enums;

namespace Planiraj.Model.Requests;

// ---------- Auth ----------

public class LoginRequest
{
    /// <summary>Korisničko ime ili e-mail.</summary>
    [Required] public string Login { get; set; } = string.Empty;
    [Required] public string Password { get; set; } = string.Empty;
}

/// <summary>Spajanje lokalno sačuvanih ponuđača (gost ili drugi uređaj) sa onima na serveru.</summary>
public class FavoriteSyncRequest
{
    [MaxLength(500)] public List<int> VendorIds { get; set; } = new();
}

/// <summary>Čuvanje plana: odgovori iz planera i stavke (JSON objekt i JSON niz).</summary>
public class PlanSaveRequest
{
    public System.Text.Json.JsonElement Answers { get; set; }
    public System.Text.Json.JsonElement Items { get; set; }
    /// <summary>True kad je korisnik sam kliknuo "Sačuvaj" (inače automatsko čuvanje).</summary>
    public bool Manual { get; set; } = true;
}

/// <summary>Prijava ili registracija mladenaca preko Googlea: ID token (JWT) koji vrati Googleovo dugme.</summary>
public class GoogleLoginRequest
{
    [Required, MaxLength(4096)] public string Credential { get; set; } = string.Empty;
}

/// <summary>Samostalna registracija mladenaca (FR-2).</summary>
public class RegisterRequest
{
    [Required, MaxLength(100)] public string FirstName { get; set; } = string.Empty;
    [Required, MaxLength(100)] public string LastName { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(256)] public string Email { get; set; } = string.Empty;
    [Required, MinLength(3), MaxLength(50)] public string Username { get; set; } = string.Empty;
    [MaxLength(30)] public string? PhoneNumber { get; set; }
    public int? CityId { get; set; }
    [Required, MinLength(8), MaxLength(100)] public string Password { get; set; } = string.Empty;
    [Avatar] public string? AvatarUrl { get; set; }
}

public class ProfileUpdateRequest
{
    [Required, MaxLength(100)] public string FirstName { get; set; } = string.Empty;
    [Required, MaxLength(100)] public string LastName { get; set; } = string.Empty;
    [MaxLength(30)] public string? PhoneNumber { get; set; }
    public int? CityId { get; set; }
    [Avatar] public string? AvatarUrl { get; set; }
}

/// <summary>
/// Profilna slika: ilustrovani avatar ("avatar:ruza") ili fotografija koju frontend umanji na 256 px
/// i pošalje kao data URL (JPEG/PNG/WebP). Dok ne postoji upload fajlova, slika se čuva uz korisnika.
/// </summary>
[AttributeUsage(AttributeTargets.Property)]
public sealed class AvatarAttribute : ValidationAttribute
{
    /// <summary>~150 KB slike u base64; umanjena fotografija od 256 px je obično 15–40 KB.</summary>
    public const int MaxLength = 200_000;

    private static readonly System.Text.RegularExpressions.Regex Preset = new("^avatar:[a-z0-9-]{1,40}$");
    private static readonly System.Text.RegularExpressions.Regex Photo = new("^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$");

    protected override ValidationResult? IsValid(object? value, ValidationContext context)
    {
        if (value is not string s || s.Length == 0) return ValidationResult.Success;
        if (s.Length > MaxLength) return new ValidationResult("Fotografija je prevelika.");
        return Preset.IsMatch(s) || Photo.IsMatch(s)
            ? ValidationResult.Success
            : new ValidationResult("Neispravna profilna slika.");
    }
}

public class ChangePasswordRequest
{
    [Required] public string CurrentPassword { get; set; } = string.Empty;
    [Required, MinLength(8), MaxLength(100)] public string NewPassword { get; set; } = string.Empty;
}

// ---------- Users (administrator) ----------

public class UserInsertRequest
{
    [Required, MaxLength(100)] public string FirstName { get; set; } = string.Empty;
    [Required, MaxLength(100)] public string LastName { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(256)] public string Email { get; set; } = string.Empty;
    [Required, MinLength(3), MaxLength(50)] public string Username { get; set; } = string.Empty;
    [MaxLength(30)] public string? PhoneNumber { get; set; }
    public int? CityId { get; set; }
    [Required] public UserRole Role { get; set; }
    /// <summary>Početna lozinka; ponuđač je mijenja pri prvoj prijavi (FR-3).</summary>
    [Required, MinLength(8), MaxLength(100)] public string Password { get; set; } = string.Empty;
}

public class UserUpdateRequest
{
    [Required, MaxLength(100)] public string FirstName { get; set; } = string.Empty;
    [Required, MaxLength(100)] public string LastName { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(256)] public string Email { get; set; } = string.Empty;
    [MaxLength(30)] public string? PhoneNumber { get; set; }
    public int? CityId { get; set; }
    [Required] public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>Opciono: administrator postavlja novu lozinku (korisnik je mora promijeniti).</summary>
    [MinLength(8), MaxLength(100)] public string? NewPassword { get; set; }
}

// ---------- Šifarnici ----------

public class CityUpsertRequest
{
    [Required, MaxLength(100)] public string Name { get; set; } = string.Empty;
    /// <summary>Centar grada (opciono); koristi se na mapi za ponuđače bez vlastitih koordinata.</summary>
    [Range(-90, 90)] public double? Latitude { get; set; }
    [Range(-180, 180)] public double? Longitude { get; set; }
}

public class ServiceCategoryInsertRequest
{
    [Required, MaxLength(100)] public string Name { get; set; } = string.Empty;
    [MaxLength(1000)] public string? Description { get; set; }
    public int SortOrder { get; set; }
}

public class ServiceCategoryUpdateRequest
{
    [Required, MaxLength(100)] public string Name { get; set; } = string.Empty;
    [MaxLength(1000)] public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class SubscriptionPlanUpsertRequest
{
    [Required, MaxLength(100)] public string Name { get; set; } = string.Empty;
    [MaxLength(1000)] public string? Description { get; set; }
    [Range(0, 100000)] public decimal Price { get; set; }
    [Range(1, 3650)] public int DurationDays { get; set; } = 30;
    /// <summary>Veći broj = viša pozicija u rezultatima pretrage.</summary>
    [Range(0, 100)] public int PriorityWeight { get; set; }
    public bool IsActive { get; set; } = true;
}

// ---------- Ponuđači ----------

public class VendorInsertRequest
{
    [Required, MaxLength(150)] public string Name { get; set; } = string.Empty;
    [MaxLength(4000)] public string? Description { get; set; }
    [Required] public int CityId { get; set; }
    [MaxLength(250)] public string? Address { get; set; }
    [Range(-90, 90)] public double? Latitude { get; set; }
    [Range(-180, 180)] public double? Longitude { get; set; }
    [MaxLength(30)] public string? PhoneNumber { get; set; }
    [EmailAddress, MaxLength(256)] public string? Email { get; set; }
    [Url, MaxLength(500)] public string? Website { get; set; }
    [Url, MaxLength(500)] public string? InstagramUrl { get; set; }
    [Url, MaxLength(500)] public string? FacebookUrl { get; set; }
    [Url, MaxLength(500)] public string? TikTokUrl { get; set; }
    [MaxLength(500)] public string? LogoUrl { get; set; }
    public bool BookingEnabled { get; set; }
    public bool AutoConfirmBookings { get; set; }
    public bool RequiresDeposit { get; set; }
    [MaxLength(500)] public string? DepositNote { get; set; }
    /// <summary>Korisnik sa ulogom Vendor kojem se dodjeljuje upravljanje (može i kasnije).</summary>
    public int? OwnerUserId { get; set; }
}

/// <summary>Izmjene koje smije raditi i vlasnik salona (personalizacija stranice, FR-12, FR-19).</summary>
public class VendorUpdateRequest
{
    [Required, MaxLength(150)] public string Name { get; set; } = string.Empty;
    [MaxLength(4000)] public string? Description { get; set; }
    [Required] public int CityId { get; set; }
    [MaxLength(250)] public string? Address { get; set; }
    [Range(-90, 90)] public double? Latitude { get; set; }
    [Range(-180, 180)] public double? Longitude { get; set; }
    [MaxLength(30)] public string? PhoneNumber { get; set; }
    [EmailAddress, MaxLength(256)] public string? Email { get; set; }
    [Url, MaxLength(500)] public string? Website { get; set; }
    [Url, MaxLength(500)] public string? InstagramUrl { get; set; }
    [Url, MaxLength(500)] public string? FacebookUrl { get; set; }
    [Url, MaxLength(500)] public string? TikTokUrl { get; set; }
    [MaxLength(500)] public string? LogoUrl { get; set; }
    public bool BookingEnabled { get; set; }
    public bool AutoConfirmBookings { get; set; }
    public bool RequiresDeposit { get; set; }
    [MaxLength(500)] public string? DepositNote { get; set; }
}

/// <summary>Polja kojima upravlja samo administrator.</summary>
public class VendorAdminUpdateRequest
{
    public int? OwnerUserId { get; set; }
    public bool IsActive { get; set; } = true;
    public int? SubscriptionPlanId { get; set; }
    public DateTime? SubscriptionExpiresAt { get; set; }
}

public class OfferingInsertRequest
{
    [Required] public int VendorId { get; set; }
    [Required] public int ServiceCategoryId { get; set; }
    [Required, MaxLength(150)] public string Title { get; set; } = string.Empty;
    [MaxLength(2000)] public string? Description { get; set; }
    [Range(0, 1000000)] public decimal PriceFrom { get; set; }
    [Range(0, 1000000)] public decimal PriceTo { get; set; }
}

public class OfferingUpdateRequest
{
    [Required] public int ServiceCategoryId { get; set; }
    [Required, MaxLength(150)] public string Title { get; set; } = string.Empty;
    [MaxLength(2000)] public string? Description { get; set; }
    [Range(0, 1000000)] public decimal PriceFrom { get; set; }
    [Range(0, 1000000)] public decimal PriceTo { get; set; }
    public bool IsActive { get; set; } = true;
}

public class VendorImageInsertRequest
{
    [Required] public int VendorId { get; set; }
    [Required, MaxLength(500)] public string Url { get; set; } = string.Empty;
    [MaxLength(200)] public string? Caption { get; set; }
    public int SortOrder { get; set; }
    public bool IsCover { get; set; }
}

public class VendorImageUpdateRequest
{
    [Required, MaxLength(500)] public string Url { get; set; } = string.Empty;
    [MaxLength(200)] public string? Caption { get; set; }
    public int SortOrder { get; set; }
    public bool IsCover { get; set; }
}

public class WorkingHourInsertRequest
{
    [Required] public int VendorId { get; set; }
    [Required] public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly? OpenTime { get; set; }
    public TimeOnly? CloseTime { get; set; }
    public bool IsClosed { get; set; }
}

public class WorkingHourUpdateRequest
{
    public TimeOnly? OpenTime { get; set; }
    public TimeOnly? CloseTime { get; set; }
    public bool IsClosed { get; set; }
}

// ---------- Recenzije ----------

public class ReviewInsertRequest
{
    [Required] public int VendorId { get; set; }
    [Range(1, 5)] public int Rating { get; set; }
    [MaxLength(2000)] public string? Comment { get; set; }
}

public class ReviewUpdateRequest
{
    [Range(1, 5)] public int Rating { get; set; }
    [MaxLength(2000)] public string? Comment { get; set; }
}

// ---------- Rezervacije ----------

public class BookingInsertRequest
{
    [Required] public int VendorId { get; set; }
    public int? OfferingId { get; set; }
    [Required] public DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    [MaxLength(1000)] public string? Note { get; set; }
}

public class BookingUpdateRequest
{
    public int? OfferingId { get; set; }
    [Required] public DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    [MaxLength(1000)] public string? Note { get; set; }
}

public class BookingStatusChangeRequest
{
    [MaxLength(500)] public string? Note { get; set; }
}

// ---------- Poruke (FR-13) ----------

/// <summary>Prva poruka salonu (samo mladenci). Ako razgovor već postoji, poruka se dodaje u njega.</summary>
public class ConversationStartRequest
{
    [Required] public int VendorId { get; set; }
    [Required, MaxLength(ChatLimits.BodyLength)] public string Body { get; set; } = string.Empty;
}

public class ChatMessageSendRequest
{
    [Required, MaxLength(ChatLimits.BodyLength)] public string Body { get; set; } = string.Empty;
}
