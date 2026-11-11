import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { vendorLink } from '../../core/links';
import { LookupStore } from '../../core/lookups';
import { VendorMapPoint } from '../../core/models';
import { FadeInImage } from '../../shared/motion/fade-in-image';
import { prefersReducedMotion } from '../../shared/motion/spring';
import { Icon, categoryIcon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast';
import { BIH_GEO } from './bih-geo';
import { MapTip } from './map-tip';

/** Širina i visina viewBox-a: mapa plus "debljina" ploče (3D rub) i sjena ispod. */
const VB_W = BIH_GEO.width;
const DEPTH = 28;
const VB_H = BIH_GEO.height + DEPTH + 24;
/** Prazan prostor oko mape (u jedinicama viewBox-a), da markeri uz granicu ne budu odsječeni. */
const MARGIN = { left: 40, top: 70, right: 40, bottom: 10 };
const FRAME_X = -MARGIN.left;
const FRAME_Y = -MARGIN.top;
const FRAME_W = VB_W + MARGIN.left + MARGIN.right;
const FRAME_H = VB_H + MARGIN.top + MARGIN.bottom;
const MAX_K = 8;
/** Poluprečnik grupisanja u pikselima ekrana: markeri bliži od ovoga se spajaju u jedan broj. */
const CLUSTER_PX = 80;
/** Na uskom ekranu (telefon) manji markeri i manji poluprečnik, da se grupe ne stope u jednu. */
const clusterPx = (width: number) => (width < 480 ? 50 : CLUSTER_PX);

interface View {
  k: number;
  x: number;
  y: number;
}

interface Point {
  v: VendorMapPoint;
  x: number;
  y: number;
}

/** Grad sa bar jednim ponuđačem na mapi; centar je centar grada iz baze ili prosjek lokacija ponuđača. */
interface MapCity {
  id: number;
  name: string;
  x: number;
  y: number;
}

interface Cluster {
  key: string;
  x: number;
  y: number;
  members: Point[];
  /** Id grada kad su svi ponuđači u grupi iz istog grada. */
  city: number | null;
}

const project = (lon: number, lat: number): [number, number] => [
  BIH_GEO.pad + (lon - BIH_GEO.lon0) * BIH_GEO.scaleX,
  BIH_GEO.pad + (BIH_GEO.lat0 - lat) * BIH_GEO.scaleY,
];

/** Kratki nazivi kategorija za opise na mapi (puni nazivi iz šifarnika su predugi za tooltip). */
const CATEGORY_SHORT: Record<string, string> = {
  'saloni-za-vjencanje': 'Sale',
  'vjencanice-i-odijela': 'Vjenčanice',
  fotografi: 'Fotografi',
  dekoracije: 'Dekoracije',
  'svecani-automobili': 'Automobili',
  frizeri: 'Frizeri',
  'beauty-makeup': 'Make-up',
};

export const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'ponuđač' : 'ponuđača');

/**
 * Reljefna 3D mapa BiH sa grupisanim ponuđačima (dio sekcije "Ponuđači širom BiH" na početnoj).
 * Brojevi u krugovima su stvarni broj grupisanih ponuđača; pri približavanju se grupe razdvajaju do
 * pojedinačnih lokacija. Mapa se ne rotira; zumira se dugmadima, dvoklikom, Ctrl + kotačićem ili sa dva prsta,
 * a povlači se samo kad je uvećana (inače bi "zarobila" skrolanje stranice).
 */
