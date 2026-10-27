// Planiraj coming soon: statična stranica (public/) i mali API za listu čekanja.
//   POST   /api/prijava          upis na listu
//   GET    /api/broj             broj prijava (prikazuje se tek od PRIKAZI_OD)
//   GET    /api/ja?kod=XXXXXX     mjesto na listi za vraćenog posjetioca
//   GET    /api/admin/lista      spisak (Authorization: Bearer ADMIN_TOKEN)
//   GET    /api/admin/csv        spisak za Excel
//   DELETE /api/admin/prijava    brisanje adrese (odjava), body { email }
import { provjeri, noviKod, jeKod, csv, isti } from './lib.js';

const SIGURNOST = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY'
};

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SIGURNOST, ...extra }
});

async function hashIp(ip, sol) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((sol || 'planiraj') + '|' + ip));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function previse(env, ip) {
  const sad = Date.now();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM pokusaji WHERE ip = ? AND vrijeme > ?').bind(ip, sad - 10 * 60 * 1000).first();
  if (n >= 6) return true;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO pokusaji (ip, vrijeme) VALUES (?, ?)').bind(ip, sad),
    env.DB.prepare('DELETE FROM pokusaji WHERE vrijeme < ?').bind(sad - 24 * 60 * 60 * 1000)
  ]);
  return false;
}

async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const f = new FormData();
  f.append('secret', env.TURNSTILE_SECRET); f.append('response', token); f.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f });
  const d = await r.json().catch(() => ({}));
  return d.success === true;
}

async function mjesto(env, red) {
  const [a, b] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM prijave WHERE id <= ?').bind(red.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM prijave WHERE ref = ?').bind(red.kod)
  ]);
  return { pozicija: a.results[0].n, pozvani: b.results[0].n };
}

// obavijest timu u Telegram grupu (ako su postavljeni TELEGRAM_BOT_TOKEN i TELEGRAM_CHAT_ID)
async function javiTimu(env, p, pozicija) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const ko = p.uloga === 'ponudjac' ? 'Ponuđač: ' + p.kategorija + (p.grad ? ', ' + p.grad : '') : 'Mladenci';
  const text = 'Nova prijava #' + pozicija + '\n' + ko + '\n' + p.email + (p.ref ? '\nPreko preporuke: ' + p.ref : '');
  await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
  }).catch(() => {});
}

async function prijava(req, env, ctx) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return json({ ok: false, greska: 'Neispravan zahtjev.' }, 415);
  const body = await req.json().catch(() => null);
  // skriveno polje: botovi ga popune, ljudi ga ne vide; botu glumimo uspjeh
  if (body && body.web) return json({ ok: true, pozicija: 1, pozvani: 0, kod: noviKod() });
  const v = provjeri(body);
  if (!v.ok) return json(v, 400);
  const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
  if (await previse(env, await hashIp(ip, env.IP_SOL))) return json({ ok: false, greska: 'Previše pokušaja. Pokušajte ponovo za nekoliko minuta.' }, 429);
  if (!(await turnstileOk(env, body.turnstile, ip))) return json({ ok: false, greska: 'Provjera nije prošla. Osvježite stranicu i pokušajte ponovo.' }, 403);

  const p = v.podaci;
  const postoji = await env.DB.prepare('SELECT id, kod, uloga FROM prijave WHERE email = ?').bind(p.email).first();
  if (postoji) return json({ ok: true, vec: true, kod: postoji.kod, uloga: postoji.uloga, ...(await mjesto(env, postoji)) });

  let red = null;
  for (let i = 0; i < 4 && !red; i++) {
    const kod = noviKod();
    if (p.ref === kod) continue;
    red = await env.DB.prepare('INSERT INTO prijave (email, uloga, kategorija, grad, kod, ref) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id, kod')
      .bind(p.email, p.uloga, p.kategorija, p.grad, kod, p.ref).first();
    if (!red) {
      // ista adresa upisana u međuvremenu (dvostruki klik)
      const ista = await env.DB.prepare('SELECT id, kod, uloga FROM prijave WHERE email = ?').bind(p.email).first();
      if (ista) return json({ ok: true, vec: true, kod: ista.kod, uloga: ista.uloga, ...(await mjesto(env, ista)) });
    }
  }
  if (!red) return json({ ok: false, greska: 'Nešto nije u redu. Pokušajte ponovo.' }, 500);
  const m = await mjesto(env, red);
  ctx.waitUntil(javiTimu(env, p, m.pozicija));
  return json({ ok: true, vec: false, kod: red.kod, uloga: p.uloga, ...m }, 201);
}

async function broj(env) {
  const r = await env.DB.prepare("SELECT SUM(uloga = 'par') AS parovi, SUM(uloga = 'ponudjac') AS ponudjaci FROM prijave").first();
  const parovi = r.parovi || 0, ponudjaci = r.ponudjaci || 0;
  const od = Number(env.PRIKAZI_OD ?? 30);
  return json({ prikazi: parovi + ponudjaci >= od, parovi, ponudjaci, turnstile: env.TURNSTILE_SITE_KEY || null }, 200, { 'cache-control': 'public, max-age=60' });
}

async function ja(url, env) {
  const kod = url.searchParams.get('kod');
  if (!jeKod(kod)) return json({ ok: false }, 400);
  const red = await env.DB.prepare('SELECT id, kod, uloga FROM prijave WHERE kod = ?').bind(kod).first();
  if (!red) return json({ ok: false }, 404);
  return json({ ok: true, vec: false, kod: red.kod, uloga: red.uloga, ...(await mjesto(env, red)) });
}

async function admin(req, url, env) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !isti(token, env.ADMIN_TOKEN)) return json({ ok: false, greska: 'Pogrešan ključ.' }, 401);
  const put = url.pathname.slice('/api/admin/'.length);
  if (put === 'lista' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT p.id, p.email, p.uloga, p.kategorija, p.grad, p.vrijeme, p.ref, (SELECT COUNT(*) FROM prijave x WHERE x.ref = p.kod) AS pozvali FROM prijave p ORDER BY p.id DESC').all();
    const danas = new Date().toISOString().slice(0, 10);
    return json({ ok: true, ukupno: results.length, parovi: results.filter((r) => r.uloga === 'par').length, ponudjaci: results.filter((r) => r.uloga === 'ponudjac').length, danas: results.filter((r) => r.vrijeme.startsWith(danas)).length, redovi: results });
  }
  if (put === 'csv' && req.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, email, uloga, kategorija, grad, vrijeme FROM prijave ORDER BY id').all();
    return new Response(csv(results, ['id', 'email', 'uloga', 'kategorija', 'grad', 'vrijeme']), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="planiraj-lista.csv"', 'cache-control': 'no-store', ...SIGURNOST }
    });
  }
  if (put === 'prijava' && req.method === 'DELETE') {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    const r = await env.DB.prepare('DELETE FROM prijave WHERE email = ?').bind(email).run();
    return json({ ok: true, obrisano: r.meta.changes });
  }
  return json({ ok: false }, 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/prijava' && req.method === 'POST') return await prijava(req, env, ctx);
      if (p === '/api/broj' && req.method === 'GET') return await broj(env);
      if (p === '/api/ja' && req.method === 'GET') return await ja(url, env);
      if (p.startsWith('/api/admin/')) return await admin(req, url, env);
      if (p.startsWith('/api/')) return json({ ok: false }, 404);
    } catch (e) {
      console.error(e);
      return json({ ok: false, greska: 'Greška na serveru. Pokušajte ponovo.' }, 500);
    }
    return env.ASSETS.fetch(req);
  }
};
