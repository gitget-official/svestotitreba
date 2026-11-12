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
    /// <summary>
    /// Prijava preko Googlea (samo mladenci): pronalazi nalog po Google ID-u ili e-mailu, a ako ga nema,
    /// pravi novi nalog mladenaca. IsNew je true kad je nalog upravo napravljen.
    /// </summary>
    Task<(UserDto User, bool IsNew)> LoginWithGoogleAsync(GoogleIdentity identity);
    /// <summary>
    /// Prijava i registracija salona preko Googlea: novi nalog dobija ulogu Vendor (salon zatim sam postavlja
    /// svoju stranicu), a postojeći nalog salona iste e-mail adrese se povezuje sa Googleom.
    /// </summary>
    Task<(UserDto User, bool IsNew)> LoginVendorWithGoogleAsync(GoogleIdentity identity);
    Task<UserDto> GetCurrentAsync();
    Task<UserDto> UpdateProfileAsync(ProfileUpdateRequest request);
    Task ChangePasswordAsync(ChangePasswordRequest request);
    /// <summary>
    /// Brisanje vlastitog profila (samo mladenci): briše plan i Sačuvano, otkazuje buduće termine, uklanja napomene
    /// uz zahtjeve i lične podatke. Recenzije ostaju, ali bez imena ("Obrisan korisnik").
    /// </summary>
    Task DeleteAccountAsync();
    /// <summary>True ako korisnik postoji, aktivan je i nije obrisan (provjera uz svaki token).</summary>
    Task<bool> IsActiveAsync(int userId);
}

/// <summary>Provjerava Google ID token (potpis, izdavač, rok, publika) i vraća podatke o osobi; null ako token ne valja.</summary>
public interface IGoogleTokenValidator
{
    /// <summary>Client id iz podešavanja, ili null kad Google prijava nije podešena.</summary>
    string? ClientId { get; }
    Task<GoogleIdentity?> ValidateAsync(string credential);
}

/// <summary>"Sačuvano" prijavljenog korisnika.</summary>
public interface IFavoriteService
{
    Task<List<FavoriteDto>> ListAsync();
    Task<FavoriteDto> AddAsync(int vendorId);
    Task RemoveAsync(int vendorId);
    /// <summary>Dodaje ponuđače koji još nisu sačuvani (postojeći i aktivni) i vraća cijelu listu.</summary>
    Task<List<FavoriteDto>> SyncAsync(FavoriteSyncRequest request);
}

/// <summary>"Moj plan" prijavljenog korisnika.</summary>
public interface IPlanService
{
    /// <summary>Null kad korisnik još nema sačuvan plan.</summary>
    Task<PlanDto?> GetAsync();
    Task<PlanDto> SaveAsync(PlanSaveRequest request);
    Task DeleteAsync();
}

/// <summary>Poruke mladenaca i salona (FR-13), uvijek sa strane prijavljenog korisnika.</summary>
public interface IChatService
{
    /// <summary>Razgovori, najnoviji prvi, i ukupan broj nepročitanih poruka.</summary>
    Task<ConversationListDto> ListAsync(ConversationSearchObject search);
    Task<ConversationDto> GetAsync(int id);
    /// <summary>Razgovor mladenaca sa salonom, ili null ako mu još nisu pisali.</summary>
    Task<ConversationDto?> GetWithVendorAsync(int vendorId);
    /// <summary>Poruke od starije prema novijoj; beforeId učitava stariju stranicu.</summary>
    Task<ChatMessagePageDto> GetMessagesAsync(int conversationId, int? beforeId, int pageSize);
    /// <summary>Prva poruka salonu (mladenci); postojeći razgovor se nastavlja.</summary>
    Task<ChatSendResultDto> StartAsync(ConversationStartRequest request);
    Task<ChatSendResultDto> SendAsync(int conversationId, ChatMessageSendRequest request);
    /// <summary>Označava sve poruke u razgovoru kao viđene.</summary>
    Task<ConversationDto> MarkReadAsync(int conversationId);
}

/// <summary>Javne adrese za sitemap.xml: opće stranice i svi aktivni ponuđači.</summary>
public interface ISitemapService
{
    Task<IReadOnlyList<SitemapEntry>> GetEntriesAsync();
}

/// <summary>Tačke za javnu mapu ponuđača: svi aktivni ponuđači koji imaju lokaciju ili grad sa centrom.</summary>
public interface IVendorMapService
{
    Task<IReadOnlyList<VendorMapPointDto>> GetPointsAsync();
}
