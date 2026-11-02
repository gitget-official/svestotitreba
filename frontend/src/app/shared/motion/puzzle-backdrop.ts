import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';
import { ORDER, puzzleLogo, sLength } from './puzzle';

/**
 * Slagalica u pozadini: dok se stranica lista, dijelovi loga se slažu, a na dnu stranice se ispiše S.
 * Providna je i iza sadržaja; sa uključenim "smanji pokrete" se ne prikazuje.
 */
@Component({
  selector: 'app-puzzle-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      position: fixed;
      right: -60px;
      top: 50%;
      z-index: -1;
      width: min(48vw, 460px);
      transform: translateY(-50%);
      pointer-events: none;
      opacity: 0.18;
    }
    :host ::ng-deep .sv-logo { display: block; width: 100%; overflow: visible; }
    :host-context([data-theme='dark']) { opacity: 0.12; }
    @media (prefers-color-scheme: dark) { :host-context(html:not([data-theme='light'])) { opacity: 0.12; } }
    @media (max-width: 600px) { :host { right: -70px; width: 78vw; opacity: 0.15; } }
    @media (prefers-reduced-motion: reduce) { :host { display: none; } }
    @media print { :host { display: none; } }
  `,
})
export class PuzzleBackdrop {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const svg = puzzleLogo();
      host.appendChild(svg);
      const pcs = Array.from(svg.querySelectorAll<SVGGElement>('.sv-pc'));
      const m = svg.querySelector<SVGPathElement>('.sv-smp')!;
      const L = sLength(svg);
      m.style.strokeDasharray = `${L}`;
      const off = pcs.map((_, i): [number, number, number] => {
        const a = (((i * 137) % 360) * Math.PI) / 180;
        return [Math.cos(a) * 260, Math.sin(a) * 260, (i % 2 ? 1 : -1) * (25 + i * 5)];
      });

      let frame = 0;
      const update = () => {
        frame = 0;
        const max = document.documentElement.scrollHeight - innerHeight;
        const t = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
        pcs.forEach((p, i) => {
          const k = Math.min(1, Math.max(0, t * 1.25 - ORDER.indexOf(i) * 0.03)), e = 1 - Math.pow(1 - k, 3), [x, y, r] = off[i];
          p.style.transform = `translate(${(x * (1 - e)).toFixed(1)}px,${(y * (1 - e)).toFixed(1)}px) rotate(${(r * (1 - e)).toFixed(1)}deg)`;
          p.style.opacity = (0.15 + 0.85 * e).toFixed(3);
        });
        m.style.strokeDashoffset = (L * (1 - Math.min(1, Math.max(0, (t - 0.82) / 0.18)))).toFixed(1);
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      // visina stranice se mijenja sa svakom stranicom i učitanim sadržajem
      const ro = new ResizeObserver(schedule);
      ro.observe(document.body);
      update();
      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        ro.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }
}
