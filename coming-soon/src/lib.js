// Čiste funkcije bez Cloudflare zavisnosti (testiraju se u tests/lib.test.mjs).

export const KATEGORIJE = [
  'Sale i prostori za vjenčanje', 'Vjenčanice i odijela', 'Dekoracije', 'Fotografi',
  'Rent svečanih automobila', 'Frizeri', 'Beauty i make-up', 'Nešto drugo'
];

const MAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const KOD = /^[A-HJ-NP-Z2-9]{6}$/;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const jeKod = (k) => typeof k === 'string' && KOD.test(k);

export function noviKod() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => ABC[x % 32]).join('');
}

// Provjera i čišćenje podataka iz forme. Vraća { ok, podaci } ili { ok: false, greska }.
export function provjeri(b) {
  if (!b || typeof b !== 'object') return { ok: false, greska: 'Neispravan zahtjev.' };
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 254 || !MAIL.test(email)) return { ok: false, greska: 'Upišite ispravnu email adresu.' };
  const uloga = b.uloga === 'ponudjac' ? 'ponudjac' : b.uloga === 'par' ? 'par' : null;
  if (!uloga) return { ok: false, greska: 'Izaberite da li planirate vjenčanje ili nudite uslugu.' };
  if (b.saglasnost !== true) return { ok: false, greska: 'Potvrdite da vam smijemo poslati email kad otvorimo.' };
  let kategorija = null, grad = null;
  if (uloga === 'ponudjac') {
    // jedna ili više usluga; čuvaju se kao "Fotografi, Dekoracije" u istoj koloni
    const izabrane = [...new Set([].concat(b.kategorija ?? []).map(String))];
    if (!izabrane.length || !izabrane.every((k) => KATEGORIJE.includes(k))) return { ok: false, greska: 'Izaberite šta nudite.' };
    kategorija = KATEGORIJE.filter((k) => izabrane.includes(k)).join(', ');
    grad = String(b.grad || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || null;
  }
  const ref = jeKod(b.ref) ? b.ref : null;
  return { ok: true, podaci: { email, uloga, kategorija, grad, ref } };
}

// CSV: navodnici oko svakog polja i zaštita od formula u Excelu (=, +, -, @ na početku)
export function csv(redovi, kolone) {
  const polje = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return '﻿' + [kolone.join(','), ...redovi.map((r) => kolone.map((k) => polje(r[k])).join(','))].join('\r\n') + '\r\n';
}

// poređenje tokena u konstantnom vremenu
export function isti(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
