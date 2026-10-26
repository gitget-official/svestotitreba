import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

interface Heart {
  d: string;
  /** y vrha srca: srce se oboji kad linija prođe ovuda. */
  tip: number;
}

const HEART_SCALE = 1.6;
const MIN_GUTTER = 96;

/**
 * Tanka linija koja vijuga niz lijevu marginu i usput se zaplete u mala srca.
 *
 * - `mode="scroll"` (početna): linija se iscrtava kako korisnik skroluje; srce se kod svake druge sekcije roditelja
 *   (`:scope > section`) oboji kad linija prođe kroz njega.
 * - `mode="draw"` (prijava, registracija): iscrta se jednom pri otvaranju.
 *
 * Roditelj mora imati `position: relative`. Linija postoji samo kad je margina pored sadržaja dovoljno široka,
 * pa nikad ne prelazi preko teksta. Kod reduced-motion je odmah cijela.
 */
@Component({
  selector: 'app-love-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (path(); as d) {
      <svg
        [attr.viewBox]="viewBox()"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        @for (h of hearts(); track $index) {
          <path class="heart-fill" [class.lit]="litHearts() > $index" [attr.d]="h.d" />
        }
        <path
          #line
          class="line"
          pathLength="1"
          [attr.d]="d"
          [style.stroke-dashoffset]="mode() === 'scroll' ? offset() : null"
        />
      </svg>
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: -1;
      pointer-events: none;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .line {
      fill: none;
      stroke: var(--taupe);
      stroke-width: 1.25;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: var(--decor-opacity);
      stroke-dasharray: 1;
      transition: stroke-dashoffset 700ms var(--ease-out);
    }

    :host(.draw) .line {
      stroke-dashoffset: 1;
      animation: draw 2600ms var(--ease-in-out) 500ms forwards;
    }

    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }

    .heart-fill {
      fill: var(--blush);
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
      transform: scale(0.6);
      transition:
        opacity 900ms var(--ease-out),
        transform 900ms var(--ease-out);
    }

    .heart-fill.lit {
      opacity: calc(var(--decor-opacity) * 0.55);
      transform: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .line,
      :host(.draw) .line {
        stroke-dashoffset: 0 !important;
        animation: none;
        transition: none;
      }

      .heart-fill {
        transition: none;
        transform: none;
      }
    }

    @media print {
      :host {
        display: none;
      }
    }
  `,
  host: {
    '[class.draw]': 'mode() === "draw"',
    '[style.width.px]': 'gutter()',
  },
})
export class LoveLine {
  readonly mode = input<'scroll' | 'draw'>('scroll');
  /** Širina sadržaja u px oko kojeg linija ide; podrazumijevano `--page-max`. */
  readonly contentWidth = input<number | null>(null);

  protected readonly path = signal<string | null>(null);
  protected readonly hearts = signal<Heart[]>([]);
  protected readonly viewBox = signal('0 0 0 0');
  protected readonly gutter = signal(0);
  protected readonly offset = signal(1);
  protected readonly litHearts = signal(0);

  private readonly line = viewChild<ElementRef<SVGPathElement>>('line');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Uzorci (y -> pređeni dio linije) za brzo traženje dokle linija treba biti iscrtana. */
  private samples: { y: number; at: number }[] = [];

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const parent = this.host.parentElement;
      if (!parent) return;

      let layoutFrame = 0;
      let scrollFrame = 0;

      const resize = new ResizeObserver(() => {
        cancelAnimationFrame(layoutFrame);
        layoutFrame = requestAnimationFrame(() => this.layout(parent));
      });
      resize.observe(parent);

      const onScroll = () => {
        if (!scrollFrame)
          scrollFrame = requestAnimationFrame(() => ((scrollFrame = 0), this.progress()));
      };
      if (this.mode() === 'scroll') window.addEventListener('scroll', onScroll, { passive: true });

      destroyRef.onDestroy(() => {
        resize.disconnect();
        window.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(layoutFrame);
        cancelAnimationFrame(scrollFrame);
      });
    });
  }

  private layout(parent: HTMLElement): void {
    const width = parent.clientWidth;
    const height = parent.scrollHeight;
    const content =
      this.contentWidth() ??
      remToPx(getComputedStyle(document.documentElement).getPropertyValue('--page-max'));
    const gutter = Math.floor((width - content) / 2);

    if (gutter < MIN_GUTTER || height < 200) {
      this.path.set(null);
      this.gutter.set(0);
      return;
    }

    const xc = gutter * 0.5;
    const amp = Math.min(gutter * 0.26, 46);
    const heartYs =
      this.mode() === 'scroll' ? sectionHearts(parent) : [height * 0.28, height * 0.7];

    const { d, hearts } = buildPath(xc, amp, height, heartYs);
    this.gutter.set(gutter);
    this.viewBox.set(`0 0 ${gutter} ${height}`);
    this.path.set(d);
    this.hearts.set(hearts);

    if (this.mode() === 'draw' || this.reducedMotion) {
      this.offset.set(0);
      // U "draw" načinu srca se boje nakon što ih linija prođe (otprilike sredina i kraj animacije).
      if (this.reducedMotion) this.litHearts.set(hearts.length);
      else hearts.forEach((_, i) => setTimeout(() => this.litHearts.set(i + 1), 1400 + i * 1100));
      return;
    }

    // Uzorci se mjere tek kad je nova putanja u DOM-u.
    requestAnimationFrame(() => {
      this.sample();
      this.progress();
    });
  }

  private sample(): void {
    const el = this.line()?.nativeElement;
    if (!el) return;
    const total = el.getTotalLength();
    const count = Math.min(1600, Math.ceil(total / 10));
    let maxY = -Infinity;
    this.samples = [];
    for (let i = 0; i <= count; i++) {
      const point = el.getPointAtLength((total * i) / count);
      maxY = Math.max(maxY, point.y); // srca se vraćaju naviše, a traži se prvi prolaz ispod date visine
      this.samples.push({ y: maxY, at: i / count });
    }
  }

  private progress(): void {
    if (!this.samples.length) return;
    const top = this.host.getBoundingClientRect().top;
    // Vrh linije prati tačku na ~70% visine ekrana: crta se malo ispred pogleda.
    const target = window.innerHeight * 0.7 - top;

    let lo = 0;
    let hi = this.samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.samples[mid].y < target) lo = mid + 1;
      else hi = mid;
    }
    this.offset.set(1 - this.samples[lo].at);
    this.litHearts.set(this.hearts().filter((h) => h.tip < target).length);
  }
}

function remToPx(value: string): number {
  const rem = parseFloat(value) || 72;
  return rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}

/** Srce kod svake druge sekcije (počevši od druge), malo ispod njenog vrha. */
function sectionHearts(parent: HTMLElement): number[] {
  const parentTop = parent.getBoundingClientRect().top;
  return Array.from(parent.querySelectorAll<HTMLElement>(':scope > section'))
    .filter((_, i) => i % 2 === 1)
    .map((s) => s.getBoundingClientRect().top - parentTop + 28);
}

/**
 * Glatka vijuga sa vertikalnim tangentama u svakoj tački, pa se srca (koja počinju i završavaju u svojoj
 * lijevoj tački, okrenuta nadolje) uklapaju bez preloma. Srce je u koordinatama 0..24 (lijeva tačka 2,9).
 */
function buildPath(
  xc: number,
  amp: number,
  height: number,
  heartYs: number[],
): { d: string; hearts: Heart[] } {
  const s = HEART_SCALE;
  const heartX = xc - 10 * s; // lijeva tačka srca, da srce bude centrirano na liniji
  const heartH = 19 * s;

  type Node = { x: number; y: number; heart?: boolean };
  const nodes: Node[] = [];
  const step = 240;
  let side = -1;
  for (let y = 24; y < height - 40; y += step) {
    nodes.push({ x: xc + side * amp * (0.75 + 0.25 * Math.sin(y * 0.013)), y });
    side *= -1;
  }
  for (const y of heartYs) if (y > 60 && y < height - 80) nodes.push({ x: heartX, y, heart: true });
  nodes.sort((a, b) => a.y - b.y);

  // Tačka preblizu srcu bi napravila oštar zaokret.
  const filtered = nodes.filter(
    (n) => n.heart || !nodes.some((h) => h.heart && n.y > h.y - 110 && n.y < h.y + heartH + 110),
  );
  filtered.push({ x: xc, y: height - 8 });

  const f = (n: number) => n.toFixed(1);
  const hx = (u: number) => heartX + (u - 2) * s;
  const hy = (y: number, v: number) => y + (v - 9) * s;
  const heartLoop = (y: number) =>
    ` C${f(hx(2))},${f(hy(y, 14))} ${f(hx(8))},${f(hy(y, 18))} ${f(hx(12))},${f(hy(y, 21))}` +
    ` C${f(hx(16))},${f(hy(y, 18))} ${f(hx(22))},${f(hy(y, 14))} ${f(hx(22))},${f(hy(y, 9))}` +
    ` C${f(hx(22))},${f(hy(y, 2))} ${f(hx(14))},${f(hy(y, 2))} ${f(hx(12))},${f(hy(y, 6))}` +
    ` C${f(hx(10))},${f(hy(y, 2))} ${f(hx(2))},${f(hy(y, 2))} ${f(hx(2))},${f(hy(y, 9))}`;

  let d = `M${f(xc)},0`;
  let cx = xc;
  let cy = 0;
  const hearts: Heart[] = [];
  for (const n of filtered) {
    const k = (n.y - cy) * 0.5;
    d += ` C${f(cx)},${f(cy + k)} ${f(n.x)},${f(n.y - k)} ${f(n.x)},${f(n.y)}`;
    if (n.heart) {
      const loop = heartLoop(n.y);
      d += loop;
      hearts.push({ d: `M${f(hx(2))},${f(n.y)}${loop} Z`, tip: hy(n.y, 21) });
    }
    cx = n.x;
    cy = n.y;
  }
  return { d, hearts };
}
