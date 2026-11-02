import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

// D1 preko ugrađenog SQLite-a u Node-u, sa pravom šemom iz migrations/
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_lista.sql', import.meta.url), 'utf8'));
  const izjava = (sql, args = []) => ({
    bind: (...a) => izjava(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } })
  });
  return {
    prepare: (sql) => izjava(sql),
    batch: async (izjave) => Promise.all(izjave.map((i) => i.all()))
  };
}

function okruzenje(mail) {
  return { DB: d1(), MAIL_FROM: 'prijave@svadbeno.com', MAIL_TO: 'svadbeno@gmail.com', IP_SOL: 'test', ...(mail ? { MAIL: mail } : {}) };
}

async function prijavi(env, body) {
  const cekanje = [];
  const req = new Request('https://svadbeno.com/api/prijava', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.1' }, body: JSON.stringify(body)
  });
  const res = await worker.fetch(req, env, { waitUntil: (p) => cekanje.push(p) });
  await Promise.all(cekanje);
  return { status: res.status, data: await res.json() };
}

const par = { email: 'ana@primjer.ba', uloga: 'par', saglasnost: true };

// greške iz slanja idu u log; ovdje se samo prebroje
function tihiLog(t) {
  const greske = [];
  // broje se samo greške o mailu (Node 22 kroz console.error ispiše i upozorenje za node:sqlite)
  t.mock.method(console, 'error', (...a) => { if (String(a[0]).startsWith('Mail o prijavi')) greske.push(a); });
  return greske;
}

test('prijava prolazi kad MAIL binding ne postoji', async (t) => {
  const greske = tihiLog(t);
  const { status, data } = await prijavi(okruzenje(null), par);
  assert.equal(status, 201);
  assert.equal(data.ok, true);
  assert.equal(data.pozicija, 1);
  assert.equal(greske.length, 1);
});

test('prijava prolazi kad slanje maila baci grešku', async (t) => {
  const greske = tihiLog(t);
  const { status, data } = await prijavi(okruzenje({ send: async () => { throw new Error('Email Routing nije uključen'); } }), par);
  assert.equal(status, 201);
  assert.equal(data.ok, true);
  assert.equal(greske.length, 1);
});

test('mail ide samo za novu prijavu, ne za ponovljenu ni za bota', async () => {
  const poslano = [];
  const env = okruzenje({ send: async (m) => { poslano.push(m); } });
  await prijavi(env, { email: 'salon@primjer.ba', uloga: 'ponudjac', kategorija: ['Fotografi'], grad: 'Mostar', saglasnost: true });
  assert.equal(poslano.length, 1);
  assert.equal(poslano[0].from, 'prijave@svadbeno.com');
  assert.equal(poslano[0].to, 'svadbeno@gmail.com');
  assert.match(poslano[0].raw, /^From: Svadbeno <prijave@svadbeno\.com>/);

  const opet = await prijavi(env, { email: 'salon@primjer.ba', uloga: 'ponudjac', kategorija: ['Fotografi'], saglasnost: true });
  assert.equal(opet.data.vec, true);
  await prijavi(env, { ...par, email: 'bot@primjer.ba', web: 'http://spam' });
  assert.equal(poslano.length, 1);
});
