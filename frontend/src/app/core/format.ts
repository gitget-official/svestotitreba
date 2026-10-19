import { BookingStatus, DayOfWeek, ReviewStatus, UserRole } from './models';

const moneyFormat = new Intl.NumberFormat('bs-BA', { maximumFractionDigits: 0 });

export function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : `${moneyFormat.format(value)} KM`;
}

export function formatPriceRange(from: number | null | undefined, to: number | null | undefined): string {
  if (from === null || from === undefined) return 'Cijena na upit';
  if (to === null || to === undefined || to === from) return formatPrice(from);
  return `${moneyFormat.format(from)} – ${moneyFormat.format(to)} KM`;
}

export function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return '';
  // DateOnly ("2027-06-12") tumačimo kao lokalni datum, bez pomjeranja vremenske zone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString('bs-BA', { day: 'numeric', month: 'long', year: 'numeric', ...options });
}

export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : '';
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "09:30" -> "09:30:00" (TimeOnly na backendu). */
export function toTimeOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export const DAYS: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 'Monday', label: 'Ponedjeljak', short: 'Pon' },
  { key: 'Tuesday', label: 'Utorak', short: 'Uto' },
  { key: 'Wednesday', label: 'Srijeda', short: 'Sri' },
  { key: 'Thursday', label: 'Četvrtak', short: 'Čet' },
  { key: 'Friday', label: 'Petak', short: 'Pet' },
  { key: 'Saturday', label: 'Subota', short: 'Sub' },
  { key: 'Sunday', label: 'Nedjelja', short: 'Ned' },
];

export function dayLabel(day: DayOfWeek): string {
  return DAYS.find((d) => d.key === day)?.label ?? day;
}

export const BOOKING_STATUS: Record<BookingStatus, { label: string; badge: string }> = {
  Pending: { label: 'Čeka potvrdu', badge: 'badge-warning' },
  Confirmed: { label: 'Potvrđeno', badge: 'badge-success' },
  Rejected: { label: 'Odbijeno', badge: 'badge-danger' },
  Cancelled: { label: 'Otkazano', badge: '' },
};

export const REVIEW_STATUS: Record<ReviewStatus, { label: string; badge: string }> = {
  Pending: { label: 'Čeka odobrenje', badge: 'badge-warning' },
  Approved: { label: 'Objavljeno', badge: 'badge-success' },
  Rejected: { label: 'Odbijeno', badge: 'badge-danger' },
};

export const ROLE_LABEL: Record<UserRole, string> = {
  Admin: 'Administrator',
  Vendor: 'Salon',
  Couple: 'Mladenci',
};

export function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}
