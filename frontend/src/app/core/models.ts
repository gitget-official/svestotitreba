// Modeli usklađeni sa DTO-ovima backenda (Planiraj.Model). JSON koristi camelCase, enumi su stringovi.

export type UserRole = 'Admin' | 'Vendor' | 'Couple';
export type ReviewStatus = 'Pending' | 'Approved' | 'Rejected';
export type BookingStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled';
export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface BaseSearch {
  page?: number;
  pageSize?: number;
  fts?: string | null;
}

// ---------- Korisnici i auth ----------

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phoneNumber: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  cityId: number | null;
  cityName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phoneNumber?: string | null;
  cityId?: number | null;
  password: string;
}

export interface ProfileUpdateRequest {
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  cityId: number | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserSearch extends BaseSearch {
  role?: UserRole | null;
  isActive?: boolean | null;
}

export interface UserInsertRequest {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phoneNumber: string | null;
  cityId: number | null;
  role: UserRole;
  password: string;
}

export interface UserUpdateRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  cityId: number | null;
  role: UserRole;
  isActive: boolean;
  newPassword?: string | null;
}

// ---------- Šifarnici ----------

export interface City {
  id: number;
  name: string;
}

export interface CityUpsertRequest {
  name: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ServiceCategorySearch extends BaseSearch {
  isActive?: boolean | null;
}

export interface ServiceCategoryInsertRequest {
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface ServiceCategoryUpdateRequest extends ServiceCategoryInsertRequest {
  isActive: boolean;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  priorityWeight: number;
  isActive: boolean;
}

export interface SubscriptionPlanUpsertRequest {
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  priorityWeight: number;
  isActive: boolean;
}

// ---------- Ponuđači ----------

export interface Offering {
  id: number;
  vendorId: number;
  vendorName: string | null;
  serviceCategoryId: number;
  serviceCategoryName: string | null;
  title: string;
  description: string | null;
  priceFrom: number;
  priceTo: number;
  currency: string;
  isActive: boolean;
}

export interface VendorImage {
  id: number;
  vendorId: number;
  url: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
}

export interface WorkingHour {
  id: number;
  vendorId: number;
  dayOfWeek: DayOfWeek;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

export interface Vendor {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  cityId: number;
  cityName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phoneNumber: string | null;
  email: string | null;
  website: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tikTokUrl: string | null;
  logoUrl: string | null;
  bookingEnabled: boolean;
  autoConfirmBookings: boolean;
  requiresDeposit: boolean;
  depositNote: string | null;
  isActive: boolean;
  ownerUserId: number | null;
  ownerFullName: string | null;
  subscriptionPlanId: number | null;
  subscriptionPlanName: string | null;
  subscriptionExpiresAt: string | null;
  isFeatured: boolean;
  averageRating: number | null;
  reviewCount: number;
  priceFrom: number | null;
  priceTo: number | null;
  categories: string[];
  offerings: Offering[];
  images: VendorImage[];
  workingHours: WorkingHour[];
  createdAt: string;
}

export interface VendorSearch extends BaseSearch {
  cityId?: number | null;
  categoryId?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  minRating?: number | null;
  availableOn?: string | null;
  bookingEnabled?: boolean | null;
  ownerUserId?: number | null;
  includeInactive?: boolean | null;
}

export interface VendorUpdateRequest {
  name: string;
  description: string | null;
  cityId: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phoneNumber: string | null;
  email: string | null;
  website: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tikTokUrl: string | null;
  logoUrl: string | null;
  bookingEnabled: boolean;
  autoConfirmBookings: boolean;
  requiresDeposit: boolean;
  depositNote: string | null;
}

export interface VendorInsertRequest extends VendorUpdateRequest {
  ownerUserId: number | null;
}

export interface VendorAdminUpdateRequest {
  ownerUserId: number | null;
  isActive: boolean;
  subscriptionPlanId: number | null;
  subscriptionExpiresAt: string | null;
}

export interface OfferingSearch extends BaseSearch {
  vendorId?: number | null;
  categoryId?: number | null;
  cityId?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  isActive?: boolean | null;
}

export interface OfferingInsertRequest {
  vendorId: number;
  serviceCategoryId: number;
  title: string;
  description: string | null;
  priceFrom: number;
  priceTo: number;
}

export interface OfferingUpdateRequest {
  serviceCategoryId: number;
  title: string;
  description: string | null;
  priceFrom: number;
  priceTo: number;
  isActive: boolean;
}

export interface VendorImageSearch extends BaseSearch {
  vendorId?: number | null;
}

export interface VendorImageInsertRequest {
  vendorId: number;
  url: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
}

export interface VendorImageUpdateRequest {
  url: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
}

export interface WorkingHourSearch extends BaseSearch {
  vendorId?: number | null;
}

export interface WorkingHourInsertRequest {
  vendorId: number;
  dayOfWeek: DayOfWeek;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

export interface WorkingHourUpdateRequest {
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

// ---------- Recenzije ----------

export interface Review {
  id: number;
  vendorId: number;
  vendorName: string | null;
  userId: number;
  userFullName: string | null;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string | null;
  moderatedAt: string | null;
}

export interface ReviewSearch extends BaseSearch {
  vendorId?: number | null;
  userId?: number | null;
  status?: ReviewStatus | null;
}

export interface ReviewInsertRequest {
  vendorId: number;
  rating: number;
  comment: string | null;
}

export interface ReviewUpdateRequest {
  rating: number;
  comment: string | null;
}

// ---------- Rezervacije ----------

export interface Booking {
  id: number;
  vendorId: number;
  vendorName: string | null;
  offeringId: number | null;
  offeringTitle: string | null;
  userId: number;
  userFullName: string | null;
  userEmail: string | null;
  userPhoneNumber: string | null;
  eventDate: string;
  startTime: string | null;
  note: string | null;
  statusNote: string | null;
  status: BookingStatus;
  requiresDeposit: boolean;
  depositNote: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface BookingSearch extends BaseSearch {
  vendorId?: number | null;
  userId?: number | null;
  status?: BookingStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface BookingInsertRequest {
  vendorId: number;
  offeringId: number | null;
  eventDate: string;
  startTime: string | null;
  note: string | null;
}

export interface BookingUpdateRequest {
  offeringId: number | null;
  eventDate: string;
  startTime: string | null;
  note: string | null;
}

export interface BookingStatusChangeRequest {
  note: string | null;
}
