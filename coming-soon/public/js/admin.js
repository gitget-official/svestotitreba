// Admin: spisak prijava, izvoz u CSV i brisanje adrese. Ključ se čuva samo dok je kartica otvorena.
(() => {
  const $ = (s) => document.querySelector(s);
  const ss = { get: () => { try { return sessionStorage.getItem('planiraj-admin') || ''; } catch { return ''; } }, set: (v) => { try { sessionStorage.setItem('planiraj-admin', v); } catch { /* */ } } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const err = $('#adm-err');
  const api = (path, opt = {}) => fetch('/api/admin/' + path, { ...opt, headers: { ...(opt.headers || {}), authorization: 'Bearer ' + ss.get() } });

  async function ucitaj() {
    err.textContent = '';
    const r = await api('lista');
    if (r.status === 401) { err.textContent = 'Pogrešan ključ.'; $('#podaci').hidden = true; return; }
    const d = await r.json();
    $('#s-uk').textContent = d.ukupno; $('#s-par').textContent = d.parovi; $('#s-pon').textContent = d.ponudjaci; $('#s-dan').textContent = d.danas;
    $('#redovi').innerHTML = d.redovi.map((x) => '<tr><td>' + x.id + '</td><td>' + esc(x.email) + '</td><td>' + (x.uloga === 'ponudjac' ? 'Ponuđač' : 'Mladenci') + '</td><td>' + esc(x.kategorija) + '</td><td>' + esc(x.grad) + '</td><td>' + x.pozvali + '</td><td>' + esc(x.vrijeme.replace('T', ' ').slice(0, 16)) + '</td><td><button type="button" data-email="' + esc(x.email) + '">Obriši</button></td></tr>').join('');
    $('#podaci').hidden = false;
  }

  $('#kljuc').addEventListener('submit', (e) => { e.preventDefault(); ss.set($('#token').value); ucitaj(); });
  $('#osvjezi').addEventListener('click', ucitaj);
  $('#csv').addEventListener('click', async () => {
    const r = await api('csv'); if (!r.ok) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'planiraj-lista.csv'; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#redovi').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-email]'); if (!b) return;
    if (!confirm('Obrisati ' + b.dataset.email + ' sa liste?')) return;
    await api('prijava', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: b.dataset.email }) });
    ucitaj();
  });
  if (ss.get()) ucitaj();
})();
