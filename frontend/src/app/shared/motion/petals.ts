import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
} from '@angular/core';

interface Petal {
  x: number; // vw
  size: number; // px
  depth: number; // koliko jako skrol gura laticu (bliže = jače)
  fall: number; // s
  delay: number; // s (negativno: latica je već na putu kad se stranica otvori)
  sway: number; // s
  drift: number; // px
  spin: number; // deg
  flip: number; // s
  blur: number; // px
  opacity: number;
  tone: string;
}

const TONES = ['var(--blush)', 'var(--blush-deep)', 'var(--blush)', 'var(--champagne)'];

/** Ponovljiv "slučajan" niz (mulberry32): latice su uvijek iste, bez skakanja pri ponovnom crtanju. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePetals(count: number, seed: number): Petal[] {
  const r = random(seed);
  const between = (min: number, max: number) => min + r() * (max - min);
  return Array.from({ length: count }, (_, i) => {
    // Svaka četvrta je "blizu": veća, mekana (zamućena) i brže reaguje na skrol, kao u plitkoj dubinskoj oštrini.
    const near = i % 4 === 3;
    const left = i % 2 === 0;
    const fall = near ? between(14, 19) : between(19, 30);
    return {
      x: left ? between(1, 12) : between(87, 97),
      size: near ? between(32, 42) : between(13, 24),
      depth: near ? between(1.2, 1.5) : between(0.35, 0.85),
      fall,
      delay: -between(0, fall),
      sway: between(3.6, 6.4),
      drift: between(16, 44),
      spin: between(12, 34),
      flip: between(2.8, 5.2),
      blur: near ? 2.4 : 0,
      opacity: near ? between(0.45, 0.6) : between(0.6, 0.9),
      tone: TONES[i % TONES.length],
    };
  });
}

/**
 * Latice ruže koje polako padaju niz bočne ivice stranice, iza sadržaja (z-index −1 unutar roditelja koji ima
 * `isolation: isolate`). Padanje i lepršanje su čisti CSS transform (kompozitor). Skrol samo dodaje kratki
 * "zalet": brzina skrola gura bliže latice jače od daljih, pa se opruga vrati na nulu. Ništa ne raste sa
 * dužinom stranice. Na telefonu su četiri latice; kod reduced-motion latica nema.
 */
@Component({
  selector: 'app-petals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!reducedMotion) {
      @for (p of petals(); track $index) {
        <div class="petal" [style.left.vw]="p.x" [style.--depth]="p.depth">
          <div
            class="fall"
            [style.animation-duration.s]="p.fall"
            [style.animation-delay.s]="p.delay"
          >
            <div
              class="sway"
              [style.animation-duration.s]="p.sway"
              [style.--drift.px]="p.drift"
              [style.--spin.deg]="p.spin"
            >
              <svg
                viewBox="0 0 40 48"
                [style.width.px]="p.size"
                [style.animation-duration.s]="p.flip"
                [style.filter]="p.blur ? 'blur(' + p.blur + 'px)' : null"
                [style.--o]="p.opacity"
                aria-hidden="true"
              >
                <path
                  [attr.fill]="p.tone"
                  d="M20 47 C9 42 2.5 31 4 19 C5.2 9.5 11 3.5 16.5 5 C18.4 5.6 19.4 7 20 8.6 C20.6 7 21.6 5.6 23.5 5 C29 3.5 34.8 9.5 36 19 C37.5 31 31 42 20 47 Z"
                />
                <path
                  fill="#fff"
                  opacity="0.32"
                  d="M20 44 C12 39 8 30 9.6 21 C10.6 15 13.6 11 17 11.6 C13.4 16 12.4 26 20 44 Z"
                />
                <path
                  fill="none"
                  stroke="#fff"
                  stroke-width="0.8"
                  opacity="0.4"
                  d="M20 44 C19 32 19.4 20 20 10"
                />
              </svg>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
      --lift: 0;
    }

    .petal {
      position: absolute;
      top: 0;
      transform: translate3d(0, calc(var(--lift) * var(--depth) * 1px), 0);
    }

    .fall {
      animation: fall linear infinite;
      will-change: transform;
    }

    .sway {
      animation: sway ease-in-out infinite alternate;
      perspective: 240px;
    }

    svg {
      display: block;
      height: auto;
      opacity: calc(var(--o, 1) * var(--decor-opacity));
      animation: flutter ease-in-out infinite alternate;
    }

    @keyframes fall {
      from {
        transform: translate3d(0, -14vh, 0);
      }
      to {
        transform: translate3d(0, 112vh, 0);
      }
    }

    @keyframes sway {
      from {
        transform: translateX(calc(var(--drift) * -1)) rotate(calc(var(--spin) * -1));
      }
      to {
        transform: translateX(var(--drift)) rotate(var(--spin));
      }
    }

    // Latica se okreće oko svoje ose, pa svjetlo "klizi" preko nje.
    @keyframes flutter {
      from {
        transform: rotate3d(1, 0.35, 0, -18deg);
      }
      to {
        transform: rotate3d(1, 0.35, 0, 58deg);
      }
    }

    // Telefon: četiri latice, bez zamućenih (najskuplje za iscrtavanje), malo prozirnije jer prelaze preko teksta.
    @media (max-width: 47.99rem) {
      .petal:nth-child(n + 5) {
        display: none;
      }

      :host {
        opacity: 0.7;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        display: none;
      }
    }

    @media print {
      :host {
        display: none;
      }
    }
  `,
})
export class Petals {
  readonly count = input(10);
  readonly seed = input(7);

  protected readonly reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  protected readonly petals = computed(() => makePetals(this.count(), this.seed()));

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (this.reducedMotion) return;

      // Zalet od skrola: brzina skrola (px po frejmu) daje pomak, koji se zatim glatko vraća na nulu.
      let lastY = window.scrollY;
      let lift = 0;
      let frame = 0;

      const tick = () => {
        const y = window.scrollY;
        lift = Math.max(-140, Math.min(140, (lift - (y - lastY) * 0.9) * 0.9));
        lastY = y;
        host.style.setProperty('--lift', lift.toFixed(2));
        frame = Math.abs(lift) > 0.3 ? requestAnimationFrame(tick) : 0;
        if (!frame) host.style.setProperty('--lift', '0');
      };
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(tick);
      };

      window.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(frame);
      });
    });
  }
}
