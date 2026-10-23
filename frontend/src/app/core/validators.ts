import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/**
 * Validacija unosa na jednom mjestu. Svaki validator vraća grešku sa porukom za korisnika,
 * pa <app-field-error> samo prikaže prvu poruku. Ista pravila treba da važe i na backendu.
 */

const LETTERS = 'A-Za-zČčĆćĐđŠšŽžÀ-ÖØ-öø-ÿ';
const empty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function pattern(regex: RegExp, message: string, key = 'format'): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null =>
    empty(c.value) || regex.test(String(c.value).trim()) ? null : { [key]: message };
}

export const AppValidators = {
  /** Ime i prezime: samo slova, razmak, crtica i apostrof (npr. "Ana-Marija", "O'Neil"). */
  personName: [
    Validators.maxLength(100),
    pattern(new RegExp(`^[${LETTERS}]+(?:[ '\\-][${LETTERS}]+)*$`), 'Može sadržavati samo slova (bez brojeva i znakova).', 'personName'),
    pattern(new RegExp(`^.{2,}$`), 'Unesite najmanje 2 slova.', 'tooShort'),
  ],

  /** Naziv grada: slova, razmak i crtica. */
  placeName: [
    Validators.maxLength(100),
    pattern(new RegExp(`^[${LETTERS}]+(?:[ .\\-][${LETTERS}]+)*$`), 'Naziv može sadržavati samo slova.', 'placeName'),
  ],

  /** Naziv salona ili usluge: slova, brojevi i uobičajeni znakovi, ali ne samo brojevi. */
  businessName: [
    Validators.maxLength(150),
    pattern(new RegExp(`^[${LETTERS}0-9 .,&'’"()+\\-/]{2,}$`), 'Najmanje 2 znaka; dozvoljena su slova, brojevi i . , & \' - ( ).', 'businessName'),
    pattern(new RegExp(`[${LETTERS}]`), 'Naziv mora sadržavati slova.', 'needsLetters'),
  ],

  /** E-mail strožiji od ugrađenog (traži domen sa tačkom). */
  email: [Validators.maxLength(200), pattern(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Unesite ispravnu e-mail adresu (npr. ime@domena.ba).', 'email')],

  /** Telefon: +387 61 123 456, 061/123-456 i slično; 8–15 cifara. */
  phone: [
    pattern(/^\+?[0-9 ()/\-]{6,20}$/, 'Unesite broj telefona (npr. +387 61 123 456).', 'phone'),
    (c: AbstractControl): ValidationErrors | null => {
      if (empty(c.value)) return null;
      const digits = String(c.value).replace(/\D/g, '').length;
      return digits >= 8 && digits <= 15 ? null : { phoneDigits: 'Broj telefona treba imati 8 do 15 cifara.' };
    },
  ],

  /** Korisničko ime: 3–50 znakova, slova, brojevi, tačka, crtica i donja crta, bez razmaka. */
  username: [pattern(/^[A-Za-z0-9._-]{3,50}$/, '3–50 znakova: slova, brojevi, tačka, crtica ili donja crta, bez razmaka.', 'username')],

  /** Lozinka: najmanje 8 znakova, barem jedno slovo i jedan broj. */
  password: [
    Validators.maxLength(100),
    pattern(/^.{8,}$/, 'Najmanje 8 znakova.', 'passwordLength'),
    pattern(/[A-Za-zČčĆćĐđŠšŽž]/, 'Lozinka mora sadržavati barem jedno slovo.', 'passwordLetter'),
    pattern(/\d/, 'Lozinka mora sadržavati barem jedan broj.', 'passwordDigit'),
  ],

  url: [Validators.maxLength(500), pattern(/^https?:\/\/[^\s.]+\.[^\s]{2,}$/, 'Unesite punu adresu koja počinje sa https://', 'url')],

  /** Link na profil određene mreže (npr. "instagram.com"). */
  social(domain: string): ValidatorFn[] {
    return [
      Validators.maxLength(500),
      pattern(new RegExp(`^https?:\\/\\/(www\\.)?${domain.replace('.', '\\.')}\\/[^\\s]+$`), `Unesite link oblika https://${domain}/…`, 'social'),
    ];
  },

  latitude: [Validators.min(-90), Validators.max(90)],
  longitude: [Validators.min(-180), Validators.max(180)],

  /** Cijena u KM: 0 – 1.000.000. */
  price: [Validators.required, Validators.min(0), Validators.max(1_000_000)],

  integer(min: number, max: number): ValidatorFn[] {
    return [
      Validators.min(min),
      Validators.max(max),
      (c: AbstractControl): ValidationErrors | null =>
        empty(c.value) || Number.isInteger(Number(c.value)) ? null : { integer: 'Unesite cijeli broj.' },
    ];
  },

  /** Slobodan tekst (opis, napomena) sa gornjom granicom. */
  text(max: number): ValidatorFn[] {
    return [Validators.maxLength(max)];
  },

  /** Datum "yyyy-mm-dd" ne smije biti u prošlosti. */
  notPast: ((c: AbstractControl): ValidationErrors | null => {
    if (empty(c.value)) return null;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return String(c.value) >= iso ? null : { past: 'Datum ne može biti u prošlosti.' };
  }) as ValidatorFn,

  /** Grupa: polje `to` ne smije biti manje od `from` (npr. cijena od–do). */
  range(from: string, to: string, message = 'Cijena "do" ne može biti manja od cijene "od".'): ValidatorFn {
    return (g: AbstractControl): ValidationErrors | null => {
      const a = g.get(from)?.value;
      const b = g.get(to)?.value;
      return empty(a) || empty(b) || Number(b) >= Number(a) ? null : { range: message };
    };
  },
};

/** Poruka za prvu grešku kontrole (ugrađeni validatori + naši sa porukom). */
export function errorMessage(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  const [key, value] = Object.entries(errors)[0];
  if (typeof value === 'string') return value;
  switch (key) {
    case 'required':
      return 'Ovo polje je obavezno.';
    case 'email':
      return 'Unesite ispravnu e-mail adresu.';
    case 'minlength':
      return `Najmanje ${value.requiredLength} znakova.`;
    case 'maxlength':
      return `Najviše ${value.requiredLength} znakova (sada ${value.actualLength}).`;
    case 'min':
      return `Najmanja vrijednost je ${value.min}.`;
    case 'max':
      return `Najveća vrijednost je ${value.max}.`;
    case 'pattern':
      return 'Neispravan format.';
    case 'matDatepickerParse':
      return 'Unesite datum u obliku dd.mm.gggg.';
    default:
      return 'Neispravan unos.';
  }
}
