/**
 * Svadbeno slagalica: logo od 9 dijelova slagalice i S kao traka (slike iz /img).
 * Koriste ga uvodna animacija (core/intro.ts) i slagalica u pozadini (puzzle-backdrop.ts).
 */
const IMG = '/img/slagalica.webp';
const IMG_S = '/img/slagalica-s.webp';
const C = 100;
/** Srednja linija S-a: maska koja "ispisuje" S iz slike. */
const S_PATH = 'M202 92 C190 40 110 20 100 80 C92 130 200 140 205 205 C210 262 120 275 98 212';
/** Redoslijed slaganja: sredina, uglovi, pa ivice. */
export const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];

type Pt = [number, number];
const edge = (a: Pt, b: Pt, s: number): string => {
  const dx = (b[0] - a[0]) / C, dy = (b[1] - a[1]) / C, nx = -dy, ny = dx;
  const P = (u: number, v: number) => `${(a[0] + dx * u + nx * v).toFixed(2)} ${(a[1] + dy * u + ny * v).toFixed(2)}`;
  if (!s) return `L${P(100, 0)}`;
  return `L${P(38, 0)} C${P(32, 13 * s)} ${P(28, 27 * s)} ${P(50, 27 * s)} C${P(72, 27 * s)} ${P(68, 13 * s)} ${P(62, 0)} L${P(100, 0)}`;
};
const sh = (r: number, c: number) => ((r + c) % 2 ? 1 : -1);
const sv = (r: number, c: number) => ((r + c) % 2 ? -1 : 1);
const piece = (r: number, c: number): string => {
  const x = c * C, y = r * C;
  const TL: Pt = [x, y], TR: Pt = [x + C, y], BR: Pt = [x + C, y + C], BL: Pt = [x, y + C];
  return `M${x} ${y} ${edge(TL, TR, r > 0 ? sh(r - 1, c) : 0)} ${edge(TR, BR, c < 2 ? sv(r, c) : 0)} ${edge(BR, BL, r < 2 ? -sh(r, c) : 0)} ${edge(BL, TL, c > 0 ? -sv(r, c - 1) : 0)} Z`;
};

let uid = 0;

/** Novi SVG loga sa zasebnim dijelovima (.sv-pc) i S-om pod maskom (.sv-smp). */
export function puzzleLogo(): SVGSVGElement {
  const p = `svp${uid++}`;
  let defs = `<clipPath id="${p}rr"><rect x="3" y="3" width="294" height="294" rx="21"/></clipPath>`
    + `<mask id="${p}m" maskUnits="userSpaceOnUse" x="-20" y="-20" width="340" height="340"><path class="sv-smp" d="${S_PATH}" fill="none" stroke="#fff" stroke-width="78" stroke-linecap="round" stroke-linejoin="round"/></mask>`;
  let g = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    defs += `<clipPath id="${p}p${r}${c}"><path d="${piece(r, c)}"/></clipPath>`;
    g += `<g class="sv-pc" data-r="${r}" data-c="${c}"><g clip-path="url(#${p}p${r}${c})"><image href="${IMG}" width="300" height="300" clip-path="url(#${p}rr)"/></g></g>`;
  }
  const box = document.createElement('div');
  box.innerHTML = `<svg class="sv-logo" viewBox="0 0 300 300" aria-hidden="true" focusable="false"><defs>${defs}</defs><g class="sv-pcs">${g}</g><image class="sv-s" href="${IMG_S}" width="300" height="300" mask="url(#${p}m)"/></svg>`;
  const svg = box.firstElementChild as SVGSVGElement;
  svg.querySelectorAll<SVGGElement>('.sv-pc').forEach((el) => {
    el.style.transformBox = 'view-box';
    el.style.transformOrigin = `${Number(el.dataset['c']) * 100 + 50}px ${Number(el.dataset['r']) * 100 + 50}px`;
  });
  svg.querySelectorAll<SVGElement>('.sv-pcs, .sv-s').forEach((el) => {
    el.style.transformBox = 'view-box';
    el.style.transformOrigin = '150px 150px';
  });
  return svg;
}

const sPath = (svg: SVGSVGElement) => svg.querySelector<SVGPathElement>('.sv-smp')!;
export const sLength = (svg: SVGSVGElement) => sPath(svg).getTotalLength() + 4;

export function hideS(svg: SVGSVGElement): void {
  const m = sPath(svg), L = sLength(svg);
  m.style.strokeDasharray = `${L}`;
  m.style.strokeDashoffset = `${L}`;
}

export function drawS(svg: SVGSVGElement, delay = 0, duration = 820): Animation {
  const m = sPath(svg), L = sLength(svg);
  m.style.strokeDasharray = `${L}`;
  return m.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration, delay, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
}

/** Odakle dio uleti: pravac zavisi od mjesta u redoslijedu. */
export const scatter = (k: number, dist: number): [number, number, number] => {
  const a = (((k * 137) % 360) * Math.PI) / 180;
  return [Math.cos(a) * dist, Math.sin(a) * dist, (k % 2 ? 1 : -1) * (30 + k * 6)];
};

/** Dijelovi uleću i slažu se; vraća vrijeme (ms) kad legne zadnji. */
export function assemble(svg: SVGSVGElement, start = 100, step = 70, duration = 640, dist = 440): number {
  svg.querySelectorAll<SVGGElement>('.sv-pc').forEach((p, i) => {
    const k = ORDER.indexOf(i), [x, y, r] = scatter(k, dist);
    p.animate(
      [{ transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(.75)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration, delay: start + k * step, easing: 'cubic-bezier(.22,1.25,.36,1)', fill: 'both' },
    );
  });
  return start + 8 * step + duration;
}

export const pulse = (el: Element, delay: number, to = 1.035, duration = 380): Animation =>
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${to})` }, { transform: 'scale(1)' }], { duration, delay, easing: 'ease-out' });
