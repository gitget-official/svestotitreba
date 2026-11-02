import test from 'node:test';
import assert from 'node:assert/strict';
import { napraviMail, htmlMaila, kodirajNaslov, vrijemeBs } from '../src/mail.js';

const osnova = {
  od: 'prijave@svadbeno.com',
  za: 'svadbeno@gmail.com',
  pozicija: 42,
  ukupno: { parovi: 30, ponudjaci: 12 },
  preporucio: null,
  vrijeme: new Date('2026-11-02T18:45:00Z')
};
const par = { ...osnova, prijava: { email: 'ana@primjer.ba', uloga: 'par', kategorija: null, grad: null, ref: null } };
const salon = { ...osnova, prijava: { email: 'salon@primjer.ba', uloga: 'ponudjac', kategorija: 'Fotografi, Dekoracije', grad: 'Mostar', ref: null } };

// zaglavlja i dijelovi gotovog maila
function rastavi(raw) {
  const [glava, ...tijelo] = raw.split('\r\n\r\n');
  const zaglavlja = Object.fromEntries(glava.replace(/\r\n /g, ' ').split('\r\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
  const granica = /boundary="([^"]+)"/.exec(zaglavlja['Content-Type'])[1];
  const dijelovi = tijelo.join('\r\n\r\n').split('--' + granica).slice(1, -1).map((d) => {
    const [g, b] = d.trim().split('\r\n\r\n');
    return { glava: g, tekst: Buffer.from(b.replace(/\r\n/g, ''), 'base64').toString('utf8'), linije: b.split('\r\n') };
  });
  return { zaglavlja, granica, dijelovi };
}
const dekodiraj = (naslov) => naslov.split(' ').map((w) => Buffer.from(/^=\?UTF-8\?B\?(.*)\?=$/.exec(w)[1], 'base64').toString('utf8')).join('');

test('naslov za mladence i za ponuđača', () => {
  assert.equal(napraviMail(par).naslov, 'Nova prijava #42 · Mladenci');
  assert.equal(napraviMail(salon).naslov, 'Nova prijava #42 · Ponuđač: Fotografi, Dekoracije');
});

test('zaglavlja su ispravna', () => {
  const { zaglavlja: z, granica } = rastavi(napraviMail(salon).raw);
  assert.equal(z.From, 'Svadbeno <prijave@svadbeno.com>');
  assert.equal(z.To, 'svadbeno@gmail.com');
  assert.equal(z['Reply-To'], 'salon@primjer.ba');
  assert.match(z.Subject, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=( =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=)*$/);
  assert.equal(dekodiraj(z.Subject), 'Nova prijava #42 · Ponuđač: Fotografi, Dekoracije');
  assert.equal(z['MIME-Version'], '1.0');
  assert.equal(z['Content-Type'], 'multipart/alternative; boundary="' + granica + '"');
  assert.match(z['Message-ID'], /^<[0-9a-f-]+@svadbeno\.com>$/);
  assert.equal(z.Date, 'Mon, 02 Nov 2026 18:45:00 +0000');
});

test('tekst i HTML dio, base64 linije najviše 76 znakova', () => {
  const { dijelovi } = rastavi(napraviMail(par).raw);
  assert.equal(dijelovi.length, 2);
  assert.match(dijelovi[0].glava, /Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64/);
  assert.match(dijelovi[1].glava, /Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64/);
  for (const d of dijelovi) assert.ok(d.linije.every((l) => l.length <= 76));
  assert.match(dijelovi[1].tekst, /href="mailto:ana@primjer\.ba"/);
  assert.match(dijelovi[1].tekst, /https:\/\/svadbeno\.com\/admin/);
  assert.match(dijelovi[0].tekst, /Vrijeme prijave: 2\. 11\. 2026\. u 19:45/);
});

test('bosanska slova prolaze kroz base64', () => {
  const p = { ...salon, prijava: { ...salon.prijava, kategorija: 'Rent svečanih automobila', grad: 'Čapljina, Đakovo, Šamac, Žepče, Kućište' } };
  const { zaglavlja, dijelovi } = rastavi(napraviMail(p).raw);
  for (const d of dijelovi) assert.ok(d.tekst.includes('Čapljina, Đakovo, Šamac, Žepče, Kućište'));
  assert.equal(dekodiraj(zaglavlja.Subject), 'Nova prijava #42 · Ponuđač: Rent svečanih automobila');
  // dug naslov se lomi na više riječi, nijedno slovo se ne siječe
  const dug = kodirajNaslov('čćđšž'.repeat(20));
  assert.ok(dug.split('\r\n ').length > 1);
  assert.equal(dekodiraj(dug.replace(/\r\n /g, ' ')), 'čćđšž'.repeat(20));
});

test('HTML je escape-ovan', () => {
  const zlo = { ...salon, prijava: { ...salon.prijava, email: 'x@y.ba', grad: '<script>alert(1)</script>', ref: 'ABC234' }, preporucio: '"><img src=x onerror=alert(1)>@x.ba' };
  const html = htmlMaila(zlo);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/<script/i.test(html));
});

test('vrijeme po Sarajevu', () => {
  assert.equal(vrijemeBs(new Date('2026-11-02T18:45:00Z')), '2. 11. 2026. u 19:45');
  assert.equal(vrijemeBs(new Date('2026-07-05T07:05:00Z')), '5. 7. 2026. u 09:05'); // ljetno vrijeme, +2
});
