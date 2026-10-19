using Planiraj.Model;
using Planiraj.Model.Dtos;
using Planiraj.Model.Requests;
using Planiraj.Model.SearchObjects;

namespace Planiraj.Services.Interfaces;

public interface IService<TModel, TSearch> where TSearch : BaseSearchObject
{
    Task<PagedResult<TModel>> GetPagedAsync(TSearch search);
    Task<TModel> GetByIdAsync(int id);
}

public interface ICRUDService<TModel, TSearch, TInsert, TUpdate> : IService<TModel, TSearch>
    where TSearch : BaseSearchObject
{
    Task<TModel> InsertAsync(TInsert request);
    Task<TModel> UpdateAsync(int id, TUpdate request);
    Task DeleteAsync(int id);
}

public interface IUserService : ICRUDService<UserDto, UserSearchObject, UserInsertRequest, UserUpdateRequest> { }

public interface ICityService : ICRUDService<CityDto, CitySearchObject, CityUpsertRequest, CityUpsertRequest> { }

public interface IServiceCategoryService
    : ICRUDService<ServiceCategoryDto, ServiceCategorySearchObject, ServiceCategoryInsertRequest, ServiceCategoryUpdateRequest> { }

public interface ISubscriptionPlanService
    : ICRUDService<SubscriptionPlanDto, SubscriptionPlanSearchObject, SubscriptionPlanUpsertRequest, SubscriptionPlanUpsertRequest> { }

public interface IVendorService : ICRUDService<VendorDto, VendorSearchObject, VendorInsertRequest, VendorUpdateRequest>
{
    Task<VendorDto> AdminUpdateAsync(int id, VendorAdminUpdateRequest request);
}

public interface IOfferingService : ICRUDService<OfferingDto, OfferingSearchObject, OfferingInsertRequest, OfferingUpdateRequest> { }

public interface IVendorImageService
    : ICRUDService<VendorImageDto, VendorImageSearchObject, VendorImageInsertRequest, VendorImageUpdateRequest> { }

public interface IWorkingHourService
    : ICRUDService<WorkingHourDto, WorkingHourSearchObject, WorkingHourInsertRequest, WorkingHourUpdateRequest> { }

public interface IReviewService : ICRUDService<ReviewDto, ReviewSearchObject, ReviewInsertRequest, ReviewUpdateRequest>
{
    Task<ReviewDto> ApproveAsync(int id);
    Task<ReviewDto> RejectAsync(int id);
}

public interface IBookingService : ICRUDService<BookingDto, BookingSearchObject, BookingInsertRequest, BookingUpdateRequest>
{
    Task<BookingDto> ConfirmAsync(int id);
    Task<BookingDto> RejectAsync(int id, BookingStatusChangeRequest request);
    Task<BookingDto> CancelAsync(int id, BookingStatusChangeRequest request);
}

public interface IAuthService
{
    /// <summary>Vraća korisnika ako su podaci ispravni i nalog aktivan, inače null.</summary>
    Task<UserDto?> ValidateCredentialsAsync(string login, string password);
    Task<UserDto> RegisterCoupleAsync(RegisterRequest request);
    Task<UserDto> GetCurrentAsync();
    Task<UserDto> UpdateProfileAsync(ProfileUpdateRequest request);
    Task ChangePasswordAsync(ChangePasswordRequest request);
}
