using Planiraj.Model.Enums;

namespace Planiraj.Model.SearchObjects;

public class BaseSearchObject
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    /// <summary>Slobodna pretraga po tekstu (naziv, opis...).</summary>
    public string? Fts { get; set; }
}

public class UserSearchObject : BaseSearchObject
{
    public UserRole? Role { get; set; }
    public bool? IsActive { get; set; }
}

public class CitySearchObject : BaseSearchObject
{
}

public class ServiceCategorySearchObject : BaseSearchObject
{
    public bool? IsActive { get; set; }
}

public class SubscriptionPlanSearchObject : BaseSearchObject
{
    public bool? IsActive { get; set; }
}

/// <summary>Filteri iz FR-6: grad, kategorija, cijena, ocjena, dostupnost datuma.</summary>
public class VendorSearchObject : BaseSearchObject
{
    public int? CityId { get; set; }
    public int? CategoryId { get; set; }
    public decimal? PriceMin { get; set; }
    public decimal? PriceMax { get; set; }
    public double? MinRating { get; set; }
    /// <summary>
    /// Datum vjenčanja. @TODO (otvorena odluka #3): trenutno se ponuđači bez online
    /// zakazivanja uvijek vraćaju (dostupnost nepoznata), a ponuđači sa zakazivanjem
    /// samo ako nemaju potvrđenu rezervaciju tog dana.
    /// </summary>
    public DateOnly? AvailableOn { get; set; }
    public bool? BookingEnabled { get; set; }
    public int? OwnerUserId { get; set; }
    /// <summary>Samo za administratora: prikaži i neaktivne ponuđače.</summary>
    public bool IncludeInactive { get; set; }
}

public class OfferingSearchObject : BaseSearchObject
{
    public int? VendorId { get; set; }
    public int? CategoryId { get; set; }
    public int? CityId { get; set; }
    public decimal? PriceMin { get; set; }
    public decimal? PriceMax { get; set; }
    public bool? IsActive { get; set; }
}

public class VendorImageSearchObject : BaseSearchObject
{
    public int? VendorId { get; set; }
}

public class WorkingHourSearchObject : BaseSearchObject
{
    public int? VendorId { get; set; }
}

public class ReviewSearchObject : BaseSearchObject
{
    public int? VendorId { get; set; }
    public int? UserId { get; set; }
    public ReviewStatus? Status { get; set; }
}

public class BookingSearchObject : BaseSearchObject
{
    public int? VendorId { get; set; }
    public int? UserId { get; set; }
    public BookingStatus? Status { get; set; }
    public DateOnly? DateFrom { get; set; }
    public DateOnly? DateTo { get; set; }
}
