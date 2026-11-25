import test from 'node:test';
import assert from 'node:assert/strict';
import { provjeri, noviKod, jeKod, csv, isti, KATEGORIJE } from '../src/lib.js';

test('prihvata mladence i čisti email', () => {
  const v = provjeri({ email: '  Lejla@Primjer.BA ', uloga: 'par', saglasnost: true });
  assert.equal(v.ok, true);
  assert.deepEqual(v.podaci, { email: 'lejla@primjer.ba', uloga: 'par', kategorija: null, grad: null, ref: null });
});

test('ponuđač mora izabrati kategoriju sa liste', () => {
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'ponudjac', saglasnost: true }).ok, false);
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'ponudjac', kategorija: 'Hakeri', saglasnost: true }).ok, false);
  const v = provjeri({ email: 'a@b.ba', uloga: 'ponudjac', kategorija: KATEGORIJE[3], grad: ' Mostar<script> ', saglasnost: true });
  assert.equal(v.ok, true);
  assert.equal(v.podaci.grad, 'Mostarscript');
});

test('ponuđač može izabrati više usluga', () => {
  const v = provjeri({ email: 'a@b.ba', uloga: 'ponudjac', kategorija: [KATEGORIJE[3], KATEGORIJE[0], KATEGORIJE[3]], saglasnost: true });
  assert.equal(v.podaci.kategorija, KATEGORIJE[0] + ', ' + KATEGORIJE[3]);
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'ponudjac', kategorija: [], saglasnost: true }).ok, false);
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'ponudjac', kategorija: [KATEGORIJE[1], 'Hakeri'], saglasnost: true }).ok, false);
});

test('odbija loš email, nepoznatu ulogu i prijavu bez saglasnosti', () => {
  for (const email of ['', 'nije', 'a@b', 'a b@c.ba', 'x'.repeat(250) + '@b.ba']) assert.equal(provjeri({ email, uloga: 'par', saglasnost: true }).ok, false, email);
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'admin', saglasnost: true }).ok, false);
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'par', saglasnost: 'true' }).ok, false);
  assert.equal(provjeri(null).ok, false);
});

test('kod za preporuku', () => {
  for (let i = 0; i < 200; i++) assert.ok(jeKod(noviKod()));
  assert.equal(jeKod('ABCDE1'), false); // 1 nije u abecedi (lako se zamijeni sa I)
  assert.equal(jeKod('abcdef'), false);
  assert.equal(provjeri({ email: 'a@b.ba', uloga: 'par', saglasnost: true, ref: "X' OR 1=1" }).podaci.ref, null);
});

test('CSV je siguran za Excel', () => {
  const out = csv([{ a: '=HYPERLINK("x")', b: 'Mostar, "centar"' }], ['a', 'b']);
  assert.ok(out.startsWith('\ufeffa,b\r\n'));
  assert.ok(out.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(out.includes('"Mostar, ""centar"""'));
});

test('poređenje ključa', () => {
  assert.equal(isti('tajna', 'tajna'), true);
  assert.equal(isti('tajna', 'tajnA'), false);
  assert.equal(isti('', ''), false);
  assert.equal(isti(undefined, 'x'), false);
});
