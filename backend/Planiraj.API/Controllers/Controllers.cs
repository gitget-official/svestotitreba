using Microsoft.AspNetCore.Mvc;
using Planiraj.API.Auth;
using Planiraj.Model.Dtos;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;
using Planiraj.Services.Interfaces;

namespace Planiraj.API.Controllers;

/// <summary>/api/users — upravljanje korisnicima (administrator).</summary>
public class UsersController : BaseCRUDController<UserDto, UserSearchObject, UserInsertRequest, UserUpdateRequest>
{
    public UsersController(IUserService service) : base(service)
    {
    }
}

/// <summary>/api/cities — gradovi.</summary>
[PublicRead]
public class CitiesController : BaseCRUDController<CityDto, CitySearchObject, CityUpsertRequest, CityUpsertRequest>
{
    public CitiesController(ICityService service) : base(service)
    {
    }
}

/// <summary>/api/servicecategories — kategorije usluga.</summary>
[PublicRead]
public class ServiceCategoriesController
    : BaseCRUDController<ServiceCategoryDto, ServiceCategorySearchObject, ServiceCategoryInsertRequest, ServiceCategoryUpdateRequest>
{
    public ServiceCategoriesController(IServiceCategoryService service) : base(service)
    {
    }
}

/// <summary>/api/subscriptionplans — planovi pretplate.</summary>
[PublicRead]
public class SubscriptionPlansController
    : BaseCRUDController<SubscriptionPlanDto, SubscriptionPlanSearchObject, SubscriptionPlanUpsertRequest, SubscriptionPlanUpsertRequest>
{
    public SubscriptionPlansController(ISubscriptionPlanService service) : base(service)
    {
    }
}

/// <summary>/api/vendors — ponuđači (saloni) i pretraga.</summary>
[PublicRead]
public class VendorsController : BaseCRUDController<VendorDto, VendorSearchObject, VendorInsertRequest, VendorUpdateRequest>
{
    private readonly IVendorService _vendorService;

    public VendorsController(IVendorService service) : base(service)
    {
        _vendorService = service;
    }

    /// <summary>Administrator: vlasnik naloga, aktivnost i pretplata.</summary>
    [HttpPut("{id:int}/admin")]
    public Task<VendorDto> AdminUpdate(int id, [FromBody] VendorAdminUpdateRequest request) =>
        _vendorService.AdminUpdateAsync(id, request);
}

/// <summary>/api/offerings — usluge ponuđača po kategorijama.</summary>
[PublicRead]
public class OfferingsController : BaseCRUDController<OfferingDto, OfferingSearchObject, OfferingInsertRequest, OfferingUpdateRequest>
{
    public OfferingsController(IOfferingService service) : base(service)
    {
    }
}

/// <summary>/api/vendorimages — galerija.</summary>
[PublicRead]
public class VendorImagesController
    : BaseCRUDController<VendorImageDto, VendorImageSearchObject, VendorImageInsertRequest, VendorImageUpdateRequest>
{
    public VendorImagesController(IVendorImageService service) : base(service)
    {
    }
}

/// <summary>/api/workinghours — radno vrijeme.</summary>
[PublicRead]
public class WorkingHoursController
    : BaseCRUDController<WorkingHourDto, WorkingHourSearchObject, WorkingHourInsertRequest, WorkingHourUpdateRequest>
{
    public WorkingHoursController(IWorkingHourService service) : base(service)
    {
    }
}

/// <summary>/api/reviews — recenzije i moderacija.</summary>
[PublicRead]
public class ReviewsController : BaseCRUDController<ReviewDto, ReviewSearchObject, ReviewInsertRequest, ReviewUpdateRequest>
{
    private readonly IReviewService _reviewService;

    public ReviewsController(IReviewService service) : base(service)
    {
        _reviewService = service;
    }

    [HttpPut("{id:int}/approve")]
    public Task<ReviewDto> Approve(int id) => _reviewService.ApproveAsync(id);

    [HttpPut("{id:int}/reject")]
    public Task<ReviewDto> Reject(int id) => _reviewService.RejectAsync(id);
}

/// <summary>/api/bookings — rezervacije termina.</summary>
public class BookingsController : BaseCRUDController<BookingDto, BookingSearchObject, BookingInsertRequest, BookingUpdateRequest>
{
    private readonly IBookingService _bookingService;

    public BookingsController(IBookingService service) : base(service)
    {
        _bookingService = service;
    }

    [HttpPut("{id:int}/confirm")]
    public Task<BookingDto> Confirm(int id) => _bookingService.ConfirmAsync(id);

    [HttpPut("{id:int}/reject")]
    public Task<BookingDto> Reject(int id, [FromBody] BookingStatusChangeRequest request) =>
        _bookingService.RejectAsync(id, request);

    [HttpPut("{id:int}/cancel")]
    public Task<BookingDto> Cancel(int id, [FromBody] BookingStatusChangeRequest request) =>
        _bookingService.CancelAsync(id, request);
}
