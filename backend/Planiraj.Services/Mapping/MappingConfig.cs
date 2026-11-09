using Mapster;
using Planiraj.Model.Dtos;
using Planiraj.Services.Database;

namespace Planiraj.Services.Mapping;

/// <summary>Mapster mapiranja entitet -> DTO. Request -> entitet ide po konvenciji (ista imena svojstava).</summary>
public static class MappingConfig
{
    public static void Register(TypeAdapterConfig config)
    {
        // DateOnly/TimeOnly kopirati kao vrijednosti (Mapster ih inače može tretirati kao objekte).
        config.NewConfig<DateOnly, DateOnly>().MapWith(s => s);
        config.NewConfig<TimeOnly, TimeOnly>().MapWith(s => s);

        config.NewConfig<User, UserDto>()
            .Map(d => d.CityName, s => s.City != null ? s.City.Name : null)
            .Map(d => d.HasPassword, s => s.PasswordHash != "")
            .Map(d => d.HasGoogle, s => s.GoogleId != null);

        config.NewConfig<VendorOffering, OfferingDto>()
            .Map(d => d.VendorName, s => s.Vendor != null ? s.Vendor.Name : null)
            .Map(d => d.ServiceCategoryName, s => s.ServiceCategory != null ? s.ServiceCategory.Name : null);

        config.NewConfig<Vendor, VendorDto>()
            .Map(d => d.CityName, s => s.City != null ? s.City.Name : null)
            .Map(d => d.OwnerFullName, s => s.Owner != null ? s.Owner.FirstName + " " + s.Owner.LastName : null)
            .Map(d => d.SubscriptionPlanName, s => s.SubscriptionPlan != null ? s.SubscriptionPlan.Name : null)
            .Map(d => d.Categories, s => s.Offerings
                .Where(o => o.IsActive && o.ServiceCategory != null)
                .Select(o => o.ServiceCategory.Name)
                .Distinct()
                .ToList());

        config.NewConfig<Review, ReviewDto>()
            .Map(d => d.VendorName, s => s.Vendor != null ? s.Vendor.Name : null)
            .Map(d => d.UserFullName, s => s.User != null ? s.User.FirstName + " " + s.User.LastName : null);

        config.NewConfig<Booking, BookingDto>()
            .Map(d => d.VendorName, s => s.Vendor != null ? s.Vendor.Name : null)
            .Map(d => d.RequiresDeposit, s => s.Vendor != null && s.Vendor.RequiresDeposit)
            .Map(d => d.DepositNote, s => s.Vendor != null ? s.Vendor.DepositNote : null)
            .Map(d => d.OfferingTitle, s => s.Offering != null ? s.Offering.Title : null)
            .Map(d => d.UserFullName, s => s.User != null ? s.User.FirstName + " " + s.User.LastName : null)
            .Map(d => d.UserEmail, s => s.User != null ? s.User.Email : null)
            .Map(d => d.UserPhoneNumber, s => s.User != null ? s.User.PhoneNumber : null);
    }
}
