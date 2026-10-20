import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { FavoritesService, SavedVendor } from '../../core/favorites';
import { formatPrice, formatPriceRange, plural } from '../../core/format';
import { vendorLink } from '../../core/links';
import { Icon } from '../../shared/ui/icon';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

const MAX_COMPARE = 3;

/**
 * "Sačuvano": ponuđači koje mladenci razmatraju, grupisani po kategoriji, sa okvirnim minimumom
 * budžeta i poređenjem do tri ponuđača jedno uz drugo.
 */
@Component({
  selector: 'app-saved',
  imports: [RouterLink, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Sačuvano</h1>
          <p class="muted">
            @if (favorites.count()) {
              {{ favorites.count() }} {{ plural(favorites.count(), 'ponuđač', 'ponuđača', 'ponuđača') }} koje razmatrate.
            } @else {
              Ponuđači koje razmatrate, na jednom mjestu.
            }
          </p>
        </div>
        @if (favorites.count()) {
          <div class="summary card">
            <app-icon name="wallet" />
            <div>
              <p class="t-caption muted">Najmanje za {{ groups().length }} {{ plural(groups().length, 'kategoriju', 'kategorije', 'kategorija') }}</p>
              <p class="t-title-3">od {{ price(minimumTotal()) }}</p>
            </div>
          </div>
        }
      </header>

      @if (!auth.isLoggedIn() && favorites.count()) {
        <p class="alert alert-info note">
          Lista je sačuvana samo u ovom pregledniku.
          <a routerLink="/registracija" [queryParams]="{ povratak: '/sacuvano' }">Napravite profil</a> da je ne izgubite.
        </p>
      }

      @for (group of groups(); track group.category) {
        <section class="group">
          <div class="group-head">
            <h2 class="t-title-3">{{ group.category }}</h2>
            <span class="t-footnote muted">{{ group.items.length }} · od {{ price(group.cheapest) }}</span>
          </div>
          <div class="list">
            @for (item of group.items; track item.id) {
              <article class="item card" [class.selected]="isSelected(item.id)">
                <a class="thumb" [routerLink]="link(item)" [attr.aria-label]="item.name">
                  @if (item.cover) {
                    <img [src]="item.cover" alt="" loading="lazy" decoding="async" />
                  } @else {
                    <app-icon name="image" />
                  }
                </a>
                <div class="info">
                  <a class="name" [routerLink]="link(item)">{{ item.name }}</a>
                  <p class="t-footnote muted">
                    {{ item.cityName }}
                    @if (item.averageRating) { · <app-icon name="star" [filled]="true" class="star" /> {{ item.averageRating.toFixed(1) }} }
                  </p>
                  <p class="t-callout strong">{{ categoryPrice(item, group.category) }}</p>
                </div>
                <div class="actions">
                  <label class="compare" [class.disabled]="!isSelected(item.id) && selected().length >= maxCompare">
                    <input type="checkbox" [checked]="isSelected(item.id)"
                      [disabled]="!isSelected(item.id) && selected().length >= maxCompare"
                      (change)="toggleCompare(item.id)" />
                    <span>Uporedi</span>
                  </label>
                  <button type="button" class="icon-btn" (click)="remove(item)" [attr.aria-label]="'Ukloni ' + item.name">
                    <app-icon name="trash" />
                  </button>
                </div>
              </article>
            }
          </div>
        </section>
      } @empty {
        <div class="empty-state">
          <app-icon name="heart" />
          <h3 class="t-title-3">Još ništa niste sačuvali</h3>
          <p>Dodirnite srce na ponuđaču koji vam se sviđa i ovdje ćete ih moći uporediti.</p>
          <div class="row-wrap center">
            <a class="btn btn-primary" routerLink="/istrazi">Istražite ponudu</a>
            <a class="btn btn-magic" routerLink="/planiranje"><app-icon name="sparkles" /> Složi mi paket</a>
          </div>
        </div>
      }
    </div>

    @if (selected().length) {
      <div class="compare-bar material" role="region" aria-label="Poređenje">
        <span class="t-callout"><strong>{{ selected().length }}</strong> od {{ maxCompare }} za poređenje</span>
        <div class="row">
          <button type="button" class="btn btn-plain btn-sm" (click)="selected.set([])">Očisti</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="selected().length < 2" (click)="compareOpen.set(true)">
            <app-icon name="compare" /> Uporedi
          </button>
        </div>
      </div>
    }

    @if (compareOpen()) {
      <app-sheet title="Poređenje" [wide]="true" (closed)="compareOpen.set(false)">
        <div class="table-wrap">
          <table class="table compare-table">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Svojstvo</span></th>
                @for (item of compared(); track item.id) {
                  <th scope="col">
                    <a [routerLink]="link(item)" (click)="compareOpen.set(false)">{{ item.name }}</a>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Grad</th>
                @for (item of compared(); track item.id) { <td>{{ item.cityName }}</td> }
              </tr>
              <tr>
                <th scope="row">Cijena</th>
                @for (item of compared(); track item.id) {
                  <td [class.best]="item.priceFrom === bestPrice()">{{ range(item.priceFrom, item.priceTo) }}</td>
                }
              </tr>
              <tr>
                <th scope="row">Ocjena</th>
                @for (item of compared(); track item.id) {
                  <td [class.best]="item.averageRating !== null && item.averageRating === bestRating()">
                    @if (item.averageRating) { {{ item.averageRating.toFixed(1) }} ({{ item.reviewCount }}) } @else { — }
                  </td>
                }
              </tr>
              <tr>
                <th scope="row">Online rezervacija</th>
                @for (item of compared(); track item.id) { <td>{{ item.bookingEnabled ? 'Da' : 'Ne' }}</td> }
              </tr>
              <tr>
                <th scope="row">Usluge</th>
                @for (item of compared(); track item.id) {
                  <td>
                    <ul class="offers">
                      @for (o of item.offerings; track o.title) {
                        <li><span>{{ o.title }}</span> <span class="muted">{{ range(o.priceFrom, o.priceTo) }}</span></li>
                      }
                    </ul>
                  </td>
                }
              </tr>
            </tbody>
          </table>
        </div>
        <p class="t-caption subtle">Zelenim je označena najniža početna cijena i najbolja ocjena.</p>
      </app-sheet>
    }
  `,
  styles: `
    .summary {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }

    .summary app-icon {
      width: 1.5rem;
      height: 1.5rem;
      color: var(--accent);
    }

    .note {
      margin-bottom: var(--space-5);
    }

    .note a {
      font-weight: 600;
      text-decoration: underline;
    }

    .group {
      display: grid;
      gap: var(--space-3);
      margin-bottom: var(--space-6);
    }

    .group-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .list {
      display: grid;
      gap: var(--space-3);
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
    }

    .item {
      display: grid;
      grid-template-columns: 5.5rem 1fr auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      transition: box-shadow var(--dur-base) var(--ease-out), border-color var(--dur-fast) ease;
    }

    .item.selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .thumb {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: var(--bg-sunken);
      color: var(--text-tertiary);
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .info {
      display: grid;
      gap: 0.125rem;
      min-width: 0;
    }

    .name {
      overflow: hidden;
      color: var(--text);
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .star {
      width: 0.8rem;
      height: 0.8rem;
      color: var(--gold);
      vertical-align: -1px;
    }

    .strong {
      font-weight: 600;
    }

    .actions {
      display: grid;
      justify-items: end;
      gap: var(--space-2);
    }

    .compare {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .compare input {
      width: 1rem;
      height: 1rem;
      accent-color: var(--accent);
    }

    .compare.disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .center {
      justify-content: center;
      margin-top: var(--space-3);
    }

    .compare-bar {
      position: fixed;
      left: 50%;
      bottom: calc(5rem + var(--safe-bottom));
      z-index: 45;
      display: flex;
      align-items: center;
      gap: var(--space-4);
      width: min(30rem, calc(100vw - 1.5rem));
      padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
      border-radius: var(--radius-full);
      justify-content: space-between;
      background: var(--material-thick);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
      transform: translateX(-50%);
      animation: rise var(--dur-base) var(--ease-out) both;
    }

    @keyframes rise {
      from {
        opacity: 0;
        transform: translate(-50%, 12px);
      }
    }

    .compare-table th[scope='row'] {
      position: static;
      background: transparent;
      white-space: nowrap;
    }

    .compare-table td {
      vertical-align: top;
      min-width: 10rem;
    }

    .compare-table thead a {
      color: var(--text);
      text-transform: none;
      letter-spacing: 0;
      font-size: 0.9375rem;
    }

    .best {
      color: var(--success);
      font-weight: 600;
    }

    .offers {
      display: grid;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.875rem;
    }

    .offers li {
      display: grid;
    }

    @media (min-width: 48rem) {
      .compare-bar {
        bottom: var(--space-5);
      }
    }

    @keyframes fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .compare-bar {
        animation: fade var(--dur-fast) ease both;
      }
    }
  `,
})
export class Saved {
  protected readonly favorites = inject(FavoritesService);
  protected readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  protected readonly maxCompare = MAX_COMPARE;
  protected readonly selected = signal<number[]>([]);
  protected readonly compareOpen = signal(false);
  protected readonly plural = plural;
  protected readonly price = formatPrice;
  protected readonly range = formatPriceRange;
  protected readonly link = vendorLink;

  /** Ponuđač sa više kategorija pojavljuje se u svakoj od njih (poređenje ima smisla unutar kategorije). */
  protected readonly groups = computed(() => {
    const map = new Map<string, SavedVendor[]>();
    for (const item of this.favorites.items()) {
      const categories = item.categories.length ? item.categories : ['Ostalo'];
      for (const c of categories) map.set(c, [...(map.get(c) ?? []), item]);
    }
    return [...map].map(([category, items]) => ({
      category,
      items,
      cheapest: Math.min(...items.map((i) => this.cheapestIn(i, category) ?? Infinity)),
    }));
  });

  /** Najmanji iznos da se pokrije svaka kategorija jednim od sačuvanih ponuđača. */
  protected readonly minimumTotal = computed(() =>
    this.groups().reduce((sum, g) => sum + (isFinite(g.cheapest) ? g.cheapest : 0), 0),
  );

  protected readonly compared = computed(() =>
    this.selected()
      .map((id) => this.favorites.items().find((i) => i.id === id))
      .filter((i): i is SavedVendor => !!i),
  );

  protected readonly bestPrice = computed(() => {
    const prices = this.compared().map((i) => i.priceFrom).filter((p): p is number => p !== null);
    return prices.length ? Math.min(...prices) : null;
  });

  protected readonly bestRating = computed(() => {
    const ratings = this.compared().map((i) => i.averageRating).filter((r): r is number => r !== null);
    return ratings.length ? Math.max(...ratings) : null;
  });

  protected isSelected(id: number): boolean {
    return this.selected().includes(id);
  }

  protected toggleCompare(id: number): void {
    this.selected.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_COMPARE ? [...list, id] : list,
    );
  }

  protected categoryPrice(item: SavedVendor, category: string): string {
    const offers = item.offerings.filter((o) => o.category === category);
    if (!offers.length) return formatPriceRange(item.priceFrom, item.priceTo);
    return formatPriceRange(Math.min(...offers.map((o) => o.priceFrom)), Math.max(...offers.map((o) => o.priceTo)));
  }

  protected remove(item: SavedVendor): void {
    const index = this.favorites.items().findIndex((i) => i.id === item.id);
    this.favorites.remove(item.id);
    this.selected.update((list) => list.filter((x) => x !== item.id));
    this.toasts.info(`${item.name} je uklonjen.`, { label: 'Poništi', run: () => this.favorites.restore(item, index) });
  }

  private cheapestIn(item: SavedVendor, category: string): number | null {
    const offers = item.offerings.filter((o) => o.category === category);
    if (offers.length) return Math.min(...offers.map((o) => o.priceFrom));
    return item.priceFrom;
  }
}
