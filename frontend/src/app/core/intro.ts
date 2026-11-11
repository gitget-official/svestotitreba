import { assemble, drawS, hideS, pulse, puzzleLogo } from '../shared/motion/puzzle';

/**
 * Uvodna animacija loga: dijelovi slagalice se slože, ispiše se S, pa znak sleti u logo u traci.
 * Prikazuje se jednom po posjeti: mala skripta u index.html stavlja klasu "uvod" na <html>
 * (osim kad je uključeno "smanji pokrete"), a ekran #uvod pokriva stranicu od prvog iscrtavanja.
 * Dodir preskače animaciju; ako se ništa ne desi, CSS sam skloni ekran poslije 5 s.
 */
export function runIntro(): void {
  const root = document.documentElement;
  const box = document.getElementById('uvod');
  if (!box || !root.classList.contains('uvod')) return;
  const finish = () => {
    if (!root.classList.contains('uvod')) return;
    try { sessionStorage.setItem('sv-uvod', '1'); } catch { /* privatni prozor */ }
    root.classList.remove('uvod');
  };
  if (!Element.prototype.animate) return finish();

  const svg = puzzleLogo();
  box.appendChild(svg);
  hideS(svg);
  const lock = assemble(svg);
  pulse(svg.querySelector('.sv-pcs')!, lock - 60);
  drawS(svg, lock + 100);
  pulse(svg.querySelector('.sv-s')!, lock + 860, 1.07, 520);

  let timer = 0;
  const target = (): HTMLElement | null => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('app-brand-mark .mark'))) {
      const r = el.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < innerHeight) return el;
    }
    return null;
  };
  const land = () => {
    clearTimeout(timer);
    if (!root.classList.contains('uvod')) return;
    const img = target();
    const a = svg.getBoundingClientRect();
    if (img) {
      const b = img.getBoundingClientRect(), sc = b.width / a.width;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      img.style.opacity = '0';
      svg.animate([{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) scale(${sc})` }], { duration: 720, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
      box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, delay: 160, fill: 'forwards' }).onfinish = () => { img.style.opacity = ''; box.remove(); };
    } else {
      box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = () => box.remove();
    }
    setTimeout(finish, 200);
  };
  timer = window.setTimeout(land, lock + 100 + 820 + 520);
  box.addEventListener('pointerdown', () => {
    if (!root.classList.contains('uvod')) return;
    box.getAnimations({ subtree: true }).forEach((an) => an.finish());
    land();
  }, { once: true });
}
