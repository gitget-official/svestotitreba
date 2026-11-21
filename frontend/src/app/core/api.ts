import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  BaseSearch,
  Booking,
  BookingInsertRequest,
  BookingSearch,
  BookingStatusChangeRequest,
  BookingUpdateRequest,
  ChatMessagePage,
  ChatSendResult,
  City,
  Conversation,
  ConversationList,
  ConversationSearch,
  CityUpsertRequest,
  Offering,
  OfferingInsertRequest,
  OfferingSearch,
  OfferingUpdateRequest,
  PagedResult,
  Review,
  ReviewInsertRequest,
  ReviewSearch,
  ReviewUpdateRequest,
  ServiceCategory,
  ServiceCategoryInsertRequest,
  ServiceCategorySearch,
  ServiceCategoryUpdateRequest,
  SubscriptionPlan,
  SubscriptionPlanUpsertRequest,
  User,
  UserInsertRequest,
  UserSearch,
  UserUpdateRequest,
  Vendor,
  VendorAdminUpdateRequest,
  VendorImage,
  VendorImageInsertRequest,
  VendorImageSearch,
  VendorImageUpdateRequest,
  VendorInsertRequest,
  VendorMapPoint,
  VendorSearch,
  VendorUpdateRequest,
  WorkingHour,
  WorkingHourInsertRequest,
  WorkingHourSearch,
  WorkingHourUpdateRequest,
} from './models';

/** Zahtjev sa ovim kontekstom ne prikazuje automatski toast pri grešci (komponenta je sama obrađuje). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** Zahtjev sa ovim kontekstom ne preusmjerava gosta na prijavu kad dobije 401 (npr. dodatni sadržaj na početnoj). */
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);

/** Poruka greške iz backenda ({ status, message }) ili opšta poruka. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Server nije dostupan. Provjerite internet vezu ili pokušajte kasnije.';
    const body = error.error as { message?: string; errors?: Record<string, string[]> } | null;
    if (body?.message) return body.message;
    if (body?.errors) {
      const first = Object.values(body.errors)[0]?.[0];
      if (first) return first;
    }
    if (error.status === 403) return 'Nemate pravo na ovu akciju.';
    if (error.status === 404) return 'Traženi podatak nije pronađen.';
  }
  return 'Nešto nije u redu. Pokušajte ponovo.';
}

export function toParams(search: object = {}): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params;
}

/** Generički klijent za backend BaseCRUDController (GET lista, GET po id-u, POST, PUT, DELETE). */
export abstract class CrudApi<T, TSearch extends BaseSearch, TInsert, TUpdate> {
  protected readonly http = inject(HttpClient);
  protected readonly url: string;

  protected constructor(resource: string) {
    this.url = `${environment.apiUrl}/${resource}`;
  }

  list(search: TSearch = {} as TSearch, context?: HttpContext): Observable<PagedResult<T>> {
    return this.http.get<PagedResult<T>>(this.url, { params: toParams(search), context });
  }

  get(id: number, context?: HttpContext): Observable<T> {
    return this.http.get<T>(`${this.url}/${id}`, { context });
  }

  create(request: TInsert): Observable<T> {
    return this.http.post<T>(this.url, request);
  }

