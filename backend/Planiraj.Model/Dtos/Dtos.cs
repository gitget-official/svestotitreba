using Planiraj.Model.Enums;

namespace Planiraj.Model.Dtos;

public class UserDto
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public UserRole Role { get; set; }
    public bool IsActive { get; set; }
    public bool MustChangePassword { get; set; }
    public int? CityId { get; set; }
    public string? CityName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
}

public class CityDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

public class ServiceCategoryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
}

public class SubscriptionPlanDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public int DurationDays { get; set; }
    public int PriorityWeight { get; set; }
    public bool IsActive { get; set; }
}

public class VendorDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }

    public int CityId { get; set; }
    public string? CityName { get; set; }
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

    public bool BookingEnabled { get; set; }
    public bool AutoConfirmBookings { get; set; }
    public bool RequiresDeposit { get; set; }
    public string? DepositNote { get; set; }

    public bool IsActive { get; set; }
    public int? OwnerUserId { get; set; }
    public string? OwnerFullName { get; set; }

    public int? SubscriptionPlanId { get; set; }
    public string? SubscriptionPlanName { get; set; }
    public DateTime? SubscriptionExpiresAt { get; set; }
    /// <summary>Ima aktivnu pretplatu (FR-33).</summary>
    public bool IsFeatured { get; set; }

    public double? AverageRating { get; set; }
    public int ReviewCount { get; set; }
    /// <summary>Najniža / najviša cijena među aktivnim ponudama.</summary>
    public decimal? PriceFrom { get; set; }
    public decimal? PriceTo { get; set; }

    public List<string> Categories { get; set; } = new();
    public List<OfferingDto> Offerings { get; set; } = new();
    public List<VendorImageDto> Images { get; set; } = new();
    public List<WorkingHourDto> WorkingHours { get; set; } = new();

    public DateTime CreatedAt { get; set; }
}

/// <summary>Usluga koju ponuđač nudi u jednoj kategoriji, sa rasponom cijene od–do (FR-10, FR-11).</summary>
public class OfferingDto
{
    public int Id { get; set; }
    public int VendorId { get; set; }
    public string? VendorName { get; set; }
    public int ServiceCategoryId { get; set; }
    public string? ServiceCategoryName { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PriceFrom { get; set; }
    public decimal PriceTo { get; set; }
    public string Currency { get; set; } = "KM";
    public bool IsActive { get; set; }
}

public class VendorImageDto
{
    public int Id { get; set; }
    public int VendorId { get; set; }
    public string Url { get; set; } = string.Empty;
    public string? Caption { get; set; }
    public int SortOrder { get; set; }
    public bool IsCover { get; set; }
}

public class WorkingHourDto
{
    public int Id { get; set; }
    public int VendorId { get; set; }
    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly? OpenTime { get; set; }
    public TimeOnly? CloseTime { get; set; }
    public bool IsClosed { get; set; }
}

public class ReviewDto
{
    public int Id { get; set; }
    public int VendorId { get; set; }
    public string? VendorName { get; set; }
    public int UserId { get; set; }
    public string? UserFullName { get; set; }
    public int Rating { get; set; }
    public string? Comment { get; set; }
    public ReviewStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ModeratedAt { get; set; }
}

public class BookingDto
{
    public int Id { get; set; }
    public int VendorId { get; set; }
    public string? VendorName { get; set; }
    public int? OfferingId { get; set; }
    public string? OfferingTitle { get; set; }
    public int UserId { get; set; }
    public string? UserFullName { get; set; }
    public string? UserEmail { get; set; }
    public string? UserPhoneNumber { get; set; }
    public DateOnly EventDate { get; set; }
    public TimeOnly? StartTime { get; set; }
    public string? Note { get; set; }
    public string? StatusNote { get; set; }
    public BookingStatus Status { get; set; }
    public bool RequiresDeposit { get; set; }
    public string? DepositNote { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class AuthResponse
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public UserDto User { get; set; } = new();
}
