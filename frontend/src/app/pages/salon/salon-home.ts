import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { BookingApi, VendorApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { BOOKING_STATUS, formatTime, plural, todayIso, formatRating } from '../../core/format';
import { vendorLink } from '../../core/links';
import { Booking, Vendor } from '../../core/models';
import { Icon } from '../../shared/ui/icon';

// Ručno, jer neki preglednici nemaju bosanske nazive mjeseci za skraćeni oblik.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

interface CheckItem {
  label: string;
  hint: string;
  done: boolean;
  tab: string;
}

/**
 * Pregled za vlasnika salona (FR-12): šta čeka odgovor, šta dolazi i šta još fali na stranici.
 * Kontrolna lista vodi tačno na mjesto gdje se podatak dopunjava, jer potpuna stranica dobija više upita.
 */
@Component({
  selector: 'app-salon-home',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      @if (loading()) {
        <div class="skeleton head-skeleton"></div>
        <div class="stats">
          @for (i of [1, 2, 3, 4]; track i) { <div class="skeleton stat-skeleton"></div> }
        </div>
      } @else if (!vendors().length) {
        <div class="empty-state">
          <app-icon name="store" />
          <h3 class="t-title-3">Nalog još nije povezan sa salonom</h3>
          <p>Administrator treba da vaš nalog dodijeli salonu. Javite nam se na info&#64;svadbeno.ba.</p>
        </div>
      } @else if (current(); as v) {
        <header class="page-header">
          <div>
            <p class="t-eyebrow">Dobro došli, {{ auth.user()?.firstName }}</p>
            <h1 class="t-title-1">{{ v.name }}</h1>
          </div>
          <div class="row-wrap">
            <a class="btn" [routerLink]="link(v)"><app-icon name="globe" /> Javna stranica</a>
            <a class="btn btn-primary" [routerLink]="['/salon', v.id]"><app-icon name="edit" /> Uredi</a>
          </div>
        </header>

        @if (vendors().length > 1) {
          <div class="segmented switcher" role="tablist" aria-label="Saloni">
            @for (x of vendors(); track x.id) {
              <button type="button" role="tab" [class.is-active]="x.id === v.id" [attr.aria-selected]="x.id === v.id"
                (click)="selectedId.set(x.id)">{{ x.name }}</button>
            }
          </div>
        }

        <div class="stats">
          <a class="stat card" routerLink="/salon/rezervacije" [class.attention]="pending().length">
            <span class="stat-icon"><app-icon name="inbox" /></span>
            <span class="value">{{ pending().length }}</span>
            <span class="t-footnote muted">{{ plural(pending().length, 'zahtjev čeka', 'zahtjeva čekaju', 'zahtjeva čeka') }} odgovor</span>
          </a>
          <div class="stat card">
            <span class="stat-icon"><app-icon name="calendar" /></span>
            <span class="value">{{ upcoming().length }}</span>
            <span class="t-footnote muted">{{ plural(upcoming().length, 'potvrđen termin', 'potvrđena termina', 'potvrđenih termina') }}</span>
          </div>
          <div class="stat card">
            <span class="stat-icon"><app-icon name="star" /></span>
            <span class="value">{{ v.averageRating ? rate(v.averageRating) : '—' }}</span>
            <span class="t-footnote muted">{{ v.reviewCount }} {{ plural(v.reviewCount, 'recenzija', 'recenzije', 'recenzija') }}</span>
          </div>
          <div class="stat card">
            <span class="stat-icon"><app-icon name="check-circle" /></span>
            <span class="value">{{ completeness() }}%</span>
            <span class="t-footnote muted">kompletnost stranice</span>
          </div>
        </div>

        @if (!v.bookingEnabled) {
          <p class="alert alert-info">
            Online rezervacije su isključene. Mladenci vas kontaktiraju telefonom ili e-mailom.
            <a [routerLink]="['/salon', v.id]" [queryParams]="{ kartica: 'stranica' }">Uključite rezervacije</a>
          </p>
        }

        <div class="columns">
          <section class="card card-pad stack">
            <div class="section-head">
              <h2 class="t-title-3">Upotpunite stranicu</h2>
              <span class="t-footnote muted">{{ doneCount() }} / {{ checklist().length }}</span>
            </div>
            <div class="meter" aria-hidden="true"><span [style.transform]="'scaleX(' + completeness() / 100 + ')'"></span></div>
            <ul class="checklist">
              @for (item of checklist(); track item.label) {
                <li [class.done]="item.done">
                  <app-icon [name]="item.done ? 'check-circle' : 'circle'" class="state" />
                  <div class="grow">
                    <strong>{{ item.label }}</strong>
                    @if (!item.done) { <p class="t-footnote muted">{{ item.hint }}</p> }
                  </div>
                  @if (!item.done) {
                    <a class="btn btn-tinted btn-sm" [routerLink]="['/salon', v.id]" [queryParams]="{ kartica: item.tab }">Dodaj</a>
                  }
                </li>
              }
            </ul>
          </section>

          <section class="card card-pad stack">
            <div class="section-head">
              <h2 class="t-title-3">Sljedeće</h2>
              <a class="btn btn-plain btn-sm" routerLink="/salon/rezervacije">Sve rezervacije <app-icon name="chevron-right" /></a>
            </div>
            @for (b of agenda(); track b.id) {
              <a class="agenda-row" routerLink="/salon/rezervacije">
                <span class="date-tile">
                  <span class="day">{{ day(b.eventDate) }}</span>
                  <span class="month">{{ month(b.eventDate) }}</span>
                </span>
                <span class="grow">
                  <strong>{{ b.userFullName }}</strong>
                  <span class="t-footnote muted">
                    {{ b.offeringTitle || 'Termin' }}@if (b.startTime) { · {{ time(b.startTime) }} }
                  </span>
                </span>
                <span class="badge" [class]="'badge ' + status[b.status].badge">{{ status[b.status].label }}</span>
              </a>
            } @empty {
              <div class="empty-mini">
                <app-icon name="calendar" />
                <p class="muted">Nema zahtjeva ni potvrđenih termina u narednom periodu.</p>
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .head-skeleton {
      height: 4.5rem;
      width: 60%;
      margin-bottom: var(--space-5);
    }

    .stat-skeleton {
      height: 7.5rem;
      border-radius: var(--radius-lg);
    }

    .switcher {
      margin-bottom: var(--space-5);
    }

    .stats {
      display: grid;
      gap: var(--space-3);
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
      margin-bottom: var(--space-5);
    }

    .stat {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-4);
      color: inherit;
    }

    a.stat {
      transition: transform var(--dur-press) ease-out, box-shadow var(--dur-base) var(--ease-out);
    }

    a.stat:hover {
      box-shadow: var(--shadow-md);
    }

    a.stat:active {
      transform: scale(0.98);
    }

    .stat.attention {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .stat-icon {
      color: var(--accent);
      margin-bottom: var(--space-1);
    }

    .value {
      font-size: 1.75rem;
      line-height: 1.1;
      letter-spacing: -0.02em;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .alert {
      margin-bottom: var(--space-5);
    }

    .alert a {
      font-weight: 600;
      text-decoration: underline;
    }

    .columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
    }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .meter {
      height: 0.375rem;
      border-radius: var(--radius-full);
      background: var(--fill-strong);
      overflow: hidden;
    }

    .meter span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--success);
      transform-origin: left;
      transition: transform 500ms var(--ease-out);
    }

    .checklist {
      display: grid;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .checklist li {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
    }

    .state {
      color: var(--text-tertiary);
    }

    .done .state {
      color: var(--success);
    }

    .done strong {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .grow {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    .agenda-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2);
      margin-inline: calc(-1 * var(--space-2));
      border-radius: var(--radius-md);
      color: inherit;
      transition: background-color var(--dur-fast) ease;
    }

    .agenda-row:hover {
      background: var(--fill);
    }

    .date-tile {
      display: grid;
      place-items: center;
      flex: none;
      width: 3rem;
      height: 3rem;
      border-radius: var(--radius-md);
      background: var(--accent-soft);
      color: var(--accent);
      line-height: 1;
    }

    .day {
      font-size: 1.125rem;
      font-weight: 700;
    }

    .month {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .empty-mini {
      display: grid;
      justify-items: center;
      gap: var(--space-2);
      padding: var(--space-5) 0;
      text-align: center;
      color: var(--text-tertiary);
    }

    @media (min-width: 60rem) {
      .columns {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        align-items: start;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .meter span {
        transition: none;
      }
    }
  `,
})
export class SalonHome implements OnInit {
  protected readonly rate = formatRating;
  protected readonly auth = inject(AuthService);
  private readonly vendorApi = inject(VendorApi);
  private readonly bookingApi = inject(BookingApi);

  protected readonly vendors = signal<Vendor[]>([]);
  protected readonly bookings = signal<Booking[]>([]);
  protected readonly loading = signal(true);
  protected readonly selectedId = signal<number | null>(null);

  protected readonly status = BOOKING_STATUS;
  protected readonly plural = plural;
  protected readonly link = vendorLink;
  protected readonly time = formatTime;
  private readonly today = todayIso();

  protected readonly current = computed(
    () => this.vendors().find((v) => v.id === this.selectedId()) ?? this.vendors()[0] ?? null,
  );

  private readonly mine = computed(() => this.bookings().filter((b) => b.vendorId === this.current()?.id));
  protected readonly pending = computed(() => this.mine().filter((b) => b.status === 'Pending'));
  protected readonly upcoming = computed(() =>
    this.mine().filter((b) => b.status === 'Confirmed' && b.eventDate >= this.today),
  );

  /** Prvo ono što čeka odgovor, pa potvrđeni termini po datumu. */
  protected readonly agenda = computed(() =>
    [...this.pending(), ...this.upcoming()]
      .sort((a, b) => Number(b.status === 'Pending') - Number(a.status === 'Pending') || a.eventDate.localeCompare(b.eventDate))
      .slice(0, 6),
  );

  protected readonly checklist = computed<CheckItem[]>(() => {
    const v = this.current();
    if (!v) return [];
    return [
      {
        label: 'Opis salona',
        hint: 'Dvije-tri rečenice o tome po čemu ste posebni.',
        done: (v.description?.trim().length ?? 0) >= 80,
        tab: 'stranica',
      },
      { label: 'Najmanje 3 fotografije', hint: 'Stranice sa više fotografija dobijaju više upita.', done: v.images.length >= 3, tab: 'galerija' },
      { label: 'Naslovna fotografija', hint: 'Prikazuje se u rezultatima pretrage.', done: v.images.some((i) => i.isCover), tab: 'galerija' },
      { label: 'Usluge sa cijenama', hint: 'Cijena od–do pomaže mladencima da vas uvrste u budžet.', done: v.offerings.some((o) => o.isActive), tab: 'usluge' },
      { label: 'Radno vrijeme', hint: 'Da mladenci znaju kada vas mogu posjetiti.', done: v.workingHours.length > 0, tab: 'radno-vrijeme' },
      { label: 'Lokacija na mapi', hint: 'Unesite koordinate da se salon prikaže na mapi.', done: v.latitude !== null && v.longitude !== null, tab: 'stranica' },
      { label: 'Kontakt', hint: 'Telefon ili e-mail za direktan upit.', done: !!(v.phoneNumber || v.email), tab: 'stranica' },
      { label: 'Društvene mreže', hint: 'Instagram ili Facebook sa vašim radovima.', done: !!(v.instagramUrl || v.facebookUrl || v.tikTokUrl), tab: 'stranica' },
    ];
  });

  protected readonly doneCount = computed(() => this.checklist().filter((i) => i.done).length);
  protected readonly completeness = computed(() =>
    this.checklist().length ? Math.round((this.doneCount() / this.checklist().length) * 100) : 0,
  );

  ngOnInit(): void {
    forkJoin({
      vendors: this.vendorApi.list({ ownerUserId: this.auth.user()?.id, pageSize: 50 }),
      bookings: this.bookingApi.list({ dateFrom: this.today, pageSize: 200 }),
    }).subscribe({
      next: ({ vendors, bookings }) => {
        this.vendors.set(vendors.items);
        this.bookings.set(bookings.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected day(date: string): string {
    return String(Number(date.slice(8, 10)));
  }

  protected month(date: string): string {
    return MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
  }
}
