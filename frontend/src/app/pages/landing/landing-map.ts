import { ChangeDetectionStrategy, Component, computed, input, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { VendorMapPoint } from '../../core/models';
import { springNumber } from '../../shared/motion/spring-number';
import { Icon } from '../../shared/ui/icon';
import { plural } from '../../core/format';
import { BihMap } from './bih-map';

/** Brzi filteri iznad mape; "Sve" je prazan slug. */
const MAP_CATEGORIES = [
  { slug: '', name: 'Sve', icon: 'store' },
  { slug: 'saloni-za-vjencanje', name: 'Sale', icon: 'rings' },
  { slug: 'fotografi', name: 'Fotografi', icon: 'camera' },
  { slug: 'dekoracije', name: 'Dekorateri', icon: 'flower' },
];

/** Pretraga bez obzira na kvačice: "banja luka", "bihac", "brcko". */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'dj');

/**
 * Sekcija početne "Ponuđači širom BiH": tekst, pretraga grada, brzi filteri i brojke lijevo, a reljefna
 * mapa (BihMap) desno. Kategorija se dijeli sa mapom, a odabir grada iz pretrage ide direktno na mapu.
 */
@Component({
  selector: 'app-landing-map',
  imports: [BihMap, DecimalPipe, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.raised]="mapFull()">
      <svg class="decor heart" viewBox="0 0 120 100" aria-hidden="true">
        <path d="M60 92C30 70 8 52 8 31 8 16 20 6 33 6c11 0 20 7 27 18C67 13 76 6 87 6c13 0 25 10 25 25 0 21-22 39-52 61z" />
        <path d="M60 92c-6-5-11-9-16-14" />
      </svg>
      <svg class="decor leaves" viewBox="0 0 220 220" aria-hidden="true">
        <path d="M30 210C60 150 90 110 150 70" class="stem" />
        <path d="M58 158c-26-4-42-22-44-48 26 4 42 22 44 48z" />
        <path d="M78 128c-24-8-36-28-34-54 24 8 36 28 34 54z" />
        <path d="M104 100c-20-12-28-34-22-58 20 12 28 34 22 58z" />
        <path d="M66 166c22 12 46 10 66-6-22-12-46-10-66 6z" />
        <path d="M92 136c22 10 46 6 64-12-22-10-46-6-64 12z" />
        <path d="M120 106c20 8 42 2 56-16-20-8-42-2-56 16z" />
      </svg>

      <div class="copy">
        <p class="eyebrow-pill"><app-icon name="map-pin" /> Ponuđači širom BiH</p>
        <h2 id="mapa-bih" class="title">
          Od Bihaća do Trebinja, <em>pronađite svoje.</em>
        </h2>
        <p class="lead">Svako svjetlo je salon, fotograf ili dekorater koji je već na platformi. Odaberite grad i pogledajte ponudu.</p>

        <div class="search" role="search">
          <app-icon name="search" />
          <input
            type="search"
            placeholder="Pretražite grad…"
            aria-label="Pretražite grad"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            (keydown.enter)="pickFirst()"
            autocomplete="off"
          />
          @if (suggestions().length) {
            <ul class="suggest dropdown-panel" role="listbox">
              @for (c of suggestions(); track c.id) {
                <li><button type="button" (click)="selectCity(c)">
                  <app-icon name="map-pin" /> {{ c.name }} <span class="muted">{{ c.count }}</span>
                </button></li>
              }
            </ul>
          }
        </div>

        <div class="chips" role="group" aria-label="Kategorija">
          @for (c of categories; track c.slug) {
            <button type="button" class="chip" [class.on]="category() === c.slug" (click)="setCategory(c.slug)">
              <app-icon [name]="c.icon" /> {{ c.name }}
            </button>
          }
        </div>

        <div class="stats">
          <div class="stat">
            <span class="stat-icon"><app-icon name="store" /></span>
            <span><strong class="serif">{{ vendorCount() | number: '1.0-0' }}</strong><span class="muted">{{ vendorWord() }}</span></span>
          </div>
          <span class="stat-div" aria-hidden="true"></span>
          <div class="stat">
            <span class="stat-icon"><app-icon name="map-pin" /></span>
            <span><strong class="serif">{{ cityCount() | number: '1.0-0' }}</strong><span class="muted">{{ cityWord() }}</span></span>
          </div>
        </div>

        <a class="btn btn-primary btn-lg cta" routerLink="/istrazi" [queryParams]="{ kategorija: category() || null }">
          Pogledaj sve ponude <app-icon name="arrow-right" />
        </a>
      </div>

      <app-bih-map [data]="data()" [category]="category()" (fullChange)="mapFull.set($event)" />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .shell {
      position: relative;
      display: grid;
      gap: var(--space-6);
      padding: clamp(var(--space-5), 4.5vw, 4rem) clamp(var(--space-4), 2vw, 1.5rem) clamp(var(--space-5), 3vw, 2.5rem)
        clamp(var(--space-5), 4.5vw, 4rem);
      overflow: hidden;
      isolation: isolate;
      border-radius: calc(var(--radius-xl) + 6px);
      border: 1px solid var(--material-edge);
      background:
        radial-gradient(42rem 30rem at 78% 30%, color-mix(in srgb, var(--blush) 28%, transparent), transparent 70%),
        radial-gradient(30rem 24rem at 0% 100%, color-mix(in srgb, var(--blush) 22%, transparent), transparent 70%),
        linear-gradient(160deg, color-mix(in srgb, var(--bg) 82%, var(--blush)), var(--bg) 70%);
      box-shadow: var(--shadow-lg);
    }

    // Sekcija pravi svoj sloj (isolation), pa mapa preko cijelog ekrana mora podići cijelu sekciju iznad trake.
    .shell.raised {
      z-index: 1000;
    }

    .decor {
      position: absolute;
      z-index: -1;
      pointer-events: none;
      fill: none;
      stroke: var(--blush-deep);
      stroke-width: 2;
      stroke-linecap: round;
      opacity: calc(var(--decor-opacity) * 0.7);
    }

    .heart {
      left: 32%;
      top: 1.5rem;
      width: 7.5rem;
    }

    .leaves {
      left: -2.5rem;
      bottom: -2.5rem;
      width: 13rem;
      fill: color-mix(in srgb, var(--blush-deep) 60%, transparent);
      stroke: none;
      filter: blur(0.6px);
    }

    .leaves .stem {
      fill: none;
      stroke: color-mix(in srgb, var(--blush-deep) 70%, transparent);
    }

    // ---- Tekst ----
    .copy {
      display: grid;
      justify-items: start;
      gap: var(--space-4);
      align-content: center;
    }

    .eyebrow-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 var(--space-2);
      padding: 0.55rem 1.1rem 0.55rem 0.9rem;
      border-radius: var(--radius-full);
      background: var(--material-thick);
      box-shadow: var(--shadow-md), inset 0 1px 0 var(--material-edge);
      color: var(--accent);
      font-size: 0.8125rem;
      font-weight: 650;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .eyebrow-pill app-icon {
      width: 1.1rem;
      height: 1.1rem;
    }

    .title {
      margin: 0;
      font-family: var(--font-display);
      font-optical-sizing: auto;
      font-size: clamp(2rem, 3.4vw, 2.875rem);
      line-height: 1.06;
      letter-spacing: -0.028em;
      font-weight: 560;
      text-wrap: balance;
    }

    .title em {
      color: var(--accent);
      font-style: italic;
    }

    .lead {
      max-width: 28rem;
      margin: 0;
      color: var(--text-secondary);
      font-size: 1.0625rem;
      line-height: 1.55;
    }

    .search {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: min(100%, 28rem);
      margin-top: var(--space-2);
      padding: 0 1.25rem;
      min-height: 3.25rem;
      border-radius: var(--radius-full);
      background: var(--material-thick);
      box-shadow: var(--shadow-sm), inset 0 1px 0 var(--material-edge);
      color: var(--text-secondary);
    }

    .search:focus-within {
      box-shadow: var(--shadow-md), 0 0 0 3px var(--accent-soft);
    }

    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      font-size: 1rem;
      color: var(--text);
      outline: none;
    }

    // Izgled panela je zajednički (.dropdown-panel); ovdje samo položaj ispod polja.
    .suggest {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 0.4rem);
      z-index: 5;
    }

    .suggest button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.55rem 0.75rem;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      font-size: 0.9375rem;
      text-align: left;
      cursor: pointer;
    }

    .suggest button:hover {
      background: var(--accent-soft);
    }

    .suggest app-icon {
      width: 1rem;
      height: 1rem;
      color: var(--accent);
    }

    .suggest .muted {
      margin-left: auto;
      font-size: 0.8125rem;
    }

    // Sva četiri filtera u jednom redu; na uskom telefonu bez ikonica, da i dalje stanu.
    .chips {
      display: flex;
      flex-wrap: nowrap;
      gap: 0.375rem;
    }

    .chip {
      min-height: 2.375rem;
      padding-inline: 0.7rem;
      font-size: 0.875rem;
      background: var(--material-thick);
      box-shadow: var(--shadow-sm);
    }

    .chip app-icon {
      width: 1.05rem;
      height: 1.05rem;
    }

    .chip.on {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--text-on-accent);
    }

    .stats {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      margin-block: var(--space-3);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .stat > span:last-child {
      display: grid;
      line-height: 1.1;
    }

    .stat strong {
      font-size: 2rem;
      font-weight: 560;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .stat .muted {
      font-size: 0.9375rem;
    }

    .stat-icon {
      display: grid;
      place-items: center;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: color-mix(in srgb, var(--blush) 32%, transparent);
      color: var(--accent);
    }

    .stat-icon app-icon {
      width: 1.6rem;
      height: 1.6rem;
    }

    .stat-div {
      width: 1px;
      height: 3rem;
      background: var(--separator);
    }

    .cta {
      box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 30%, transparent);
    }

    @media (min-width: 60rem) {
      .shell {
        grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
        align-items: center;
      }
    }

    @media (max-width: 39.99rem) {
      .stats {
        gap: var(--space-4);
      }
    }

    @media (max-width: 25.99rem) {
      .chip app-icon {
        display: none;
      }
    }
  `,
})
export class LandingMap {
  /**
   * Tačke iz GET /api/vendors/map; početna prikazuje sekciju tek kad ih ima. Nije `required` jer brojači
   * (springNumber) čitaju vrijednost već u konstruktoru, prije nego Angular postavi ulaz.
   */
  readonly data = input<VendorMapPoint[]>([]);

  private readonly map = viewChild.required(BihMap);

  protected readonly categories = MAP_CATEGORIES;
  protected readonly category = signal('');
  protected readonly query = signal('');
  /** Mapa je preko cijelog ekrana: sekcija ide iznad navigacije (vidi .raised). */
  protected readonly mapFull = signal(false);

  /** Ponuđači u odabranoj kategoriji. */
  private readonly points = computed(() => {
    const c = this.category();
    return c ? this.data().filter((p) => p.categories.includes(c)) : this.data();
  });

  protected readonly vendorCount = springNumber(() => this.points().length);
  protected readonly cityCount = springNumber(() => new Set(this.points().map((p) => p.cityId)).size);
  // Riječ ide uz konačan broj (ne uz brojač usred animacije): 1 grad, 2 grada, 5 gradova.
  protected readonly vendorWord = computed(() => plural(this.points().length, 'ponuđač', 'ponuđača', 'ponuđača'));
  protected readonly cityWord = computed(() =>
    plural(new Set(this.points().map((p) => p.cityId)).size, 'grad', 'grada', 'gradova'),
  );

  /** Gradovi sa ponuđačima (u odabranoj kategoriji), najveći prvi. */
  private readonly cities = computed(() => {
    const byId = new Map<number, { id: number; name: string; count: number }>();
    for (const p of this.points()) {
      const city = byId.get(p.cityId) ?? { id: p.cityId, name: p.cityName, count: 0 };
      city.count++;
      byId.set(p.cityId, city);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count);
  });

  protected readonly suggestions = computed(() => {
    const q = normalize(this.query().trim());
    if (!q) return [];
    return this.cities()
      .filter((c) => normalize(c.name).includes(q))
      .slice(0, 5);
  });

  protected setCategory(slug: string): void {
    this.category.set(slug);
  }

  protected pickFirst(): void {
    const first = this.suggestions()[0];
    if (first) this.selectCity(first);
  }

  protected selectCity(city: { id: number }): void {
    this.query.set('');
    this.map().selectCityById(city.id);
  }
}
