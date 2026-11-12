import { BookingStatus, DayOfWeek, ReviewStatus, UserRole } from './models';

// Bosanski nazivi i format ne idu preko Intl-a: neki preglednici (npr. Chrome na Androidu) nemaju
// podatke za "bs", pa bi pisali "2026 M10 7" i "6,000". Ovako je isto u svakom pregledniku.
export const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'juni', 'juli', 'august', 'septembar', 'oktobar', 'novembar', 'decembar'];
export const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];

/** 6000 -> "6.000", 1234567 -> "1.234.567" (cijeli brojevi, tačka za hiljade). */
export function formatNumber(value: number): string {
  const sign = value < 0 ? '−' : '';
  return sign + String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const moneyFormat = { format: formatNumber };

/** Ocjena sa jednom decimalom i zarezom: 4.5 -> "4,5". */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : `${moneyFormat.format(value)} KM`;
}

export function formatPriceRange(from: number | null | undefined, to: number | null | undefined): string {
  if (from === null || from === undefined) return 'Cijena na upit';
  if (to === null || to === undefined || to === from) return formatPrice(from);
  return `${moneyFormat.format(from)} – ${moneyFormat.format(to)} KM`;
}

export interface DateParts {
  weekday?: 'long';
  day?: 'numeric';
  month?: 'long' | 'short';
  year?: 'numeric';
}

/**
 * "7. oktobar 2026." (zadano). Dijelovi se mogu isključiti ili promijeniti:
 * { weekday: 'long', year: undefined } -> "subota, 12. juni", { day: undefined, year: undefined, month: 'short' } -> "jun".
 */
export function formatDate(value: string | null | undefined, options: DateParts = {}): string {
  if (!value) return '';
  // DateOnly ("2027-06-12") tumačimo kao lokalni datum, bez pomjeranja vremenske zone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (isNaN(date.getTime())) return '';
  const o: DateParts = { day: 'numeric', month: 'long', year: 'numeric', ...options };
  const parts: string[] = [];
  if (o.day) parts.push(`${date.getDate()}.`);
  if (o.month) parts.push((o.month === 'short' ? MONTHS_SHORT : MONTHS)[date.getMonth()]);
  if (o.year) parts.push(`${date.getFullYear()}.`);
  const text = parts.join(' ');
  return o.weekday ? `${WEEKDAYS[date.getDay()]}${text ? ', ' + text : ''}` : text;
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

/** Bosanska množina: 1 recenzija, 2–4 recenzije, 5+ recenzija (11–14 uvijek "many"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Lokalno vrijeme poruke: "14:05". */
export function formatClock(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Vrijeme u listi razgovora: danas "14:05", jučer "jučer", u zadnjih 6 dana "uto", inače "12.11." (ili "12.11.2025."). */
export function formatChatTime(value: string, now = new Date()): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  if (sameDay(d, now)) return formatClock(value);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'jučer';
  const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  if (d >= weekAgo && d < now) return DAYS.find((x) => x.key === DAY_KEYS[d.getDay()])!.short.toLowerCase();
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '.'}`;
}

/** Razdjelnik dana u razgovoru: "Danas", "Jučer", "subota, 8. novembar" (godina samo ako nije ova). */
export function formatChatDay(value: string, now = new Date()): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  if (sameDay(d, now)) return 'Danas';
  if (sameDay(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Jučer';
  const text = formatDate(value, { weekday: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DAY_KEYS: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
