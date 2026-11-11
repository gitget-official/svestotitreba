import { formatNumber, todayIso } from './format';

/**
 * Provjere za filtere i upitnik (polja van reactive formi, vezana preko ngModel). Svaka vraća poruku za
 * korisnika ili null, pa stranica poruku prikaže ispod polja i ne primijeni filter dok je ima.
 */

export interface NumberRule {
  /** Najmanja dozvoljena vrijednost (podrazumijevano 0: ništa negativno). */
  min?: number;
  max?: number;
  /** Samo cijeli brojevi (npr. broj gostiju). */
  integer?: boolean;
  /** Riječ za poruku, npr. "Cijena" -> "Cijena ne može biti negativna." */
  label?: string;
  /** Gramatički rod riječi `label` za poruke ("negativan/negativna"). */
  feminine?: boolean;
}

/**
 * Broj iz polja `type="number"`. `badInput` je `input.validity.badInput`: preglednik je dobio nešto
 * što nije broj (npr. "12e" ili "--5") i u model šalje prazno, pa bez ovoga greška prođe nečujno.
 */
export function numberError(
  value: number | null | undefined,
  rule: NumberRule = {},
  badInput = false,
): string | null {
  const label = rule.label ?? 'Vrijednost';
  if (badInput) return 'Unesite broj (samo cifre).';
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unesite broj (samo cifre).';
  const min = rule.min ?? 0;
  if (value < 0 && min >= 0)
    return `${label} ne može biti ${rule.feminine ? 'negativna' : 'negativan'}.`;
  if (rule.integer && !Number.isInteger(value)) return 'Unesite cijeli broj.';
  if (value < min) return `${label} mora biti najmanje ${formatNumber(min)}.`;
  if (rule.max !== undefined && value > rule.max)
    return `${label} može biti najviše ${formatNumber(rule.max)}.`;
  return null;
}

/** Raspon "od–do": "od" ne smije biti veće od "do" (prazna strana znači bez granice). */
export function rangeError(
  from: number | null | undefined,
  to: number | null | undefined,
  label = 'Cijena',
): string | null {
  if (from === null || from === undefined || to === null || to === undefined) return null;
  return from > to ? `${label} "od" ne može biti veća od "do".` : null;
}

/** Datum "yyyy-mm-dd" za filter dostupnosti: ispravan i ne u prošlosti. */
export function futureDateError(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(`${value}T00:00:00`).getTime()))
    return 'Unesite ispravan datum (dd.mm.gggg.).';
  return value < todayIso() ? 'Datum ne može biti u prošlosti.' : null;
}
