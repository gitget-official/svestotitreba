using Planiraj.Model.Enums;

namespace Planiraj.Services.Database;

public abstract class BaseEntity
{
    public int Id { get; set; }
}

public class User : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    /// <summary>Profilna slika: ilustrovani avatar ("avatar:ključ") ili mala fotografija kao data URL (vidi AvatarAttribute).</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>Prazno kod naloga koji se prijavljuju samo preko Googlea.</summary>
    public string PasswordHash { get; set; } = string.Empty;
    public string PasswordSalt { get; set; } = string.Empty;

    /// <summary>Googleov stalni identifikator naloga ("sub" iz ID tokena); null ako nalog nije povezan sa Googleom.</summary>
    public string? GoogleId { get; set; }

    public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>Ponuđač mora promijeniti lozinku pri prvoj prijavi (FR-3).</summary>
    public bool MustChangePassword { get; set; }

    public int? CityId { get; set; }
    public City? City { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    /// <summary>Kad je korisnik sam obrisao profil. Lični podaci su tada uklonjeni, a nalog se ne može ponovo uključiti.</summary>
    public DateTime? DeletedAt { get; set; }

    public ICollection<Vendor> OwnedVendors { get; set; } = new List<Vendor>();
    public ICollection<Review> Reviews { get; set; } = new List<Review>();
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}

public class City : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    /// <summary>Centar grada. Ponuđač bez vlastitih koordinata se na mapi prikazuje ovdje.</summary>
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public ICollection<Vendor> Vendors { get; set; } = new List<Vendor>();
}

/// <summary>Kategorija usluge (vjenčanice, sale, fotografi...). Upravlja administrator (FR-30).</summary>
public class ServiceCategory : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<VendorOffering> Offerings { get; set; } = new List<VendorOffering>();
}

/// <summary>Plan pretplate za isticanje ponuđača (FR-33, priprema za monetizaciju).</summary>
public class SubscriptionPlan : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public int DurationDays { get; set; }
    public int PriorityWeight { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Vendor> Vendors { get; set; } = new List<Vendor>();
}

/// <summary>
/// Ponuđač usluga ("grupacija"): jedan nalog, jedna stranica, jedna ili više kategorija usluga.
/// </summary>
public class Vendor : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }

    public int CityId { get; set; }
    public City City { get; set; } = null!;
    public string? Address { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? InstagramUrl { get; set; }
    public string? FacebookUrl { get; set; }
    public string? TikTokUrl { get; set; }
    public string? LogoUrl { get; set; }

    // Zakazivanje (FR-19 – FR-22): opciono po ponuđaču.
    public bool BookingEnabled { get; set; }
    public bool AutoConfirmBookings { get; set; }
    public bool RequiresDeposit { get; set; }
    public string? DepositNote { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>Korisnički nalog (uloga Vendor) koji upravlja ovom stranicom. Može biti prazno dok admin ne kreira nalog.</summary>
    public int? OwnerUserId { get; set; }
    public User? Owner { get; set; }

    // Monetizacija (FR-33).
    public int? SubscriptionPlanId { get; set; }
    public SubscriptionPlan? SubscriptionPlan { get; set; }
    public DateTime? SubscriptionExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public ICollection<VendorOffering> Offerings { get; set; } = new List<VendorOffering>();
    public ICollection<VendorImage> Images { get; set; } = new List<VendorImage>();
    public ICollection<WorkingHour> WorkingHours { get; set; } = new List<WorkingHour>();
    public ICollection<Review> Reviews { get; set; } = new List<Review>();
    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}

/// <summary>Usluga ponuđača u jednoj kategoriji, sa posebnim opisom i cijenom od–do (FR-10, FR-11).</summary>
public class VendorOffering : BaseEntity
{
    public int VendorId { get; set; }
    public Vendor Vendor { get; set; } = null!;

    public int ServiceCategoryId { get; set; }
    public ServiceCategory ServiceCategory { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PriceFrom { get; set; }
    public decimal PriceTo { get; set; }
    public string Currency { get; set; } = "KM";
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class VendorImage : BaseEntity
{
    public int VendorId { get; set; }
    public Vendor Vendor { get; set; } = null!;

    public string Url { get; set; } = string.Empty;
    public string? Caption { get; set; }
    public int SortOrder { get; set; }
    public bool IsCover { get; set; }
}

public class WorkingHour : BaseEntity
{
    public int VendorId { get; set; }
    public Vendor Vendor { get; set; } = null!;

    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly? OpenTime { get; set; }
    public TimeOnly? CloseTime { get; set; }
    public bool IsClosed { get; set; }
}

public class Review : BaseEntity
{
    public int VendorId { get; set; }
    public Vendor Vendor { get; set; } = null!;

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public int Rating { get; set; }
    public string? Comment { get; set; }
    public ReviewStatus Status { get; set; } = ReviewStatus.Pending;

    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public DateTime? ModeratedAt { get; set; }
    public int? ModeratedByUserId { get; set; }
    public User? ModeratedBy { get; set; }
}

public class Booking : BaseEntity
{
    public int VendorId { get; set; }
    public Vendor Vendor { get; set; } = null!;

    public int? OfferingId { get; set; }
    public VendorOffering? Offering { get; set; }

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    public string? Note { get; set; }
    /// <summary>Napomena uz promjenu statusa (npr. razlog odbijanja).</summary>
    public string? StatusNote { get; set; }
    public BookingStatus Status { get; set; } = BookingStatus.Pending;

    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>Ponuđač kojeg su mladenci sačuvali ("Sačuvano").</summary>
public class Favorite : BaseEntity
{
    public int UserId { get; set; }
    public User User { get; set; } = null!;

    public int VendorId { get; set; }
    public Vendor Vendor { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// "Moj plan" (FR-27): odgovori iz planera i izabrani ponuđači po kategorijama, kao JSON koji piše frontend.
/// Jedan plan po korisniku.
/// </summary>
public class SavedPlan : BaseEntity
{
    public int UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>JSON: { "answers": {...}, "items": [...] }.</summary>
    public string Data { get; set; } = "{}";

    /// <summary>Kad je korisnik zadnji put kliknuo "Sačuvaj".</summary>
    public DateTime? SavedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

