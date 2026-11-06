// Primjer maila za novu prijavu, da se dizajn može pogledati u pregledniku: npm run mail:primjer
// Fajl ide u mail-primjer.html (u .gitignore), ne u public/, da ne bude javno dostupan.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { htmlMaila } from '../src/mail.js';

const izlaz = fileURLToPath(new URL('../mail-primjer.html', import.meta.url));
const html = htmlMaila({
  prijava: { email: 'salon.ruza@primjer.ba', uloga: 'ponudjac', kategorija: 'Sale i prostori za vjenčanje, Dekoracije', grad: 'Živinice', ref: 'K7MZQ4' },
  pozicija: 42,
  ukupno: { parovi: 31, ponudjaci: 11 },
  preporucio: 'lejla.hodzic@primjer.ba',
  vrijeme: new Date()
});
writeFileSync(izlaz, html);
console.log('Primjer maila: ' + izlaz);
