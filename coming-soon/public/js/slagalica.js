// Svadbeno slagalica: logo od 9 dijelova slagalice i S kao traka.
// Uvodna animacija (jednom po posjeti), slagalica u pozadini koja se slaže dok se stranica lista,
// dugme prijave koje se pretvori u logo i slagalica za preporuke (dio za svaku prijavu preko linka).
// Bez inline stilova (CSP): pozicije se postavljaju kroz element.style i Web Animations.
(() => {
  const root = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IMG = '/img/slagalica.webp', IMG_S = '/img/slagalica-s.webp';
  const C = 100;
  // ivica između dva dijela: ravno ili sa "kvačicom" (s = 1 ili -1 bira stranu)
  const edge = (a, b, s) => {
    const dx = (b[0] - a[0]) / C, dy = (b[1] - a[1]) / C, nx = -dy, ny = dx;
    const P = (u, v) => (a[0] + dx * u + nx * v).toFixed(2) + ' ' + (a[1] + dy * u + ny * v).toFixed(2);
    if (!s) return 'L' + P(100, 0);
    return 'L' + P(38, 0) + ' C' + P(32, 13 * s) + ' ' + P(28, 27 * s) + ' ' + P(50, 27 * s) + ' C' + P(72, 27 * s) + ' ' + P(68, 13 * s) + ' ' + P(62, 0) + ' L' + P(100, 0);
  };
  const sh = (r, c) => ((r + c) % 2 ? 1 : -1), sv = (r, c) => ((r + c) % 2 ? -1 : 1);
  const piece = (r, c) => {
    const x = c * C, y = r * C, TL = [x, y], TR = [x + C, y], BR = [x + C, y + C], BL = [x, y + C];
    return 'M' + x + ' ' + y + ' ' + edge(TL, TR, r > 0 ? sh(r - 1, c) : 0) + ' ' + edge(TR, BR, c < 2 ? sv(r, c) : 0) + ' ' + edge(BR, BL, r < 2 ? -sh(r, c) : 0) + ' ' + edge(BL, TL, c > 0 ? -sv(r, c - 1) : 0) + ' Z';
  };
  // srednja linija S-a: maska koja "ispisuje" S iz slike
  const S_PUT = 'M202 92 C190 40 110 20 100 80 C92 130 200 140 205 205 C210 262 120 275 98 212';
  let id = 0;

  /** Novi SVG loga. slots: isprekidana mjesta za dijelove. */
  function logo({ slots = false } = {}) {
    const p = 'sv' + (id++);
    let defs = '<clipPath id="' + p + 'rr"><rect x="3" y="3" width="294" height="294" rx="21"/></clipPath>'
      + '<mask id="' + p + 'm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="340" height="340"><path class="sv-smp" d="' + S_PUT + '" fill="none" stroke="#fff" stroke-width="78" stroke-linecap="round" stroke-linejoin="round"/></mask>';
    let sl = '', g = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      defs += '<clipPath id="' + p + 'p' + r + c + '"><path d="' + piece(r, c) + '"/></clipPath>';
      if (slots) sl += '<path class="sv-slot" d="' + piece(r, c) + '" clip-path="url(#' + p + 'rr)"/>';
      g += '<g class="sv-pc" data-r="' + r + '" data-c="' + c + '"><g clip-path="url(#' + p + 'p' + r + c + ')"><image href="' + IMG + '" width="300" height="300" clip-path="url(#' + p + 'rr)"/></g></g>';
    }
    const box = document.createElement('div');
    box.innerHTML = '<svg class="sv-logo" viewBox="0 0 300 300" aria-hidden="true" focusable="false"><defs>' + defs + '</defs>' + sl + '<g class="sv-pcs">' + g + '</g><image class="sv-s" href="' + IMG_S + '" width="300" height="300" mask="url(#' + p + 'm)"/></svg>';
    const svg = box.firstChild;
    svg.querySelectorAll('.sv-pc').forEach((el) => { el.style.transformBox = 'view-box'; el.style.transformOrigin = (+el.dataset.c * 100 + 50) + 'px ' + (+el.dataset.r * 100 + 50) + 'px'; });
    [svg.querySelector('.sv-pcs'), svg.querySelector('.sv-s')].forEach((el) => { el.style.transformBox = 'view-box'; el.style.transformOrigin = '150px 150px'; });
    return svg;
  }
  const len = (svg) => svg.querySelector('.sv-smp').getTotalLength() + 4;
  function hideS(svg) { const m = svg.querySelector('.sv-smp'), L = len(svg); m.style.strokeDasharray = L; m.style.strokeDashoffset = L; }
  function drawS(svg, delay = 0, dur = 820) {
    const m = svg.querySelector('.sv-smp'), L = len(svg); m.style.strokeDasharray = L;
    return m.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
  }
  const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // sredina, uglovi, pa ivice
  const fly = (k, dist) => { const a = (k * 137) % 360 * Math.PI / 180; return 'translate(' + (Math.cos(a) * dist).toFixed(1) + 'px,' + (Math.sin(a) * dist).toFixed(1) + 'px) rotate(' + ((k % 2 ? 1 : -1) * (30 + k * 6)) + 'deg) scale(.75)'; };
  /** Dijelovi uleću i slažu se; vraća vrijeme (ms) kad legne zadnji. */
  function assemble(svg, { start = 100, step = 70, dur = 640, dist = 440 } = {}) {
    const pcs = svg.querySelectorAll('.sv-pc');
    pcs.forEach((p, i) => {
      const k = ORDER.indexOf(i);
      p.animate([{ transform: fly(k, dist), opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: dur, delay: start + k * step, easing: 'cubic-bezier(.22,1.25,.36,1)', fill: 'both' });
    });
    return start + 8 * step + dur;
  }
  const pulse = (el, delay, to = 1.035, dur = 380) => el.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + to + ')' }, { transform: 'scale(1)' }], { duration: dur, delay, easing: 'ease-out' });

  // ---- uvodna animacija (html.uvod postavlja mala skripta u <head>, samo prvi put u posjeti) ----
  function uvod() {
    const box = document.getElementById('uvod');
    const kraj = () => {
      if (!root.classList.contains('uvod')) return;
      try { sessionStorage.setItem('sv-uvod', '1'); } catch { /* privatni prozor */ }
      root.classList.remove('uvod');
      dispatchEvent(new Event('sv-uvod-kraj'));
    };
    if (!box || !root.classList.contains('uvod')) return;
    if (calm || !Element.prototype.animate) return kraj();
    const svg = logo(); box.appendChild(svg); hideS(svg);
    const lock = assemble(svg);
    pulse(svg.querySelector('.sv-pcs'), lock - 60);
    drawS(svg, lock + 100);
    pulse(svg.querySelector('.sv-s'), lock + 860, 1.07, 520);
    let t = 0;
    const odleti = () => {
      clearTimeout(t);
      const a = svg.getBoundingClientRect(), img = document.querySelector('.top .logo img');
      const b = img ? img.getBoundingClientRect() : null;
      if (!b || !b.width) { kraj(); return; }
      img.style.opacity = '0';
      const sc = b.width / a.width, dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      svg.animate([{ transform: 'none' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')' }], { duration: 720, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
      box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, delay: 160, fill: 'forwards' }).onfinish = () => { img.style.opacity = ''; box.remove(); };
      setTimeout(kraj, 200);
    };
    t = setTimeout(odleti, lock + 100 + 820 + 520);
    // dodir preskače animaciju
    box.addEventListener('pointerdown', () => { if (!root.classList.contains('uvod')) return; box.getAnimations({ subtree: true }).forEach((an) => an.finish()); odleti(); }, { once: true });
  }

  // ---- slagalica u pozadini: slaže se dok se stranica lista, na dnu se ispiše S ----
  function pozadina() {
    if (calm) return;
    const d = document.createElement('div'); d.className = 'sv-bg'; d.setAttribute('aria-hidden', 'true');
    const svg = logo(); d.appendChild(svg); document.body.prepend(d);
    const pcs = [...svg.querySelectorAll('.sv-pc')], m = svg.querySelector('.sv-smp'), L = len(svg);
    m.style.strokeDasharray = L;
    const off = pcs.map((_, i) => { const a = (i * 137) % 360 * Math.PI / 180; return [Math.cos(a) * 260, Math.sin(a) * 260, (i % 2 ? 1 : -1) * (25 + i * 5)]; });
    let raf = 0;
    const upd = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight, t = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
      pcs.forEach((p, i) => {
        const k = Math.min(1, Math.max(0, t * 1.25 - ORDER.indexOf(i) * 0.03)), e = 1 - Math.pow(1 - k, 3), [x, y, r] = off[i];
        p.style.transform = 'translate(' + (x * (1 - e)).toFixed(1) + 'px,' + (y * (1 - e)).toFixed(1) + 'px) rotate(' + (r * (1 - e)).toFixed(1) + 'deg)';
        p.style.opacity = (0.15 + 0.85 * e).toFixed(3);
      });
      m.style.strokeDashoffset = (L * (1 - Math.min(1, Math.max(0, (t - 0.82) / 0.18)))).toFixed(1);
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
    addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
    upd();
  }

  /** Dugme prijave se pretvori u mali logo koji se složi. Vraća { gotovo: Promise, vrati() }. */
  function dugme(btn) {
    if (calm || !Element.prototype.animate) return { gotovo: Promise.resolve(), vrati() {} };
    const w = btn.offsetWidth, h = btn.offsetHeight, mini = document.createElement('span');
    mini.className = 'sv-mini'; const svg = logo(); mini.appendChild(svg); hideS(svg);
    btn.classList.add('sv-morph');
    btn.style.width = w + 'px';
    requestAnimationFrame(() => { btn.style.width = h + 'px'; });
    btn.appendChild(mini);
    const lock = assemble(svg, { start: 300, step: 45, dur: 480, dist: 160 });
    const s = drawS(svg, lock, 520);
    return {
      gotovo: s.finished.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 180))),
      vrati() { btn.classList.remove('sv-morph'); btn.style.width = ''; mini.remove(); }
    };
  }

  /** Slagalica za preporuke: n dijelova od 9 (n = broj prijava preko linka). */
  function preporuke(el, n, animiraj) {
    let svg = el.querySelector('svg');
    if (!svg) { svg = logo({ slots: true }); el.prepend(svg); }
    const pcs = svg.querySelectorAll('.sv-pc'), cnt = Math.min(9, Math.max(0, n | 0));
    hideS(svg);
    pcs.forEach((p, i) => {
      const k = ORDER.indexOf(i), on = k < cnt;
      p.getAnimations().forEach((a) => a.cancel());
      p.style.opacity = on ? '1' : '0';
      if (on && animiraj && !calm) p.animate([{ opacity: 0, transform: 'translate(0,-50px) rotate(-25deg) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 300 + k * 160, easing: 'cubic-bezier(.22,1.3,.36,1)', fill: 'backwards' });
    });
    if (cnt === 9) { if (calm || !animiraj) svg.querySelector('.sv-smp').style.strokeDashoffset = 0; else drawS(svg, 300 + 9 * 160 + 300); }
  }

  window.Slagalica = { logo, drawS, hideS, dugme, preporuke };
  uvod();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pozadina); else pozadina();
})();
