namespace Planiraj.Model.Enums;

/// <summary>Uloga korisnika na platformi (RBAC, FR-4).</summary>
public enum UserRole
{
    Admin = 1,
    /// <summary>Ponuđač usluga / vlasnik salona.</summary>
    Vendor = 2,
    /// <summary>Mladenci.</summary>
    Couple = 3
}

/// <summary>Status recenzije; recenzije moderira administrator (FR-17).</summary>
public enum ReviewStatus
{
    Pending = 0,
    Approved = 1,
    Rejected = 2
}

/// <summary>Status rezervacije termina (FR-23).</summary>
public enum BookingStatus
{
    Pending = 0,
    Confirmed = 1,
    Rejected = 2,
    Cancelled = 3
}
