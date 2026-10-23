import { Injectable, Provider } from '@angular/core';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, MatDateFormats, NativeDateAdapter } from '@angular/material/core';

const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'juni', 'juli', 'august', 'septembar', 'oktobar', 'novembar', 'decembar'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAYS_NARROW = ['N', 'P', 'U', 'S', 'Č', 'P', 'S'];
const DAYS_SHORT = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];
const DAYS_LONG = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];

/**
 * Datumi za Material datepicker/timepicker na bosanskom: unos i prikaz "12.06.2027." i "14:30",
 * sedmica počinje ponedjeljkom. Nazivi su ručno, jer neki preglednici nemaju bosanske podatke (ICU).
 */
@Injectable()
export class BsDateAdapter extends NativeDateAdapter {
  override getFirstDayOfWeek(): number {
    return 1;
  }

  override getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    return style === 'long' ? MONTHS : MONTHS_SHORT;
  }

  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    return style === 'long' ? DAYS_LONG : style === 'short' ? DAYS_SHORT : DAYS_NARROW;
  }

  override format(date: Date, displayFormat: object): string {
    const f = displayFormat as Record<string, string>;
    if (f['kind'] === 'date') return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}.`;
    if (f['kind'] === 'month-year') return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    if (f['kind'] === 'time') return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (f['kind'] === 'a11y-date') return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}.`;
    return super.format(date, displayFormat);
  }

  /** "12.6.2027", "12.06.2027." ili "2027-06-12". */
  override parse(value: unknown): Date | null {
    if (typeof value !== 'string') return super.parse(value, undefined);
    const text = value.trim();
    if (!text) return null;
    let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\.?$/.exec(text);
    if (m) return this.build(+m[3], +m[2] - 1, +m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (m) return this.build(+m[1], +m[2] - 1, +m[3]);
    return this.invalid();
  }

  /** "14:30", "1430" ili "9". */
  override parseTime(value: unknown): Date | null {
    if (typeof value !== 'string') return super.parseTime(value, undefined);
    const text = value.trim();
    if (!text) return null;
    const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(text);
    if (!m || +m[1] > 23 || +(m[2] ?? 0) > 59) return this.invalid();
    const d = new Date(2000, 0, 1, +m[1], +(m[2] ?? 0));
    return d;
  }

  private build(year: number, month: number, day: number): Date {
    const d = new Date(year, month, day);
    // 31.02. ne smije postati 3. mart.
    return d.getMonth() === month && d.getDate() === day ? d : this.invalid();
  }
}

const FORMATS: MatDateFormats = {
  parse: { dateInput: { kind: 'date' }, timeInput: { kind: 'time' } },
  display: {
    dateInput: { kind: 'date' },
    monthYearLabel: { kind: 'month-year' },
    dateA11yLabel: { kind: 'a11y-date' },
    monthYearA11yLabel: { kind: 'month-year' },
    timeInput: { kind: 'time' },
    timeOptionLabel: { kind: 'time' },
  },
};

export function provideBsDates(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: 'bs-BA' },
    { provide: DateAdapter, useClass: BsDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: FORMATS },
  ];
}

// ---------- Pretvaranje između Date i formata backenda ----------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2027-06-12" -> lokalni Date (bez pomjeranja zone). */
export function isoToDate(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function dateToIso(date: Date | null | undefined): string | null {
  if (!date || isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "14:30" ili "14:30:00" -> Date (datum je nebitan). */
export function timeToDate(value: string | null | undefined): Date | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  return m ? new Date(2000, 0, 1, +m[1], +m[2]) : null;
}

export function dateToTime(date: Date | null | undefined): string | null {
  if (!date || isNaN(date.getTime())) return null;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
