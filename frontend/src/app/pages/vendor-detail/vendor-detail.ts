import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BookingApi, ReviewApi, VendorApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { DAYS, formatDate, formatPriceRange, formatTime, toTimeOnly, todayIso } from '../../core/format';
import { Offering, Review, Vendor } from '../../core/models';
import { Gallery } from '../../shared/ui/gallery';
import { Icon } from '../../shared/ui/icon';
import { Rating } from '../../shared/ui/rating';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

/** Stranica ponuđača (FR-7): sve iz sekcije 4.3 zahtjeva, rezervacija (ako je uključena) i recenzije. */
@Component({
  selector: 'app-vendor-detail',
  imports: [RouterLink, ReactiveFormsModule, Gallery, Icon, Rating, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <a class="back btn btn-plain" routerLink="/istrazi"><app-icon name="chevron-left" /> Istraži</a>

      @if (vendor(); as v) {
        <div class="layout enter">
          <div class="main">
            @if (v.images.length) {
              <app-gallery [images]="v.images" />
            }

            <header class="title">
              <div class="row-wrap">
                @if (v.isFeatured) { <span class="badge badge-gold"><app-icon name="crown" /> Istaknuto</span> }
                @for (c of v.categories; track c) { <span class="badge">{{ c }}</span> }
              </div>
              <h1 class="t-title-1">{{ v.name }}</h1>
              <p class="row-wrap muted">
                <span class="row"><app-icon name="map-pin" /> {{ v.cityName }}</span>
                @if (v.averageRating; as rating) {
                  <span class="row"><app-rating [value]="rating" /> {{ rating.toFixed(1) }} ({{ v.reviewCount }})</span>
                } @else {
                  <span>Još nema recenzija</span>
                }
              </p>
            </header>

            @if (v.description) {
              <section class="section">
                <h2 class="t-title-3">O nama</h2>
                <p class="description">{{ v.description }}</p>
              </section>
            }

            <section class="section">
              <h2 class="t-title-3">Usluge i cijene</h2>
              <div class="list-group">
                @for (offer of activeOfferings(); track offer.id) {
                  <div class="list-row offer">
                    <div class="grow">
                      <p class="t-footnote muted">{{ offer.serviceCategoryName }}</p>
                      <h3 class="t-body strong">{{ offer.title }}</h3>
                      @if (offer.description) { <p class="t-footnote muted">{{ offer.description }}</p> }
                    </div>
                    <span class="price">{{ priceRange(offer.priceFrom, offer.priceTo) }}</span>
                  </div>
                } @empty {
                  <div class="list-row muted">Ponuđač još nije dodao usluge.</div>
                }
              </div>
            </section>

            <section class="section">
              <div class="section-head">
                <h2 class="t-title-3">Recenzije</h2>
                @if (canReview()) {
                  <button type="button" class="btn btn-tinted btn-sm" (click)="openReview()">
                    {{ myReview() ? 'Uredi recenziju' : 'Ostavi recenziju' }}
                  </button>
                }
              </div>
              @if (myReview(); as mine) {
                @if (mine.status !== 'Approved') {
                  <p class="alert alert-info">
                    Vaša recenzija {{ mine.status === 'Pending' ? 'čeka odobrenje administratora' : 'nije odobrena' }}.
                  </p>
                }
              }
              <div class="reviews">
                @for (review of reviews(); track review.id) {
                  <article class="review card">
                    <div class="row">
                      <strong>{{ review.userFullName }}</strong>
                      <span class="spacer"></span>
                      <app-rating [value]="review.rating" />
                    </div>
                    @if (review.comment) { <p>{{ review.comment }}</p> }
                    <p class="t-caption subtle">{{ date(review.createdAt) }}</p>
                  </article>
                } @empty {
                  <p class="muted">Budite prvi koji će ostaviti recenziju.</p>
                }
              </div>
            </section>
          </div>

          <aside class="side">
            <div class="panel card">
              <p class="t-footnote muted">Okvirna cijena</p>
              <p class="t-title-2">{{ priceRange(v.priceFrom, v.priceTo) }}</p>

              @if (v.bookingEnabled && auth.hasRole('Couple')) {
                <button type="button" class="btn btn-primary btn-lg btn-block" (click)="bookingOpen.set(true)">
                  <app-icon name="calendar" /> Rezerviši termin
                </button>
                <p class="t-caption subtle center">
                  {{ v.autoConfirmBookings ? 'Termin se potvrđuje odmah.' : 'Salon potvrđuje zahtjev.' }}
                </p>
              } @else if (!v.bookingEnabled) {
                <p class="t-footnote muted">Ovaj salon ne prima rezervacije online. Javite se direktno.</p>
              }

              @if (v.requiresDeposit && v.depositNote) {
                <p class="deposit t-footnote"><app-icon name="info" /> {{ v.depositNote }}</p>
              }

              <div class="contacts">
                @if (v.phoneNumber) {
                  <a class="btn btn-block" [href]="'tel:' + v.phoneNumber"><app-icon name="phone" /> {{ v.phoneNumber }}</a>
                }
                @if (v.email) {
                  <a class="btn btn-block" [href]="'mailto:' + v.email"><app-icon name="mail" /> Pošalji e-mail</a>
                }
              </div>

              <div class="socials">
                @if (v.website) {
                  <a class="icon-btn" [href]="v.website" target="_blank" rel="noopener" aria-label="Web stranica"><app-icon name="globe" /></a>
                }
                @if (v.instagramUrl) {
                  <a class="icon-btn" [href]="v.instagramUrl" target="_blank" rel="noopener" aria-label="Instagram"><app-icon name="instagram" /></a>
                }
                @if (v.facebookUrl) {
                  <a class="icon-btn" [href]="v.facebookUrl" target="_blank" rel="noopener" aria-label="Facebook"><app-icon name="facebook" /></a>
                }
              </div>
            </div>

            <div class="panel card">
              <h2 class="t-title-3">Lokacija</h2>
              <p class="muted">{{ v.address }}<br />{{ v.cityName }}</p>
              @if (mapUrl(); as url) {
                <a class="btn btn-tinted btn-sm" [href]="url" target="_blank" rel="noopener"><app-icon name="map-pin" /> Otvori mapu</a>
              }
            </div>

            @if (hours().length) {
              <div class="panel card">
                <h2 class="t-title-3">Radno vrijeme</h2>
                <dl class="hours">
                  @for (h of hours(); track h.day) {
                    <div [class.today]="h.today">
                      <dt>{{ h.label }}</dt>
                      <dd>{{ h.text }}</dd>
                    </div>
                  }
                </dl>
              </div>
            }
          </aside>
        </div>
      } @else if (loading()) {
        <div class="skeleton hero-skeleton"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line short"></div>
      } @else {
        <div class="empty-state">
          <app-icon name="store" />
          <h3 class="t-title-3">Ponuđač nije pronađen</h3>
          <a class="btn btn-tinted" routerLink="/istrazi">Nazad na pretragu</a>
        </div>
      }
    </div>

    @if (bookingOpen() && vendor(); as v) {
      <app-sheet #bookingSheet title="Rezervacija termina" (closed)="bookingOpen.set(false)">
        <form class="stack" [formGroup]="bookingForm" (ngSubmit)="book()">
          <p class="muted">{{ v.name }}</p>
          <div class="field">
            <label for="b-offer">Usluga</label>
            <select id="b-offer" class="select" formControlName="offeringId">
              <option [ngValue]="null">Nije odabrano</option>
              @for (offer of activeOfferings(); track offer.id) {
                <option [ngValue]="offer.id">{{ offer.title }} · {{ priceRange(offer.priceFrom, offer.priceTo) }}</option>
              }
            </select>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="b-date">Datum</label>
              <input id="b-date" class="input" type="date" [min]="today" formControlName="eventDate" />
            </div>
            <div class="field">
              <label for="b-time">Vrijeme <span class="subtle">(opciono)</span></label>
              <input id="b-time" class="input" type="time" formControlName="startTime" />
            </div>
          </div>
          <div class="field">
            <label for="b-note">Napomena</label>
            <textarea id="b-note" class="textarea" formControlName="note" maxlength="1000"
              placeholder="Npr. broj osoba, posebne želje..."></textarea>
          </div>
          @if (v.requiresDeposit && v.depositNote) {
            <p class="alert alert-info">{{ v.depositNote }}</p>
          }
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="bookingForm.invalid || busy()">
              @if (busy()) { <span class="spinner"></span> } @else { Pošalji zahtjev }
            </button>
          </div>
        </form>
      </app-sheet>
    }

    @if (reviewOpen()) {
      <app-sheet #reviewSheet [title]="myReview() ? 'Uredi recenziju' : 'Nova recenzija'" (closed)="reviewOpen.set(false)">
        <form class="stack" [formGroup]="reviewForm" (ngSubmit)="saveReview()">
          <div class="field center-field">
            <span class="label">Vaša ocjena</span>
            <app-rating [editable]="true" [value]="reviewForm.controls.rating.value"
              (valueChange)="reviewForm.controls.rating.setValue($event)" />
          </div>
          <div class="field">
            <label for="r-comment">Komentar</label>
            <textarea id="r-comment" class="textarea" formControlName="comment" maxlength="2000"
              placeholder="Kako ste bili zadovoljni?"></textarea>
          </div>
          <p class="t-footnote muted">Recenzija se objavljuje nakon što je odobri administrator.</p>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="reviewForm.controls.rating.value < 1 || busy()">
              Pošalji
            </button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .back {
      margin: 0 0 var(--space-3) calc(-1 * var(--space-2));
    }

    .layout {
      display: grid;
      gap: var(--space-6);
    }

    .main {
      display: grid;
      gap: var(--space-6);
      min-width: 0;
    }

    .title {
      display: grid;
      gap: var(--space-2);
    }

    .title app-icon {
      width: 1rem;
      height: 1rem;
    }

    .badge app-icon {
      width: 0.8rem;
      height: 0.8rem;
    }

    .row app-rating {
      --star-size: 0.9rem;
    }

    .section {
      display: grid;
      gap: var(--space-3);
    }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .description {
      white-space: pre-line;
      max-width: 42rem;
    }

    .offer {
      align-items: flex-start;
    }

    .grow {
      flex: 1;
      display: grid;
      gap: 0.125rem;
    }

    .strong {
      font-weight: 600;
    }

    .price {
      flex: none;
      font-weight: 600;
    }

    .reviews {
      display: grid;
      gap: var(--space-3);
    }

    .review {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
    }

    .side {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }

    .panel {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }

    .center {
      text-align: center;
    }

    .deposit {
      display: flex;
      gap: var(--space-2);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--gold-soft);
      color: var(--text);
    }

    .deposit app-icon {
      color: var(--gold);
    }

    .contacts {
      display: grid;
      gap: var(--space-2);
    }

    .socials {
      display: flex;
      gap: var(--space-2);
    }

    .hours {
      display: grid;
      gap: 0.375rem;
      margin: 0;
    }

    .hours div {
      display: flex;
      justify-content: space-between;
      font-size: 0.9375rem;
    }

    .hours dt {
      color: var(--text-secondary);
    }

    .hours dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    .hours .today {
      font-weight: 600;
    }

    .hours .today dt {
      color: var(--accent);
    }

    .center-field {
      justify-items: center;
    }

    .hero-skeleton {
      aspect-ratio: 16 / 10;
      border-radius: var(--radius-xl);
      margin-bottom: var(--space-4);
    }

    .skeleton.line {
      height: 1.5rem;
      width: 60%;
      margin-bottom: var(--space-2);
    }

    .skeleton.line.short {
      width: 35%;
    }

    @media (min-width: 60rem) {
      .layout {
        grid-template-columns: minmax(0, 1fr) 22rem;
        align-items: start;
      }

      .side {
        position: sticky;
        top: calc(var(--nav-height) + var(--space-4));
      }
    }
  `,
})
export class VendorDetail implements OnInit {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly vendorApi = inject(VendorApi);
  private readonly reviewApi = inject(ReviewApi);
  private readonly bookingApi = inject(BookingApi);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly vendor = signal<Vendor | null>(null);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly bookingOpen = signal(false);
  protected readonly reviewOpen = signal(false);

  private readonly bookingSheet = viewChild<Sheet>('bookingSheet');
  private readonly reviewSheet = viewChild<Sheet>('reviewSheet');

  protected readonly today = todayIso();
  protected readonly priceRange = formatPriceRange;
  protected readonly date = (value: string) => formatDate(value);

  protected readonly bookingForm = this.fb.group({
    offeringId: this.fb.control<number | null>(null),
    eventDate: this.fb.nonNullable.control('', Validators.required),
    startTime: this.fb.control<string | null>(null),
    note: this.fb.control<string | null>(null),
  });

  protected readonly reviewForm = this.fb.group({
    rating: this.fb.nonNullable.control(0),
    comment: this.fb.control<string | null>(null),
  });

  protected readonly activeOfferings = computed<Offering[]>(() => this.vendor()?.offerings.filter((o) => o.isActive) ?? []);

  protected readonly myReview = computed(() => {
    const userId = this.auth.user()?.id;
    return this.reviews().find((r) => r.userId === userId) ?? null;
  });

  protected readonly canReview = computed(() => this.auth.hasRole('Couple'));

  protected readonly mapUrl = computed(() => {
    const v = this.vendor();
    if (!v) return null;
    if (v.latitude !== null && v.longitude !== null)
      return `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`;
    if (v.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.address}, ${v.cityName}`)}`;
    return null;
  });

  protected readonly hours = computed(() => {
    const v = this.vendor();
    if (!v) return [];
    const todayKey = DAYS[(new Date().getDay() + 6) % 7].key;
    return DAYS.map((d) => {
      const h = v.workingHours.find((w) => w.dayOfWeek === d.key);
      const text = !h ? '—' : h.isClosed ? 'Zatvoreno' : `${formatTime(h.openTime)} – ${formatTime(h.closeTime)}`;
      return { day: d.key, label: d.label, text, today: d.key === todayKey };
    }).filter((h) => h.text !== '—');
  });

  ngOnInit(): void {
    const id = Number(this.id());
    this.vendorApi.get(id).subscribe({
      next: (v) => {
        this.vendor.set(v);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.loadReviews(id);
  }

  protected openReview(): void {
    const mine = this.myReview();
    this.reviewForm.reset({ rating: mine?.rating ?? 0, comment: mine?.comment ?? null });
    this.reviewOpen.set(true);
  }

  protected book(): void {
    const v = this.vendor();
    if (!v || this.bookingForm.invalid) return;
    const value = this.bookingForm.getRawValue();
    this.busy.set(true);
    this.bookingApi
      .create({
        vendorId: v.id,
        offeringId: value.offeringId,
        eventDate: value.eventDate,
        startTime: toTimeOnly(value.startTime),
        note: value.note || null,
      })
      .subscribe({
        next: (booking) => {
          this.busy.set(false);
          this.toasts.success(
            booking.status === 'Confirmed' ? 'Termin je potvrđen.' : 'Zahtjev je poslan. Salon će ga potvrditi.',
          );
          this.bookingForm.reset();
          this.bookingSheet()?.close();
        },
        error: () => this.busy.set(false),
      });
  }

  protected saveReview(): void {
    const v = this.vendor();
    if (!v) return;
    const { rating, comment } = this.reviewForm.getRawValue();
    const mine = this.myReview();
    this.busy.set(true);
    const request$ = mine
      ? this.reviewApi.update(mine.id, { rating, comment: comment || null })
      : this.reviewApi.create({ vendorId: v.id, rating, comment: comment || null });
    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success('Hvala! Recenzija će biti objavljena nakon odobrenja.');
        this.reviewSheet()?.close();
        this.loadReviews(v.id);
      },
      error: () => this.busy.set(false),
    });
  }

  private loadReviews(vendorId: number): void {
    this.reviewApi.list({ vendorId, pageSize: 50 }).subscribe((r) => this.reviews.set(r.items));
  }
}
