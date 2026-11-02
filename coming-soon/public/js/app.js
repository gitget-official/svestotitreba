// Svadbeno coming soon: ulazne animacije, latice, telefon koji mijenja ekrane, forma za listu čekanja.
(() => {
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 560px)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* privatni prozor */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* privatni prozor */ } }
  };

  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('go')));

  // ---- pojavljivanje pri listanju ----
  const rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    rv.forEach((el) => io.observe(el));
  } else rv.forEach((el) => el.classList.add('in'));

  // ---- latice u pozadini ----
  const petals = $('.petals');
  if (!calm && petals) {
    const n = small ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'pt';
      const t = 16 + Math.random() * 14;
      p.style.cssText = '--x:' + (Math.random() * 100).toFixed(1) + 'vw;--dx:' + (Math.random() * 30 - 15).toFixed(1) + 'vw;--s:' + (10 + Math.random() * 12).toFixed(0) + 'px;--t:' + t.toFixed(1) + 's;--dl:' + (-Math.random() * t).toFixed(1) + 's';
      p.appendChild(document.createElement('i'));
      petals.appendChild(p);
    }
    document.addEventListener('visibilitychange', () => petals.classList.toggle('paused', document.hidden));
    if (matchMedia('(pointer: fine)').matches) {
      let raf = 0;
      addEventListener('pointermove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          petals.style.transform = 'translate3d(' + ((e.clientX / innerWidth - 0.5) * -24).toFixed(1) + 'px,' + ((e.clientY / innerHeight - 0.5) * -14).toFixed(1) + 'px,0)';
        });
      }, { passive: true });
    }
  }

  // ---- telefon: ekrani aplikacije se smjenjuju ----
  const shots = [...document.querySelectorAll('.screen img')];
  if (shots.length) {
    let i = 0, timer = 0, seen = true;
    shots[0].classList.add('on');
    const tick = () => { shots[i].classList.remove('on'); i = (i + 1) % shots.length; shots[i].classList.add('on'); };
    const run = () => { clearInterval(timer); if (!calm && seen && !document.hidden) timer = setInterval(tick, 3400); };
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }).observe($('.phone'));
    document.addEventListener('visibilitychange', run);
    run();
  }

  // ---- brojanje ----
  const countUp = (el, to, ms) => {
    if (calm || to < 2) { el.textContent = to.toLocaleString('bs-BA'); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('bs-BA'); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  // 1 par, 2 para, 5 parova; 21 par, 22 para; 11 do 14 parova
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

  // ---- forma ----
  const form = $('#forma'), card = $('.card'), more = $('#more'), err = $('#greska'), btn = $('#posalji');
  const email = $('#email'), kat = $('#kategorija'), ok = $('#saglasnost');
  const done = $('#gotovo');
  const API = '/api';
  let tsWidget = null;

  // ---- padajući izbornici: usluge (više njih) i grad (pretraga i "Ostalo") ----
  const USLUGE = ['Sale i prostori za vjenčanje', 'Vjenčanice i odijela', 'Dekoracije', 'Fotografi', 'Rent svečanih automobila', 'Frizeri', 'Beauty i make-up', 'Nešto drugo'];
  const GRADOVI = ['Banja Luka', 'Banovići', 'Bihać', 'Bijeljina', 'Bileća', 'Bosanska Krupa', 'Bosanski Petrovac', 'Bratunac', 'Brčko', 'Breza', 'Brod', 'Bugojno', 'Busovača', 'Bužim', 'Cazin', 'Čapljina', 'Čelić', 'Čelinac', 'Čitluk', 'Derventa', 'Doboj', 'Donji Vakuf', 'Drvar', 'Foča', 'Fojnica', 'Gacko', 'Glamoč', 'Goražde', 'Gornji Vakuf-Uskoplje', 'Gračanica', 'Gradačac', 'Gradiška', 'Grude', 'Hadžići', 'Ilidža', 'Ilijaš', 'Istočno Sarajevo', 'Jablanica', 'Jajce', 'Kakanj', 'Kalesija', 'Kiseljak', 'Kladanj', 'Ključ', 'Konjic', 'Kotor Varoš', 'Kozarska Dubica', 'Kreševo', 'Kupres', 'Laktaši', 'Livno', 'Lopare', 'Lukavac', 'Ljubuški', 'Maglaj', 'Modriča', 'Mostar', 'Mrkonjić Grad', 'Neum', 'Nevesinje', 'Novi Grad', 'Novi Travnik', 'Odžak', 'Olovo', 'Orašje', 'Pale', 'Posušje', 'Prijedor', 'Prnjavor', 'Prozor-Rama', 'Rogatica', 'Sanski Most', 'Sarajevo', 'Srbac', 'Srebrenica', 'Srebrenik', 'Stolac', 'Šamac', 'Šipovo', 'Široki Brijeg', 'Teslić', 'Tešanj', 'Tomislavgrad', 'Travnik', 'Trebinje', 'Tuzla', 'Ugljevik', 'Usora', 'Vareš', 'Velika Kladuša', 'Visoko', 'Višegrad', 'Vitez', 'Vlasenica', 'Vogošća', 'Zavidovići', 'Zenica', 'Zvornik', 'Žepče', 'Živinice'].sort((a, b) => a.localeCompare(b, 'bs'));
  const OSTALO = 'Moj grad nije na listi';
  const low = (t) => t.toLocaleLowerCase('bs');

  function dropdown(box, { items, multi = false, other = null, placeholder, onPick = () => {} }) {
    const btn = box.querySelector('.dd-btn'), panel = box.querySelector('.dd-panel'), list = box.querySelector('.dd-list');
    const v = box.querySelector('.dd-v'), search = box.querySelector('.dd-search');
    const all = other ? items.concat(other) : items;
    const sel = new Set();
    let shown = [], act = 0;
    panel.classList.toggle('dd-multi', multi);

    const setAct = (i) => {
      act = i;
      const opts = list.querySelectorAll('.dd-opt');
      opts.forEach((o, k) => o.classList.toggle('act', k === i));
      (search || list).setAttribute('aria-activedescendant', opts[i] ? opts[i].id : '');
      if (opts[i]) opts[i].scrollIntoView({ block: 'nearest' });
    };
    const render = () => {
      const q = search ? low(search.value.trim()) : '';
      shown = items.filter((t) => !q || low(t).includes(q));
      list.innerHTML = '';
      if (!shown.length && !other) list.innerHTML = '<p class="dd-none">Nema rezultata</p>';
      if (other) shown.push(other);
      shown.forEach((t, i) => {
        if (t === other && i) list.insertAdjacentHTML('beforeend', '<div class="dd-sep" role="presentation"></div>');
        const o = document.createElement('div');
        o.className = 'dd-opt' + (t === other ? ' other' : '');
        o.id = list.id + '-' + i;
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(sel.has(t)));
        o.innerHTML = '<span></span><svg class="tk" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
        o.firstChild.textContent = t;
        o.addEventListener('pointermove', () => { if (act !== i) setAct(i); });
        o.addEventListener('mousedown', (e) => e.preventDefault());
        o.addEventListener('click', () => pick(i));
        list.appendChild(o);
      });
      setAct(q ? 0 : Math.max(0, shown.findIndex((t) => sel.has(t))));
    };
    const label = () => {
      const vals = all.filter((t) => sel.has(t));
      v.classList.toggle('ph', !vals.length);
      v.textContent = !vals.length ? placeholder
        : vals[0] === other ? 'Drugi grad'
        : vals.length <= 2 ? vals.join(', ') : vals[0] + ' i još ' + (vals.length - 1);
      if (vals.length) btn.removeAttribute('aria-invalid');
    };
    const pick = (i) => {
      const t = shown[i];
      if (t === undefined) return;
      if (multi) {
        if (sel.has(t)) sel.delete(t); else sel.add(t);
        list.querySelectorAll('.dd-opt')[i].setAttribute('aria-selected', String(sel.has(t)));
        label();
        return;
      }
      const q = search ? search.value.trim() : '';
      sel.clear(); sel.add(t); label();
      close(t !== other);
      onPick(t, q);
    };
    const open = () => {
      if (search) search.value = '';
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      render();
      (search || list).focus({ preventScroll: true });
    };
    function close(focus = true) {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focus) btn.focus({ preventScroll: true });
    }

    btn.addEventListener('click', () => (panel.hidden ? open() : close()));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    if (search) search.addEventListener('input', render);
    panel.addEventListener('keydown', (e) => {
      const last = shown.length - 1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAct(Math.min(last, Math.max(0, act + (e.key === 'ArrowDown' ? 1 : -1)))); }
      else if (e.key === 'Home' && !search) { e.preventDefault(); setAct(0); }
      else if (e.key === 'End' && !search) { e.preventDefault(); setAct(last); }
      else if (e.key === 'Enter' || (e.key === ' ' && !search)) { e.preventDefault(); pick(act); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    // klik ili Tab van izbornika ga zatvara
    document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target)) close(false); });
    box.addEventListener('focusout', (e) => { if (e.relatedTarget && !box.contains(e.relatedTarget)) close(false); });

    return {
      btn, close,
      values: () => all.filter((t) => sel.has(t)),
      reset() { sel.clear(); label(); close(false); }
    };
  }

  const gradOstalo = $('#grad');
  const katDD = dropdown($('#dd-kat'), { items: USLUGE, multi: true, placeholder: 'Izaberite usluge' });
  const gradDD = dropdown($('#dd-grad'), {
    items: GRADOVI, other: OSTALO, placeholder: 'Izaberite grad',
    onPick(t, q) {
      gradOstalo.hidden = t !== OSTALO;
      if (t !== OSTALO) { gradOstalo.value = ''; return; }
      if (q && !gradOstalo.value) gradOstalo.value = q;
      gradOstalo.focus();
    }
  });
  const grad = () => { const [g] = gradDD.values(); return g === OSTALO ? gradOstalo.value.trim() : g || ''; };

  const role = () => form.uloga.value;
  let moreT = 0;
  const syncRole = () => {
    const on = role() === 'ponudjac';
    more.classList.toggle('on', on);
    more.inert = !on;
    // izbornici smiju izaći iz polja tek kad se ono do kraja otvori
    clearTimeout(moreT);
    if (on) moreT = setTimeout(() => more.classList.add('open'), calm ? 0 : 450);
    else { more.classList.remove('open'); katDD.close(false); gradDD.close(false); }
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'uloga') syncRole(); });
  syncRole();

  // Dugmad "Prijavite..." u sekcijama: izaberu ulogu u formi i vrate na nju.
  document.querySelectorAll('[data-uloga]').forEach((el) => el.addEventListener('click', () => {
    if (!done.hidden) { card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' }); return; }
    const pon = el.dataset.uloga === 'ponudjac';
    $(pon ? '#u-pon' : '#u-par').checked = true; syncRole();
    card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => (pon ? kat : email).focus({ preventScroll: true }), calm ? 0 : 600);
  }));

  // preporuka: ?ref=KOD iz podijeljenog linka
  const refQ = new URLSearchParams(location.search).get('ref');
  if (refQ && /^[A-HJ-NP-Z2-9]{6}$/.test(refQ)) { try { sessionStorage.setItem('planiraj-ref', refQ); } catch { /* */ } }
  const ref = () => { try { return sessionStorage.getItem('planiraj-ref') || ''; } catch { return ''; } };

  const fail = (msg, field) => {
    err.textContent = msg;
    [email, kat].forEach((f) => f.removeAttribute('aria-invalid'));
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  };
  email.addEventListener('input', () => { if (email.hasAttribute('aria-invalid')) { email.removeAttribute('aria-invalid'); err.textContent = ''; } });

  const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mail = email.value.trim();
    if (!MAIL.test(mail)) return fail('Upišite ispravnu email adresu.', email);
    if (role() === 'ponudjac' && !katDD.values().length) return fail('Izaberite šta nudite.', kat);
    if (!ok.checked) return fail('Potvrdite da vam smijemo poslati email kad otvorimo.', ok);
    err.textContent = '';
    btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true');
    try {
      const r = await fetch(API + '/prijava', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: mail, uloga: role(), kategorija: katDD.values(), grad: grad(), saglasnost: true, web: form.web.value, ref: ref(), turnstile: tsWidget !== null && window.turnstile ? window.turnstile.getResponse(tsWidget) : '' })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        if (tsWidget !== null && window.turnstile) window.turnstile.reset(tsWidget);
        return fail(d.greska || 'Nešto nije u redu. Pokušajte ponovo za minut.');
      }
      store.set('planiraj-kod', d.kod);
      show(d, true);
    } catch {
      fail('Nema veze sa serverom. Provjerite internet i pokušajte ponovo.');
    } finally {
      btn.classList.remove('busy'); btn.removeAttribute('aria-busy');
    }
  });

  const share = (kod) => {
    const url = location.origin + '/?ref=' + kod;
    const msg = 'Svadbeno stiže uskoro: sve za vjenčanje na jednom mjestu (sale, vjenčanice, fotografi, dekoracije). Prijavi se na listu: ' + url;
    $('#sh-wa').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    $('#sh-vb').href = 'viber://forward?text=' + encodeURIComponent(msg);
    const c = $('#sh-kopiraj');
    c.onclick = async () => {
      try { await navigator.clipboard.writeText(url); }
      catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* */ } t.remove(); }
      c.lastElementChild.textContent = 'Link kopiran';
      setTimeout(() => { c.lastElementChild.textContent = 'Kopiraj link'; }, 2200);
    };
  };

  function show(d, fresh) {
    form.hidden = true;
    done.hidden = false;
    done.classList.remove('pop'); void done.offsetWidth; done.classList.add('pop');
    $('#gotovo-p').textContent = d.vec
      ? 'Ova adresa je već na listi. Javit ćemo vam se prvima čim otvorimo.'
      : ((d.uloga || role()) === 'ponudjac' ? 'Hvala! Javit ćemo vam se prije otvaranja. Pozovite i druge salone koje poznajete.' : 'Javit ćemo vam se prvima čim otvorimo. Pozovite i drugi par koji planira vjenčanje.');
    countUp($('#mjesto'), d.pozicija || 1, fresh ? 1400 : 0);
    const pz = $('#pozvani');
    if (d.pozvani > 0) { pz.hidden = false; pz.textContent = 'Preko vašeg linka se prijavilo: ' + d.pozvani; } else pz.hidden = true;
    share(d.kod);
    if (fresh) { done.focus({ preventScroll: true }); burst(); }
  }

  $('#druga').addEventListener('click', () => {
    store.del('planiraj-kod');
    done.hidden = true; form.hidden = false;
    form.reset(); katDD.reset(); gradDD.reset(); gradOstalo.hidden = true; syncRole(); email.focus();
  });

  // latice izlete iz kartice kad se prijava uspije
  function burst() {
    if (calm || !Element.prototype.animate) return;
    const box = $('#burst'), r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 140);
    for (let i = 0; i < (small ? 16 : 26); i++) {
      const p = document.createElement('i');
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      box.appendChild(p);
      const a = Math.random() * Math.PI * 2, v = 90 + Math.random() * 170;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v - 60;
      p.animate([
        { transform: 'translate(-50%,-50%) rotate(0) scale(0.4)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) rotate(' + (Math.random() * 360) + 'deg) scale(1)', opacity: 1, offset: 0.45 },
        { transform: 'translate(calc(-50% + ' + dx * 1.2 + 'px), calc(-50% + ' + (dy + 220) + 'px)) rotate(' + (Math.random() * 720) + 'deg) scale(0.9)', opacity: 0 }
      ], { duration: 1500 + Math.random() * 700, easing: 'cubic-bezier(.22,1,.36,1)' }).onfinish = () => p.remove();
    }
  }

  // ---- broj ljudi na listi i (ako je uključen) Turnstile ----
  fetch(API + '/broj').then((r) => r.ok ? r.json() : null).then((d) => {
    if (!d) return;
    if (d.prikazi && (d.parovi + d.ponudjaci) > 0) {
      const el = $('#broj');
      const parts = [];
      if (d.parovi) parts.push('<b data-n="' + d.parovi + '">0</b> ' + plural(d.parovi, 'par', 'para', 'parova'));
      if (d.ponudjaci) parts.push('<b data-n="' + d.ponudjaci + '">0</b> ' + plural(d.ponudjaci, 'ponuđač', 'ponuđača', 'ponuđača'));
      el.innerHTML = '<span>Na listi već ' + plural(d.parovi + d.ponudjaci, 'čeka', 'čekaju', 'čeka') + ' ' + parts.join(' i ') + '</span>';
      el.hidden = false;
      el.querySelectorAll('b').forEach((b) => countUp(b, +b.dataset.n, 1600));
    }
    if (d.turnstile) {
      window.onTs = () => { tsWidget = window.turnstile.render('#ts', { sitekey: d.turnstile, size: 'flexible', appearance: 'interaction-only', language: 'bs' }); };
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTs&render=explicit';
      s.async = true; document.head.appendChild(s);
    }
  }).catch(() => { /* bez brojača */ });

  // ---- vraćeni posjetilac vidi svoje mjesto ----
  const kod = store.get('planiraj-kod');
  if (kod && /^[A-HJ-NP-Z2-9]{6}$/.test(kod)) {
    fetch(API + '/ja?kod=' + kod).then((r) => r.ok ? r.json() : null).then((d) => { if (d && d.ok) show(d, false); else store.del('planiraj-kod'); }).catch(() => {});
  }
})();
