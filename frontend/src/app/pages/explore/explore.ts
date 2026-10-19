import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { VendorApi } from '../../core/api';
import { todayIso } from '../../core/format';
import { LookupStore } from '../../core/lookups';
import { Vendor, VendorSearch } from '../../core/models';
import { Icon, categoryIcon } from '../../shared/ui/icon';
import { Sheet } from '../../shared/ui/sheet';
import { VendorCard } from '../../shared/ui/vendor-card';

interface Filters {
  fts: string;
  categoryId: number | null;
  cityId: number | null;
  priceMin: number | null;
  priceMax: number | null;
  minRating: number | null;
  availableOn: string | null;
  bookingEnabled: boolean;
}

const EMPTY: Filters = {
  fts: '',
  categoryId: null,
  cityId: null,
  priceMin: null,
  priceMax: null,
  minRating: null,
  availableOn: null,
  bookingEnabled: false,
};

const PAGE_SIZE = 12;

/** Samostalna pretraga ponude (FR-5, FR-6). Filteri se čuvaju u URL-u, pa "nazad" vraća isti prikaz. */
@Component({
  selector: 'app-explore',
  imports: [FormsModule, Icon, Sheet, VendorCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Istražite ponudu</h1>
          <p class="muted">Saloni, sale, fotografi i sve ostalo za vaše vjenčanje.</p>
        </div>
      </header>

      <div class="toolbar">
        <label class="search">
          <app-icon name="search" />
          <span class="sr-only">Pretraga</span>
          <input type="search" placeholder="Pretražite po nazivu ili opisu" [ngModel]="filters().fts"
            (ngModelChange)="onSearch($event)" />
        </label>
        <button type="button" class="btn filter-btn" (click)="openFilters()">
          <app-icon name="filter" /> Filteri
          @if (activeCount()) { <span class="count">{{ activeCount() }}</span> }
        </button>
      </div>

      <div class="chips" role="tablist" aria-label="Kategorije">
        <button type="button" role="tab" class="chip" [class.is-active]="filters().categoryId === null"
          [attr.aria-selected]="filters().categoryId === null" (click)="patch({ categoryId: null })">Sve</button>
        @for (category of lookups.categories(); track category.id) {
          <button type="button" role="tab" class="chip" [class.is-active]="filters().categoryId === category.id"
            [attr.aria-selected]="filters().categoryId === category.id" (click)="patch({ categoryId: category.id })">
            <app-icon [name]="icon(category.slug)" /> {{ category.name }}
          </button>
        }
      </div>

      @if (activeChips().length) {
        <div class="row-wrap active-filters">
          @for (chip of activeChips(); track chip.key) {
            <button type="button" class="badge badge-accent removable" (click)="patch(chip.clear)">
              {{ chip.label }} <app-icon name="close" />
            </button>
          }
          <button type="button" class="btn btn-plain btn-sm" (click)="reset()">Očisti sve</button>
        </div>
      }

      <p class="t-footnote muted result-count" aria-live="polite">
        @if (!loading() || vendors().length) {
          {{ total() }} {{ total() === 1 ? 'ponuđač' : 'ponuđača' }}
        }
      </p>

      @if (loading() && !vendors().length) {
        <div class="grid-cards">
          @for (i of skeletons; track i) {
            <div class="skeleton-card">
              <div class="skeleton media"></div>
              <div class="skeleton line"></div>
              <div class="skeleton line short"></div>
            </div>
          }
        </div>
      } @else if (!vendors().length) {
        <div class="empty-state">
          <app-icon name="search" />
          <h3 class="t-title-3">Nema rezultata</h3>
          <p>Probajte ukloniti neki filter ili promijeniti pretragu.</p>
          <button type="button" class="btn btn-tinted" (click)="reset()">Očisti filtere</button>
        </div>
      } @else {
        <div class="grid-cards">
          @for (vendor of vendors(); track vendor.id) {
            <app-vendor-card [vendor]="vendor" />
          }
        </div>
        @if (vendors().length < total()) {
          <div class="more">
            <button type="button" class="btn" (click)="loadMore()" [disabled]="loading()">
              @if (loading()) { <span class="spinner"></span> } @else { Prikaži još }
            </button>
          </div>
        }
      }
    </div>

    @if (filtersOpen()) {
      <app-sheet title="Filteri" (closed)="filtersOpen.set(false)">
        <form class="stack" (ngSubmit)="applyDraft()">
          <div class="field">
            <label for="f-city">Grad</label>
            <select id="f-city" class="select" name="cityId" [(ngModel)]="draft.cityId">
              <option [ngValue]="null">Svi gradovi</option>
              @for (city of lookups.cities(); track city.id) {
                <option [ngValue]="city.id">{{ city.name }}</option>
              }
            </select>
          </div>

          <div class="field">
            <span class="label">Cijena (KM)</span>
            <div class="form-grid">
              <input class="input" type="number" min="0" inputmode="numeric" placeholder="Od" name="priceMin"
                [(ngModel)]="draft.priceMin" aria-label="Cijena od" />
              <input class="input" type="number" min="0" inputmode="numeric" placeholder="Do" name="priceMax"
                [(ngModel)]="draft.priceMax" aria-label="Cijena do" />
            </div>
          </div>

          <div class="field">
            <span class="label">Ocjena</span>
            <div class="segmented" role="radiogroup" aria-label="Minimalna ocjena">
              @for (option of ratingOptions; track option.label) {
                <button type="button" role="radio" [attr.aria-checked]="draft.minRating === option.value"
                  [class.is-active]="draft.minRating === option.value" (click)="draft.minRating = option.value">
                  {{ option.label }}
                </button>
              }
            </div>
          </div>

          <div class="field">
            <label for="f-date">Slobodan datum</label>
            <input id="f-date" class="input" type="date" name="availableOn" [min]="today" [(ngModel)]="draft.availableOn" />
            <span class="hint">Saloni bez online rezervacija se uvijek prikazuju; dostupnost provjerite kod njih.</span>
          </div>

          <label class="list-group list-row switch-row">
            <span>Samo sa online rezervacijom</span>
            <input type="checkbox" class="switch" name="bookingEnabled" [(ngModel)]="draft.bookingEnabled" />
          </label>

          <div class="form-actions">
            <button type="button" class="btn" (click)="clearDraft()">Očisti</button>
            <button type="submit" class="btn btn-primary">Prikaži rezultate</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .toolbar {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .search {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.875rem;
      padding: 0 var(--space-4);
      border-radius: var(--radius-full);
      background: var(--fill);
      color: var(--text-tertiary);
      transition: background-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease;
    }

    .search:focus-within {
      background: var(--bg-elevated);
      box-shadow: 0 0 0 1px var(--accent), 0 0 0 4px var(--accent-soft);
    }

    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      outline: none;
      font-size: 1rem;
      color: var(--text);
    }

    .filter-btn {
      min-height: 2.875rem;
    }

    .count {
      display: grid;
      place-items: center;
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0 0.3rem;
      border-radius: var(--radius-full);
      background: var(--accent);
      color: var(--text-on-accent);
      font-size: 0.6875rem;
    }

    // Čipovi kategorija: horizontalni skrol sa mekim rubom umjesto tvrde ivice.
    .chips {
      display: flex;
      gap: var(--space-2);
      overflow-x: auto;
      margin-inline: calc(-1 * var(--space-4));
      padding: 2px var(--space-4) var(--space-3);
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(90deg, transparent, #000 var(--space-4), #000 calc(100% - var(--space-5)), transparent);
      mask-image: linear-gradient(90deg, transparent, #000 var(--space-4), #000 calc(100% - var(--space-5)), transparent);
    }

    .chips::-webkit-scrollbar {
      display: none;
    }

    .chip app-icon {
      width: 1rem;
      height: 1rem;
    }

    .active-filters {
      margin-bottom: var(--space-2);
    }

    .removable {
      border: 0;
      cursor: pointer;
      padding: 0.3rem 0.6rem;
    }

    .removable app-icon {
      width: 0.75rem;
      height: 0.75rem;
    }

    .result-count {
      min-height: 1.25rem;
      margin: var(--space-2) 0 var(--space-4);
    }

    .skeleton-card {
      display: grid;
      gap: var(--space-2);
    }

    .skeleton.media {
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-lg);
    }

    .skeleton.line {
      height: 1rem;
      width: 70%;
    }

    .skeleton.line.short {
      width: 40%;
    }

    .more {
      display: flex;
      justify-content: center;
      margin-top: var(--space-6);
    }

    .switch-row {
      justify-content: space-between;
      cursor: pointer;
    }

    @media (min-width: 48rem) {
      .chips {
        margin-inline: 0;
        padding-inline: 0;
        flex-wrap: wrap;
        -webkit-mask-image: none;
        mask-image: none;
      }
    }
  `,
})
export class Explore implements OnInit {
  protected readonly lookups = inject(LookupStore);
  private readonly api = inject(VendorApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly filters = signal<Filters>({ ...EMPTY });
  protected readonly vendors = signal<Vendor[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly filtersOpen = signal(false);
  protected draft: Filters = { ...EMPTY };

  protected readonly today = todayIso();
  protected readonly skeletons = [1, 2, 3, 4, 5, 6];
  protected readonly icon = categoryIcon;
  protected readonly ratingOptions = [
    { label: 'Sve', value: null },
    { label: '3+', value: 3 },
    { label: '4+', value: 4 },
    { label: '4,5+', value: 4.5 },
  ];

  private readonly sheet = viewChild(Sheet);
  private readonly search$ = new Subject<string>();
  private page = 1;
  private request?: Subscription;

  protected readonly activeCount = computed(() => {
    const f = this.filters();
    return [f.cityId, f.priceMin, f.priceMax, f.minRating, f.availableOn, f.bookingEnabled || null].filter(
      (v) => v !== null && v !== undefined,
    ).length;
  });

  protected readonly activeChips = computed(() => {
    const f = this.filters();
    const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
    if (f.cityId !== null) {
      const city = this.lookups.cities().find((c) => c.id === f.cityId);
      chips.push({ key: 'city', label: city?.name ?? 'Grad', clear: { cityId: null } });
    }
    if (f.priceMin !== null || f.priceMax !== null)
      chips.push({
        key: 'price',
        label: `${f.priceMin ?? 0} – ${f.priceMax ?? '∞'} KM`,
        clear: { priceMin: null, priceMax: null },
      });
    if (f.minRating !== null) chips.push({ key: 'rating', label: `Ocjena ${f.minRating}+`, clear: { minRating: null } });
    if (f.availableOn) chips.push({ key: 'date', label: `Slobodno ${f.availableOn}`, clear: { availableOn: null } });
    if (f.bookingEnabled) chips.push({ key: 'booking', label: 'Online rezervacija', clear: { bookingEnabled: false } });
    return chips;
  });

  ngOnInit(): void {
    this.lookups.ensureLoaded();
    this.filters.set(fromQuery(this.route.snapshot.queryParamMap));
    this.search$.pipe(debounceTime(250)).subscribe((fts) => this.patch({ fts }));
    this.load(true);
  }

  protected onSearch(value: string): void {
    this.search$.next(value);
  }

  protected patch(change: Partial<Filters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
    this.syncUrl();
    this.load(true);
  }

  protected reset(): void {
    this.filters.set({ ...EMPTY });
    this.syncUrl();
    this.load(true);
  }

  protected loadMore(): void {
    this.page++;
    this.load(false);
  }

  protected applyDraft(): void {
    const { fts, categoryId } = this.filters();
    this.filters.set({ ...this.draft, fts, categoryId });
    this.syncUrl();
    this.load(true);
    this.sheet()?.close();
  }

  protected clearDraft(): void {
    this.draft = { ...EMPTY, fts: this.filters().fts, categoryId: this.filters().categoryId };
  }

  // Kad se sheet otvori, radi se nad kopijom filtera; promjene se primjenjuju tek na "Prikaži rezultate".
  protected openFilters(): void {
    this.draft = { ...this.filters() };
    this.filtersOpen.set(true);
  }

  private load(reset: boolean): void {
    if (reset) this.page = 1;
    const f = this.filters();
    const search: VendorSearch = {
      page: this.page,
      pageSize: PAGE_SIZE,
      fts: f.fts || null,
      categoryId: f.categoryId,
      cityId: f.cityId,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      minRating: f.minRating,
      availableOn: f.availableOn,
      bookingEnabled: f.bookingEnabled ? true : null,
    };

    // Novi zahtjev prekida stari, da spori odgovor ne prepiše novije rezultate.
    this.request?.unsubscribe();
    this.loading.set(true);
    this.request = this.api.list(search).subscribe({
      next: (result) => {
        this.vendors.update((list) => (reset ? result.items : [...list, ...result.items]));
        this.total.set(result.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private syncUrl(): void {
    const f = this.filters();
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: f.fts || null,
        kategorija: f.categoryId,
        grad: f.cityId,
        od: f.priceMin,
        do: f.priceMax,
        ocjena: f.minRating,
        datum: f.availableOn,
        rezervacija: f.bookingEnabled ? 1 : null,
      },
    });
  }
}

function fromQuery(params: import('@angular/router').ParamMap): Filters {
  const num = (key: string) => {
    const value = params.get(key);
    return value === null || value === '' || isNaN(Number(value)) ? null : Number(value);
  };
  return {
    fts: params.get('q') ?? '',
    categoryId: num('kategorija'),
    cityId: num('grad'),
    priceMin: num('od'),
    priceMax: num('do'),
    minRating: num('ocjena'),
    availableOn: params.get('datum'),
    bookingEnabled: params.get('rezervacija') === '1',
  };
}