@Component({
  selector: 'app-bih-map',
  imports: [FadeInImage, Icon, MapTip, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div
        #stage
        class="stage"
        [class.zoomed]="zoomed()"
        [class.dragging]="dragging()"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="onUp($event)"
        (dblclick)="onDouble($event)"
      >
        <svg [attr.viewBox]="viewBox" role="img" aria-labelledby="mapa-bih">
          <defs>
            <path id="bih-shape" [attr.d]="geo.country" />
            <clipPath id="bih-clip"><use href="#bih-shape" /></clipPath>
            <linearGradient id="bih-top" x1="0" y1="0" x2=".7" y2="1">
              <stop offset="0" style="stop-color: var(--map-top-1)" />
              <stop offset="1" style="stop-color: var(--map-top-2)" />
            </linearGradient>
            <linearGradient id="bih-side" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style="stop-color: var(--map-side-1)" />
              <stop offset="1" style="stop-color: var(--map-side-2)" />
            </linearGradient>
            <filter id="bih-shadow" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="16" /></filter>
            <filter id="bih-relief" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="4" seed="9" result="noise" />
              <feDiffuseLighting in="noise" surfaceScale="2.6" lighting-color="#fff" result="light">
                <feDistantLight azimuth="225" elevation="52" />
              </feDiffuseLighting>
              <feComposite in="light" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
          <g [attr.transform]="transform()">
            <use href="#bih-shape" class="shadow" transform="translate(10 38)" filter="url(#bih-shadow)" />
            @for (d of depth; track d) {
              <use href="#bih-shape" class="side" [attr.transform]="'translate(0 ' + d + ')'" />
            }
            <use href="#bih-shape" class="top" />
            <use href="#bih-shape" class="relief" filter="url(#bih-relief)" />
            <path class="munis" [attr.d]="geo.municipalities" clip-path="url(#bih-clip)" />
            <use href="#bih-shape" class="rim" />
          </g>
        </svg>

        <!-- Tri stanja: grupa ponuđača (broj), pojedinačna lokacija (obrisana pribadača), aktivni grad (popunjen krug). -->
        @for (m of markers(); track m.key) {
          @if (m.members.length === 1) {
            <button type="button" class="pin" [class.hover]="hovered() === m.key" [style.left.px]="m.left" [style.top.px]="m.top"
              [attr.aria-label]="m.members[0].v.name" (click)="onMarker(m)"
              (mouseenter)="hovered.set(m.key)" (mouseleave)="hovered.set(null)" (focus)="hovered.set(m.key)" (blur)="hovered.set(null)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5s-7-6-7-11.8a7 7 0 0 1 14 0c0 5.8-7 11.8-7 11.8z" /><circle cx="12" cy="9.7" r="2.6" /></svg>
            </button>
          } @else {
            <button type="button" class="cluster" [class.hover]="hovered() === m.key" [style.left.px]="m.left" [style.top.px]="m.top"
              [style.--size.px]="m.size" [attr.aria-label]="m.label" (click)="onMarker(m)"
              (mouseenter)="hovered.set(m.key)" (mouseleave)="hovered.set(null)" (focus)="hovered.set(m.key)" (blur)="hovered.set(null)">
              <span class="serif">{{ m.members.length }}</span>
            </button>
          }
        }

        @if (tooltip(); as t) {
          <app-map-tip [data]="t" [style.left.px]="t.left" [style.top.px]="t.top" />
        }

        @if (selection(); as s) {
          <div class="chosen" [style.left.px]="s.left" [style.top.px]="s.top" aria-hidden="true">
            <span class="halo"></span>
            <span class="active"><app-icon name="map-pin" /></span>
          </div>
          <a class="card" [class.below]="s.below" [style.left.px]="s.cardLeft" [style.top.px]="s.top" [style.--tail.px]="s.tail"
            [routerLink]="s.link" [queryParams]="s.params">
            <span class="thumb" [attr.data-letter]="s.image ? null : s.letter">
              @if (s.image) {
                <img appFadeIn [src]="s.image" alt="" decoding="async" />
              } @else {
                <app-icon [name]="s.icon" />
              }
            </span>
            <span class="card-text">
              <strong class="serif">{{ s.title }}</strong>
              <span class="muted">{{ s.subtitle }}</span>
              @if (s.detail) { <span class="card-detail">{{ s.detail }}</span> }
            </span>
            <app-icon name="chevron-right" class="chev" />
          </a>
        }

        <button type="button" class="ctl glass locate" (click)="locate()"><app-icon name="locate" /> Moja lokacija</button>
        <div class="ctl glass zoom">
          <button type="button" aria-label="Uvećaj mapu" (click)="zoomBy(1.8)"><app-icon name="plus" /></button>
          <span aria-hidden="true"></span>
          <button type="button" aria-label="Umanji mapu" (click)="zoomBy(1 / 1.8)"><app-icon name="minus" /></button>
        </div>
        <button type="button" class="ctl glass reset" aria-label="Prikaži cijelu BiH" [class.hidden]="!zoomed()" (click)="reset()">
          <app-icon name="expand" />
        </button>
        <p class="hint" [class.show]="hint()" aria-hidden="true">Za zumiranje držite Ctrl i okrenite kotačić</p>
      </div>
  `,
  styles: `
    :host {
      display: block;
      --map-top-1: color-mix(in srgb, var(--bg-elevated) 96%, var(--blush));
      --map-top-2: color-mix(in srgb, var(--bg-elevated) 84%, var(--blush));
      --map-side-1: color-mix(in srgb, var(--blush) 55%, var(--champagne));
      --map-side-2: color-mix(in srgb, var(--blush-deep) 80%, var(--taupe));
      --map-shadow: rgba(140, 47, 57, 0.28);
      --map-relief: 0.2;
      --map-ring: rgba(255, 255, 255, 0.85);
      --map-rim: rgba(255, 255, 255, 0.9);
      --map-muni: color-mix(in srgb, var(--taupe) 20%, transparent);
    }

    // Tamna tema: površina mape je osjetno svjetlija od pozadine sekcije (a i dalje tamna), granice općina
    // su tek naznačene, a markeri ostaju glavni akcenat.
    :host-context(:root[data-theme='dark']) {
      --map-top-1: #463b38;
      --map-top-2: #362d2b;
      --map-side-1: #4f3a3c;
      --map-side-2: #241a1b;
      --map-shadow: rgba(0, 0, 0, 0.6);
      --map-relief: 0.1;
      --map-ring: rgba(255, 235, 230, 0.28);
      --map-rim: rgba(255, 235, 230, 0.24);
      --map-muni: rgba(255, 235, 225, 0.07);
    }

    @media (prefers-color-scheme: dark) {
      :host-context(:root:not([data-theme='light'])) {
        --map-top-1: #463b38;
        --map-top-2: #362d2b;
        --map-side-1: #4f3a3c;
        --map-side-2: #241a1b;
        --map-shadow: rgba(0, 0, 0, 0.6);
        --map-relief: 0.1;
        --map-ring: rgba(255, 235, 230, 0.28);
        --map-rim: rgba(255, 235, 230, 0.24);
        --map-muni: rgba(255, 235, 225, 0.07);
      }
    }

    // ---- Mapa ----
    .stage {
      position: relative;
      touch-action: pan-y;
      user-select: none;
      -webkit-user-select: none;
      // Kad je uvećana, mapa se ne prelijeva preko teksta, a ivice se mekano gube.
      overflow: hidden;
      border-radius: var(--radius-xl);
    }

    // Uvećana mapa nema tvrdu ivicu "kutije": rubovi se mekano gube u pozadinu sekcije.
    .stage.zoomed {
      touch-action: none;
      cursor: grab;
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent),
        linear-gradient(transparent, #000 7%, #000 93%, transparent);
      -webkit-mask-composite: source-in;
      mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent),
        linear-gradient(transparent, #000 7%, #000 93%, transparent);
      mask-composite: intersect;
    }

    .stage.dragging {
      cursor: grabbing;
    }

    .stage > svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .shadow {
      fill: var(--map-shadow);
    }

    .side {
      fill: url(#bih-side);
    }

    .top {
      fill: url(#bih-top);
    }

    .relief {
      fill: #fff;
      opacity: var(--map-relief);
      mix-blend-mode: multiply;
    }

    .stage.moving .relief {
      opacity: calc(var(--map-relief) * 0.7);
    }

    .munis {
      fill: none;
      stroke: var(--map-muni);
      stroke-width: 0.8;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    .rim {
      fill: none;
      stroke: var(--map-rim);
      stroke-width: 2;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    // Markeri su HTML iznad SVG-a: iste veličine na svakom zumu i oštri na svakom ekranu.
    .cluster,
    .pin {
      position: absolute;
      z-index: 1;
      padding: 0;
      border: 0;
      cursor: pointer;
      animation: marker-in 260ms var(--ease-out) both;
    }

    .cluster {
      display: grid;
      place-items: center;
      width: var(--size);
      height: var(--size);
      translate: -50% -50%;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--blush) 45%, var(--bg-elevated)), color-mix(in srgb, var(--blush) 70%, var(--bg-elevated)));
      box-shadow:
        0 0 0 3px var(--map-ring),
        0 0 0 9px color-mix(in srgb, var(--blush) 30%, transparent),
        0 8px 18px color-mix(in srgb, var(--accent) 22%, transparent);
      color: var(--accent);
      font-size: calc(var(--size) * 0.4);
      font-weight: 620;
      transition: scale var(--dur-fast) var(--ease-out);
    }

    .cluster:hover,
    .cluster.hover,
    .cluster:focus-visible {
      scale: 1.08;
      box-shadow:
        0 0 0 3px var(--map-ring),
        0 0 0 9px color-mix(in srgb, var(--accent) 28%, transparent),
        0 10px 22px color-mix(in srgb, var(--accent) 30%, transparent);
    }

    // Pojedinačna lokacija: obrisana pribadača (lakša od grupe, ali jasno klikabilna).
    .pin {
      width: 1.75rem;
      height: 1.75rem;
      translate: -50% -92%;
      background: none;
      filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.25));
      transition: scale var(--dur-fast) var(--ease-out);
      transform-origin: 50% 100%;
    }

    .pin:hover,
    .pin.hover,
    .pin:focus-visible {
      scale: 1.15;
    }

    .pin svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .pin path {
      fill: var(--bg-elevated);
      stroke: var(--accent);
      stroke-width: 1.8;
    }

    .pin circle {
      fill: none;
      stroke: var(--accent);
      stroke-width: 1.8;
    }

    @keyframes marker-in {
      from {
        opacity: 0;
        scale: 0.6;
      }
    }

    // Aktivni grad: popunjen roze krug sa pribadačom i blagim pulsom; uvijek iznad ostalih markera.
    .chosen {
      position: absolute;
      z-index: 2;
      width: 0;
      height: 0;
      pointer-events: none;
    }

    .active {
      position: absolute;
      left: -1.375rem;
      top: -1.375rem;
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: var(--accent);
      color: var(--text-on-accent);
      box-shadow:
        0 0 0 3px var(--map-ring),
        0 10px 22px color-mix(in srgb, var(--accent) 45%, transparent);
      animation: pop-in 420ms var(--ease-out) both;
    }

    .active app-icon {
      width: 1.3rem;
      height: 1.3rem;
    }

    @keyframes pop-in {
      from {
        opacity: 0;
        scale: 0.4;
      }
      60% {
        scale: 1.08;
      }
    }

    .halo {
      position: absolute;
      left: -2.5rem;
      top: -2.5rem;
      width: 5rem;
      height: 5rem;
      border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%);
      animation: pulse 2.2s ease-out infinite;
    }


    @keyframes pulse {
      0% {
        transform: scale(0.5);
        opacity: 1;
      }
      100% {
        transform: scale(1.4);
        opacity: 0;
      }
    }

    .card {
      position: absolute;
      z-index: 3;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 17.5rem;
      max-width: calc(100% - 1rem);
      padding: 0.5rem 0.875rem 0.5rem 0.5rem;
      translate: 0 calc(-100% - 2.4rem);
      border-radius: var(--radius-lg);
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-regular);
      backdrop-filter: var(--blur-regular);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
      color: var(--text);
      animation: card-in 320ms var(--ease-out) both;
    }

    .card::after {
      content: '';
      position: absolute;
      left: var(--tail, 50%);
      bottom: -0.45rem;
      width: 0.9rem;
      height: 0.9rem;
      translate: -50% 0;
      rotate: 45deg;
      background: inherit;
      border-radius: 0 0 3px 0;
    }

    .card.below {
      translate: 0 2.4rem;
    }

    .card.below::after {
      top: -0.45rem;
      bottom: auto;
      border-radius: 3px 0 0 0;
    }

    @keyframes card-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
      }
    }

    .thumb {
      position: relative;
      display: grid;
      place-items: center;
      flex: none;
      width: 5.25rem;
      height: 4.25rem;
      overflow: hidden;
      border-radius: var(--radius-md);
      background:
        radial-gradient(circle at 75% 20%, color-mix(in srgb, var(--blush) 70%, transparent), transparent 60%),
        linear-gradient(145deg, color-mix(in srgb, var(--blush) 40%, var(--bg-elevated)), color-mix(in srgb, var(--accent) 55%, var(--blush)));
      color: rgba(255, 255, 255, 0.95);
    }

    .thumb::before {
      content: attr(data-letter);
      position: absolute;
      right: 0.35rem;
      bottom: -0.6rem;
      font-family: var(--font-display);
      font-size: 3.4rem;
      font-style: italic;
      line-height: 1;
      color: rgba(255, 255, 255, 0.35);
    }

    .thumb img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumb app-icon {
      width: 1.6rem;
      height: 1.6rem;
    }

    .card-text {
      display: grid;
      flex: 1;
      min-width: 0;
      gap: 0.15rem;
    }

    .card-text strong {
      overflow: hidden;
      font-size: 1.2rem;
      font-weight: 580;
      letter-spacing: -0.01em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-text .muted {
      font-size: 0.875rem;
    }

    .card-detail {
      overflow: hidden;
      color: var(--text-secondary);
      font-size: 0.75rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chev {
      width: 1.1rem;
      height: 1.1rem;
      color: var(--text-secondary);
    }

    // Kontrole su .glass (isto staklo kao navigacija); ovdje samo položaj i malo dublja sjena.
    .ctl {
      position: absolute;
      z-index: 4;
      box-shadow:
        inset 0 1px 0 var(--glass-highlight),
        inset 0 -1px 0 var(--glass-shade),
        var(--shadow-md);
      color: var(--text);
    }

    .ctl app-icon {
      width: 1.2rem;
      height: 1.2rem;
    }

    .ctl button,
    button.ctl {
      cursor: pointer;
    }

    .locate {
      top: 0.75rem;
      right: 0.75rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1.1rem 0.6rem 0.85rem;
      border-radius: var(--radius-full);
      font-size: 0.9375rem;
      font-weight: 500;
    }

    .locate app-icon {
      color: var(--accent);
    }

    .zoom {
      right: 0.75rem;
      bottom: 4.6rem;
      display: grid;
      width: 3rem;
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .zoom button {
      display: grid;
      place-items: center;
      height: 3rem;
      border: 0;
      background: transparent;
      color: inherit;
    }

    .zoom button:hover,
    .reset:hover,
    .locate:hover {
      color: var(--accent);
    }

    .zoom span {
      height: 1px;
      margin-inline: 0.6rem;
      background: var(--separator);
    }

    .reset {
      right: 0.75rem;
      bottom: 0.75rem;
      display: grid;
      place-items: center;
      width: 3rem;
      height: 3rem;
      padding: 0;
      border-radius: 50%;
      transition: opacity var(--dur-fast) ease, scale var(--dur-fast) var(--ease-out);
    }

    .reset.hidden {
      opacity: 0;
      scale: 0.8;
      pointer-events: none;
    }

    .hint {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 5;
      margin: 0;
      padding: 0.6rem 1rem;
      translate: -50% -50%;
      border-radius: var(--radius-full);
      background: var(--material-thick);
      box-shadow: var(--shadow-md);
      font-size: 0.875rem;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--dur-base) ease;
    }

    .hint.show {
      opacity: 1;
    }

    @media (max-width: 39.99rem) {
      .locate {
        padding: 0.5rem 0.8rem;
        font-size: 0.8125rem;
      }

      .zoom {
        display: none;
      }

      .card {
        width: 15rem;
      }

      .thumb {
        width: 4rem;
        height: 3.5rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .halo,
      .active,
      .card,
      .cluster,
      .pin {
        animation: none;
      }
    }
  `,
})
export class BihMap {
  /** Svi ponuđači sa mape (GET /api/vendors/map). */
  readonly data = input<VendorMapPoint[]>([]);
  /** Slug odabrane kategorije ("" = sve); mapa prikazuje samo ponuđače iz nje. */
  readonly category = input('');

  private readonly toasts = inject(ToastService);
  private readonly lookups = inject(LookupStore);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  protected readonly geo = BIH_GEO;
  protected readonly viewBox = `${FRAME_X} ${FRAME_Y} ${FRAME_W} ${FRAME_H}`;
  /** Slojevi "debljine" ploče: isti oblik pomjeren naniže daje 3D rub. */
  protected readonly depth = Array.from({ length: DEPTH }, (_, i) => DEPTH - i);

  protected readonly view = signal<View>({ k: 1, x: 0, y: 0 });
  /** Zum za grupisanje: mijenja se tek kad se pokret završi, da se markeri ne prespajaju usred animacije. */
  private readonly settledK = signal(1);
  private readonly width = signal(0);
  protected readonly dragging = signal(false);
  protected readonly hint = signal(false);
  private readonly selected = signal<{ type: 'city'; cityId: number } | { type: 'vendor'; point: Point } | null>(null);

  protected readonly zoomed = computed(() => this.view().k > 1.01);
  protected readonly transform = computed(() => {
    const { k, x, y } = this.view();
    return `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`;
  });

  private readonly allPoints = computed<Point[]>(() =>
    this.data().map((v) => {
      const [x, y] = project(v.longitude, v.latitude);
      return { v, x, y };
    }),
  );

  /** Ponuđači u odabranoj kategoriji. */
  private readonly points = computed(() => {
    const c = this.category();
    return c ? this.allPoints().filter((p) => p.v.categories.includes(c)) : this.allPoints();
  });

  private readonly cities = computed(() => {
    const groups = new Map<number, Point[]>();
    for (const p of this.allPoints()) groups.set(p.v.cityId, [...(groups.get(p.v.cityId) ?? []), p]);
    const out = new Map<number, MapCity>();
    for (const [id, members] of groups) {
      // Ponuđač bez vlastite lokacije stoji tačno u centru grada; inače prosjek lokacija.
      const center = members.find((m) => m.v.isApproximate);
      out.set(id, {
        id,
        name: members[0].v.cityName,
        x: center?.x ?? members.reduce((a, m) => a + m.x, 0) / members.length,
        y: center?.y ?? members.reduce((a, m) => a + m.y, 0) / members.length,
      });
    }
    return out;
  });

  /** Pohlepno grupisanje u prostoru ekrana: prvo veći gradovi, pa svaki ponuđač ide u najbližu postojeću grupu. */
  private readonly clusters = computed<Cluster[]>(() => {
    const scale = this.width() / FRAME_W;
    if (!scale) return [];
    const radius = clusterPx(this.width()) / (this.settledK() * scale);
    const sel = this.selected();
    const hiddenCity = sel?.type === 'city' ? sel.cityId : null;
    const hiddenId = sel?.type === 'vendor' ? sel.point.v.id : null;

    // Veći gradovi prvi, da baš oni budu "sjeme" grupa (Sarajevo upije Ilidžu, a ne obratno).
    const sizes = new Map<number, number>();
    for (const p of this.points()) sizes.set(p.v.cityId, (sizes.get(p.v.cityId) ?? 0) + 1);
    const ordered = [...this.points()].sort((a, b) => sizes.get(b.v.cityId)! - sizes.get(a.v.cityId)! || a.v.id - b.v.id);

    const groups: { sx: number; sy: number; members: Point[] }[] = [];
    for (const p of ordered) {
      if (p.v.cityId === hiddenCity || p.v.id === hiddenId) continue;
      let best: (typeof groups)[number] | null = null;
      let bestD = radius;
      for (const g of groups) {
        const d = Math.hypot(g.sx - p.x, g.sy - p.y);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      if (best) best.members.push(p);
      else groups.push({ sx: p.x, sy: p.y, members: [p] });
    }

    return groups.map((g) => {
      const n = g.members.length;
      const cities = new Set(g.members.map((m) => m.v.cityId));
      return {
        key: `${g.members[0].v.id}-${n}`,
        x: g.members.reduce((a, m) => a + m.x, 0) / n,
        y: g.members.reduce((a, m) => a + m.y, 0) / n,
        members: g.members,
        city: cities.size === 1 ? g.members[0].v.cityId : null,
      };
    });
  });

  protected readonly markers = computed(() => {
    const { k, x, y } = this.view();
    const scale = this.width() / FRAME_W;
    const w = this.width();
    const h = FRAME_H * scale;
    return this.clusters()
      .map((c) => {
        const n = c.members.length;
        const cityName = c.city !== null ? c.members[0].v.cityName : null;
        return {
          ...c,
          left: (c.x * k + x - FRAME_X) * scale,
          top: (c.y * k + y - FRAME_Y) * scale,
          size: Math.round((w < 480 ? 30 : 38) + Math.min(Math.log2(n) * (w < 480 ? 3 : 4.2), w < 480 ? 14 : 22)),
          label: cityName ? `${cityName}: ${n} ${plural(n)}` : `${n} ${plural(n)} u ovoj zoni, približi mapu`,
          cityName,
        };
      })
      .filter((m) => m.left > -30 && m.left < w + 30 && m.top > -30 && m.top < h + 30);
  });

  /** Marker iznad kojeg je miš (ili fokus tastature); prikazuje mali opis šta broj znači. */
  protected readonly hovered = signal<string | null>(null);

  protected readonly tooltip = computed(() => {
    const key = this.hovered();
    const m = key && !this.dragging() ? this.markers().find((x) => x.key === key) : undefined;
    if (!m) return null;
    const n = m.members.length;
    let title: string;
    let detail: string;
    let hint: string;
    if (n === 1) {
      const v = m.members[0].v;
      title = v.name;
      detail = this.vendorSubtitle(v);
      hint = 'Kliknite za detalje.';
    } else {
      title = m.cityName ? `${m.cityName} · ${n} ${plural(n)}` : `${n} ${plural(n)}`;
      detail = this.category() ? '' : this.breakdown(m.members);
      hint = m.cityName ? 'Kliknite za pregled ponude u gradu.' : 'Više gradova: kliknite da približite mapu.';
    }
    // Uz gornju ivicu opis ide ispod markera.
    return { left: m.left, top: m.top, below: m.top < 120, offset: n === 1 ? 40 : m.size / 2 + 12, count: n, title, detail, hint };
  });

  protected readonly selection = computed(() => {
    const sel = this.selected();
    if (!sel) return null;
    const { k, x, y } = this.view();
    const scale = this.width() / FRAME_W;
    let wx: number;
    let wy: number;
    let base: {
      title: string;
      subtitle: string;
      detail: string;
      icon: string;
      letter: string;
      image: string | null;
      link: string[];
      params: Record<string, string | number> | null;
    };
    if (sel.type === 'city') {
      const city = this.cities().get(sel.cityId);
      if (!city) return null;
      ({ x: wx, y: wy } = city);
      const inCity = this.points().filter((p) => p.v.cityId === city.id);
      const n = inCity.length;
      base = {
        title: city.name,
        subtitle: `${n} ${plural(n)}`,
        detail: this.category() || n < 2 ? '' : this.breakdown(inCity),
        icon: 'map-pin',
        letter: city.name[0],
        // Fotografija grada je naslovna slika prvog ponuđača iz njega koji je ima.
        image: inCity.find((p) => p.v.imageUrl)?.v.imageUrl ?? null,
        link: ['/istrazi'],
        params: { grad: city.id, ...(this.category() ? { kategorija: this.category() } : {}) },
      };
    } else {
      ({ x: wx, y: wy } = sel.point);
      const v = sel.point.v;
      const slug = (this.category() || v.categories[0]) ?? null;
      base = {
        title: v.name,
        subtitle: this.vendorSubtitle(v),
        detail: '',
        icon: categoryIcon(slug),
        letter: v.name[0],
        image: v.imageUrl,
        link: vendorLink(v),
        params: null,
      };
    }
    const left = (wx * k + x - FRAME_X) * scale;
    const top = (wy * k + y - FRAME_Y) * scale;
    // Kartica je centrirana iznad pribadače, ali ne izlazi iz okvira mape.
    const cardW = Math.min(280, this.width() - 16);
    const cardLeft = Math.min(Math.max(left - cardW / 2, 8), this.width() - cardW - 8);
    // Uz sjevernu ivicu kartica ne bi stala iznad pribadače, pa ide ispod nje.
    const below = top < 150;
    const tail = Math.min(Math.max(left - cardLeft, 20), cardW - 20);
    return { ...base, left, top, cardLeft, below, tail };
  });

  private raf = 0;
  private hintTimer = 0;
  private settleTimer = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; view: View; moved: boolean } | null = null;
  private pinch: { dist: number; view: View; cx: number; cy: number } | null = null;
  private suppressClick = false;

  constructor() {
    // Promjena kategorije: odabir koji više nije na mapi se zatvara.
    effect(() => {
      const slug = this.category();
      untracked(() => {
        const sel = this.selected();
        if (sel?.type === 'vendor' && slug && !sel.point.v.categories.includes(slug)) this.selected.set(null);
        if (sel?.type === 'city' && !this.countIn(sel.cityId)) this.selected.set(null);
      });
    });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.stage().nativeElement;
      // Širina odmah, pa praćenje promjena (ResizeObserver ne javlja ništa dok je kartica u pozadini).
      this.width.set(el.clientWidth);
      const ro = new ResizeObserver(([entry]) => this.width.set(entry.contentRect.width));
      ro.observe(el);
      const wheel = (e: WheelEvent) => this.onWheel(e);
      el.addEventListener('wheel', wheel, { passive: false });
      destroyRef.onDestroy(() => {
        ro.disconnect();
        el.removeEventListener('wheel', wheel);
        cancelAnimationFrame(this.raf);
        clearTimeout(this.hintTimer);
        clearTimeout(this.settleTimer);
      });
    });
  }

  /** "Fotograf · Sarajevo": kategorija (odabrana ili prva) i grad ponuđača. */
  private vendorSubtitle(v: VendorMapPoint): string {
    const slug = this.category() || v.categories[0];
    const name = slug ? (CATEGORY_SHORT[slug] ?? this.lookups.categories().find((c) => c.slug === slug)?.name) : null;
    return name ? `${name} · ${v.cityName}` : v.cityName;
  }

  /** Najzastupljenije kategorije u grupi: "Sale 3 · Fotografi 2 · Dekoracije 2". */
  private breakdown(points: Point[]): string {
    const counts = new Map<string, number>();
    for (const p of points) for (const c of p.v.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([slug, n]) => `${CATEGORY_SHORT[slug] ?? this.lookups.categories().find((c) => c.slug === slug)?.name ?? slug} ${n}`)
      .join(' · ');
  }

  private countIn(cityId: number): number {
    return this.points().filter((p) => p.v.cityId === cityId).length;
  }

  /** Odabir grada izvana (pretraga u sekciji); nepoznat grad se ignoriše. */
  selectCityById(cityId: number): void {
    const city = this.cities().get(cityId);
    if (city) this.selectCity(city);
  }

  private selectCity(city: MapCity): void {
    this.selected.set({ type: 'city', cityId: city.id });
    // Na cijeloj BiH grad se samo označi (kontekst ostaje vidljiv); na uvećanoj mapi mapa dođe do njega.
    if (this.zoomed()) this.focus(city.x, city.y, this.view().k);
  }

  protected onMarker(m: Cluster): void {
    if (this.suppressClick) return;
    if (m.members.length === 1) {
      const point = m.members[0];
      this.selected.set({ type: 'vendor', point });
      this.focus(point.x, point.y, Math.max(this.view().k, 3.5));
      return;
    }
    const k = this.view().k;
    const spread = Math.max(...m.members.map((p) => Math.hypot(p.x - m.x, p.y - m.y)));
    // Jedan grad koji se ni na najvećem zumu ne bi razdvojio dovoljno: odmah ga odaberi.
    // Grupa iz jednog grada: kad se ne bi razdvojila ni na najvećem zumu, ili je mapa već uvećana, odaberi grad.
    const city = m.city !== null ? this.cities().get(m.city) : undefined;
    const tight = spread * MAX_K * (this.width() / FRAME_W) < clusterPx(this.width()) * 1.5;
    if (city && (tight || k >= 2.5)) {
      this.selectCity(city);
      return;
    }
    this.focus(m.x, m.y, Math.min(k * 2.4, MAX_K), 0.5);
  }

  protected zoomBy(factor: number): void {
    const v = this.view();
    const k = Math.min(Math.max(v.k * factor, 1), MAX_K);
    this.zoomAt(VB_W / 2, VB_H / 2, k);
    if (k <= 1.01) this.selected.set(null);
  }

  protected reset(): void {
    this.selected.set(null);
    this.animateTo({ k: 1, x: 0, y: 0 });
  }

  protected locate(): void {
    if (!('geolocation' in navigator)) {
      this.toasts.info('Vaš preglednik ne dijeli lokaciju.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Udaljenost u prostoru mape; 1 km je oko 2,8 jedinica (BIH_GEO.scaleY / 111).
        const [ux, uy] = project(coords.longitude, coords.latitude);
        const unitsPerKm = BIH_GEO.scaleY / 111;
        let best: MapCity | null = null;
        let bestKm = Infinity;
        for (const c of this.cities().values()) {
          const km = Math.hypot(c.x - ux, c.y - uy) / unitsPerKm;
          if (km < bestKm) {
            bestKm = km;
            best = c;
          }
        }
        if (best && bestKm < 60) this.selectCity(best);
        else this.toasts.info('Izgleda da niste u BiH, pa prikazujemo cijelu mapu.');
      },
      () => this.toasts.info('Lokacija nije dostupna. Odaberite grad na mapi ili u pretrazi.'),
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  // ---- Pokret i gestovi ----

  private clamp(v: View): View {
    const k = Math.min(Math.max(v.k, 1), MAX_K);
    return {
      k,
      x: Math.min(0, Math.max(VB_W - VB_W * k, v.x)),
      y: Math.min(0, Math.max(VB_H - VB_H * k, v.y)),
    };
  }

  /** Dovodi tačku sveta (wx, wy) na dati dio okvira; pribadača ide malo ispod centra da kartica stane iznad. */
  private focus(wx: number, wy: number, k: number, fy = 0.62): void {
    this.animateTo({ k, x: FRAME_X + FRAME_W / 2 - wx * k, y: FRAME_Y + FRAME_H * fy - wy * k });
  }

  private zoomAt(vx: number, vy: number, k: number, animate = true): void {
    const v = this.view();
    const r = k / v.k;
    const target = { k, x: vx - (vx - v.x) * r, y: vy - (vy - v.y) * r };
    if (animate) this.animateTo(target);
    else {
      this.view.set(this.clamp(target));
      this.settleSoon();
    }
  }

  private animateTo(target: View, ms = 560): void {
    cancelAnimationFrame(this.raf);
    const to = this.clamp(target);
    const from = this.view();
    if (prefersReducedMotion()) {
      this.view.set(to);
      this.settledK.set(to.k);
      return;
    }
    const t0 = performance.now();
    // Zum se interpolira logaritamski, pa približavanje djeluje ravnomjerno.
    const lk0 = Math.log(from.k);
    const lk1 = Math.log(to.k);
    const step = (now: number) => {
      const t = Math.min((now - t0) / ms, 1);
      const e = 1 - Math.pow(1 - t, 3);
      this.view.set({ k: Math.exp(lk0 + (lk1 - lk0) * e), x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (t < 1) this.raf = requestAnimationFrame(step);
      else this.settledK.set(to.k);
    };
    this.raf = requestAnimationFrame(step);
  }

  private settleSoon(): void {
    clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.settledK.set(this.view().k), 140);
  }

  private toViewBox(clientX: number, clientY: number): [number, number] {
    const rect = this.stage().nativeElement.getBoundingClientRect();
    const scale = rect.width / FRAME_W;
    return [(clientX - rect.left) / scale + FRAME_X, (clientY - rect.top) / scale + FRAME_Y];
  }

  private onWheel(e: WheelEvent): void {
    if (!(e.ctrlKey || e.metaKey)) {
      // Običan kotačić skroluje stranicu; samo kratko podsjeti kako se zumira.
      this.hint.set(true);
      clearTimeout(this.hintTimer);
      this.hintTimer = window.setTimeout(() => this.hint.set(false), 1200);
      return;
    }
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    const [vx, vy] = this.toViewBox(e.clientX, e.clientY);
    const k = Math.min(Math.max(this.view().k * Math.exp(-e.deltaY * 0.0035), 1), MAX_K);
    this.zoomAt(vx, vy, k, false);
  }

  protected onDouble(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('button, a')) return;
    const [vx, vy] = this.toViewBox(e.clientX, e.clientY);
    this.zoomAt(vx, vy, Math.min(this.view().k * 2, MAX_K));
  }

  protected onDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.suppressClick = false;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const [cx, cy] = this.toViewBox((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: this.view(), cx, cy };
      this.drag = null;
      cancelAnimationFrame(this.raf);
    } else if (this.pointers.size === 1) {
      this.drag = { x: e.clientX, y: e.clientY, view: this.view(), moved: false };
    }
  }

  protected onMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const p = this.pinch;
      const k = Math.min(Math.max((p.view.k * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist, 1), MAX_K);
      const r = k / p.view.k;
      this.view.set(this.clamp({ k, x: p.cx - (p.cx - p.view.x) * r, y: p.cy - (p.cy - p.view.y) * r }));
      this.suppressClick = true;
      this.settleSoon();
      return;
    }

    const d = this.drag;
    if (!d || !this.zoomed()) return;
    const scale = this.width() / FRAME_W;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    if (!d.moved && Math.hypot(dx * scale, dy * scale) > 4) {
      d.moved = true;
      this.suppressClick = true;
      this.dragging.set(true);
      cancelAnimationFrame(this.raf);
      this.stage().nativeElement.setPointerCapture(e.pointerId);
    }
    if (d.moved) this.view.set(this.clamp({ k: d.view.k, x: d.view.x + dx, y: d.view.y + dy }));
  }

  protected onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    this.dragging.set(false);
    // Klik na praznu mapu zatvara odabir.
    if (d && !d.moved && e.type === 'pointerup' && !(e.target as HTMLElement).closest('button, a')) {
      this.selected.set(null);
    }
  }
}