  update(id: number, request: TUpdate): Observable<T> {
    return this.http.put<T>(`${this.url}/${id}`, request);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class UserApi extends CrudApi<User, UserSearch, UserInsertRequest, UserUpdateRequest> {
  constructor() {
    super('users');
  }
}

@Injectable({ providedIn: 'root' })
export class CityApi extends CrudApi<City, BaseSearch, CityUpsertRequest, CityUpsertRequest> {
  constructor() {
    super('cities');
  }
}

@Injectable({ providedIn: 'root' })
export class CategoryApi extends CrudApi<
  ServiceCategory,
  ServiceCategorySearch,
  ServiceCategoryInsertRequest,
  ServiceCategoryUpdateRequest
> {
  constructor() {
    super('servicecategories');
  }
}

@Injectable({ providedIn: 'root' })
export class SubscriptionPlanApi extends CrudApi<
  SubscriptionPlan,
  BaseSearch & { isActive?: boolean | null },
  SubscriptionPlanUpsertRequest,
  SubscriptionPlanUpsertRequest
> {
  constructor() {
    super('subscriptionplans');
  }
}

@Injectable({ providedIn: 'root' })
export class VendorApi extends CrudApi<Vendor, VendorSearch, VendorInsertRequest, VendorUpdateRequest> {
  constructor() {
    super('vendors');
  }

  adminUpdate(id: number, request: VendorAdminUpdateRequest): Observable<Vendor> {
    return this.http.put<Vendor>(`${this.url}/${id}/admin`, request);
  }

  /** Javne tačke za mapu na početnoj: svi aktivni ponuđači odjednom (server kešira 5 minuta). */
  map(context?: HttpContext): Observable<VendorMapPoint[]> {
    return this.http.get<VendorMapPoint[]>(`${this.url}/map`, { context });
  }
}

@Injectable({ providedIn: 'root' })
export class OfferingApi extends CrudApi<Offering, OfferingSearch, OfferingInsertRequest, OfferingUpdateRequest> {
  constructor() {
    super('offerings');
  }
}

@Injectable({ providedIn: 'root' })
export class VendorImageApi extends CrudApi<
  VendorImage,
  VendorImageSearch,
  VendorImageInsertRequest,
  VendorImageUpdateRequest
> {
  constructor() {
    super('vendorimages');
  }
}

@Injectable({ providedIn: 'root' })
export class WorkingHourApi extends CrudApi<
  WorkingHour,
  WorkingHourSearch,
  WorkingHourInsertRequest,
  WorkingHourUpdateRequest
> {
  constructor() {
    super('workinghours');
  }
}

@Injectable({ providedIn: 'root' })
export class ReviewApi extends CrudApi<Review, ReviewSearch, ReviewInsertRequest, ReviewUpdateRequest> {
  constructor() {
    super('reviews');
  }

  approve(id: number): Observable<Review> {
    return this.http.put<Review>(`${this.url}/${id}/approve`, {});
  }

  reject(id: number): Observable<Review> {
    return this.http.put<Review>(`${this.url}/${id}/reject`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class BookingApi extends CrudApi<Booking, BookingSearch, BookingInsertRequest, BookingUpdateRequest> {
  constructor() {
    super('bookings');
  }

  confirm(id: number): Observable<Booking> {
    return this.http.put<Booking>(`${this.url}/${id}/confirm`, {});
  }

  reject(id: number, request: BookingStatusChangeRequest): Observable<Booking> {
    return this.http.put<Booking>(`${this.url}/${id}/reject`, request);
  }

  cancel(id: number, request: BookingStatusChangeRequest): Observable<Booking> {
    return this.http.put<Booking>(`${this.url}/${id}/cancel`, request);
  }
}

/** /api/conversations: poruke mladenaca i salona. Nove poruke stižu i uživo (ChatStore, SignalR). */
@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/conversations`;

  list(search: ConversationSearch = {}, context?: HttpContext): Observable<ConversationList> {
    return this.http.get<ConversationList>(this.url, { params: toParams(search), context });
  }

  get(id: number, context?: HttpContext): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.url}/${id}`, { context });
  }

  /** Razgovor sa salonom, ili null (204) kad mu mladenci još nisu pisali. */
  withVendor(vendorId: number, context?: HttpContext): Observable<Conversation | null> {
    return this.http.get<Conversation | null>(`${this.url}/vendor/${vendorId}`, { context });
  }

  messages(id: number, beforeId: number | null, pageSize = 30, context?: HttpContext): Observable<ChatMessagePage> {
    return this.http.get<ChatMessagePage>(`${this.url}/${id}/messages`, {
      params: toParams({ beforeId, pageSize }),
      context,
    });
  }

  /** Prva poruka salonu; ako razgovor već postoji, poruka ide u njega. */
  start(vendorId: number, body: string, context?: HttpContext): Observable<ChatSendResult> {
    return this.http.post<ChatSendResult>(this.url, { vendorId, body }, { context });
  }

  send(id: number, body: string, context?: HttpContext): Observable<ChatSendResult> {
    return this.http.post<ChatSendResult>(`${this.url}/${id}/messages`, { body }, { context });
  }

  markRead(id: number, context?: HttpContext): Observable<Conversation> {
    return this.http.put<Conversation>(`${this.url}/${id}/read`, {}, { context });
  }
}
