import { HttpContext } from '@angular/common/http';
import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { DomSanitizer, Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { BookingApi, ReviewApi, SKIP_ERROR_TOAST, VendorApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { BRAND } from '../../core/brand';
import { DAYS, formatDate, formatPriceRange, formatTime, plural, toTimeOnly, todayIso } from '../../core/format';
import { vendorIdFromParam, vendorLink } from '../../core/links';
import { Offering, Review, Vendor } from '../../core/models';
import { Gallery } from '../../shared/ui/gallery';
import { LookupStore } from '../../core/lookups';
import { PlanItem, PlanStore } from '../../core/plan-store';
import { DateField, TimeField } from '../../shared/ui/date-time-fields';
import { Icon } from '../../shared/ui/icon';
import { Rating } from '../../shared/ui/rating';
import { SaveButton } from '../../shared/ui/save-button';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'unknown';

/**
 * Stranica ponuđača (FR-7): sve iz sekcije 4.3 zahtjeva, rezervacija (ako je uključena) i recenzije.
 * Link je /ponudjaci/{id}-{slug}; stari /ponudjaci/{id} i dalje radi i tiho se dopunjava slugom.
 */
@Component({
  selector: 'app-vendor-detail',
  imports: [RouterLink, ReactiveFormsModule, Gallery, Icon, Rating, SaveButton, Sheet, DateField, TimeField, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <div class="top-actions">
        <button type="button" class="back btn btn-plain" (click)="back()"><app-icon name="chevron-left" /> Nazad</button>
        @if (vendor(); as v) {
          <div class="row">
            <button type="button" class="icon-btn" (click)="share(v)" aria-label="Podijeli"><app-icon name="share" /></button>
            <app-save-button [vendor]="v" [withLabel]="true" />
            @if (canPlan()) {
              <button type="button" class="btn plan-btn" [class.in]="inPlan()" [class.pop]="planPop()" (animationend)="planPop.set(false)"
                (click)="togglePlan(v)" [attr.aria-pressed]="inPlan()">
                <app-icon [name]="inPlan() ? 'check' : 'rings'" />
                <span>{{ inPlan() ? 'U planu' : 'Dodaj u plan' }}</span>
              </button>
            }
          </div>
        }
      </div>

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
                  <a class="row rating-link" href="#recenzije" (click)="scrollTo($event, 'recenzije')">
                    <app-rating [value]="rating" /> {{ rating.toFixed(1) }} · {{ v.reviewCount }} {{ plural(v.reviewCount, 'recenzija', 'recenzije', 'recenzija') }}
                  </a>
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
              @for (group of offeringGroups(); track group.category) {
                <div class="stack-sm">
                  @if (offeringGroups().length > 1) { <p class="t-eyebrow">{{ group.category }}</p> }
                  <div class="list-group">
                    @for (offer of group.offers; track offer.id) {
                      <div class="list-row offer">
                        <div class="grow">
                          <h3 class="t-body strong">{{ offer.title }}</h3>
                          @if (offer.description) { <p class="t-footnote muted">{{ offer.description }}</p> }
                        </div>
                        <span class="price">{{ priceRange(offer.priceFrom, offer.priceTo) }}</span>
                      </div>
                    }
                  </div>
                </div>
              } @empty {
                <div class="list-group"><div class="list-row muted">Ponuđač još nije dodao usluge.</div></div>
              }
              <p class="t-caption subtle">Cijene su okvirne (od–do) i zavise od dogovora sa ponuđačem.</p>
            </section>

            <section class="section" id="recenzije">
              <div class="section-head">
                <h2 class="t-title-3">Recenzije</h2>
                @if (canReview()) {
                  <button type="button" class="btn btn-tinted btn-sm" (click)="openReview()">
                    {{ myReview() ? 'Uredi recenziju' : 'Ostavi recenziju' }}
                  </button>
                } @else if (!auth.isLoggedIn()) {
                  <a class="btn btn-plain btn-sm" routerLink="/prijava" [queryParams]="{ povratak: here() }">
                    Prijavite se za recenziju
                  </a>
                }
              </div>
              @if (myReview(); as mine) {
                @if (mine.status !== 'Approved') {
                  <p class="alert alert-info">
                    Vaša recenzija {{ mine.status === 'Pending' ? 'čeka odobrenje administratora' : 'nije odobrena' }}.
                  </p>
                }
              }
              @if (breakdown(); as b) {
                <div class="breakdown card">
                  <div class="score">
                    <span class="big">{{ b.average.toFixed(1) }}</span>
                    <app-rating [value]="b.average" />
                    <span class="t-footnote muted">{{ b.count }} {{ plural(b.count, 'recenzija', 'recenzije', 'recenzija') }}</span>
                  </div>
                  <div class="bars">
                    @for (row of b.rows; track row.stars) {
                      <div class="bar-row">
                        <span class="t-footnote">{{ row.stars }}</span>
                        <span class="bar" aria-hidden="true"><span [style.width.%]="row.percent"></span></span>
                        <span class="t-footnote muted count">{{ row.count }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
              <div class="reviews">
                @for (review of publishedReviews(); track review.id) {
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
              } @else if (v.bookingEnabled && !auth.isLoggedIn()) {
                <a class="btn btn-primary btn-lg btn-block" routerLink="/prijava" [queryParams]="{ povratak: here() }">
                  <app-icon name="calendar" /> Prijavite se za rezervaciju
                </a>
                <p class="t-caption subtle center">Profil je besplatan i pravi se za manje od minute.</p>
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

            <div class="panel card location">
              <h2 class="t-title-3">Lokacija</h2>
              @if (mapEmbed(); as embed) {
                <div class="map">
                  <iframe [src]="embed" title="Mapa lokacije" loading="lazy" referrerpolicy="no-referrer"></iframe>
                </div>
              }
              <p class="muted">{{ v.address }}<br />{{ v.cityName }}</p>
              @if (mapUrl(); as url) {
                <a class="btn btn-tinted btn-sm" [href]="url" target="_blank" rel="noopener"><app-icon name="map-pin" /> Upute do lokacije</a>
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

        <!-- Telefon: glavna akcija je uvijek pri ruci, iznad donje trake. -->
        <div class="mobile-cta material">
          <div>
            <p class="t-caption muted">Okvirna cijena</p>
            <strong>{{ priceRange(v.priceFrom, v.priceTo) }}</strong>
          </div>
          @if (v.bookingEnabled && auth.hasRole('Couple')) {
            <button type="button" class="btn btn-primary" (click)="bookingOpen.set(true)">Rezerviši</button>
          } @else if (v.bookingEnabled && !auth.isLoggedIn()) {
            <a class="btn btn-primary" routerLink="/prijava" [queryParams]="{ povratak: here() }">Rezerviši</a>
          } @else if (v.phoneNumber) {
            <a class="btn btn-primary" [href]="'tel:' + v.phoneNumber"><app-icon name="phone" /> Pozovi</a>
          }
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
              <app-date-field inputId="b-date" [min]="today" formControlName="eventDate" describedBy="b-date-status" />
              <span id="b-date-status" class="availability" [class]="availability()" aria-live="polite">
                @switch (availability()) {
                  @case ('checking') { <span class="spinner"></span> Provjeravamo datum… }
                  @case ('free') { <app-icon name="check" /> Datum je slobodan }
                  @case ('taken') { <app-icon name="alert" /> Datum je već zauzet. Probajte drugi ili pošaljite upit. }
                  @case ('unknown') { Dostupnost potvrđuje salon. }
                }
              </span>
            </div>
            <div class="field">
              <label for="b-time">Vrijeme <span class="subtle">(opciono)</span></label>
              <app-time-field inputId="b-time" formControlName="startTime" />
            </div>
          </div>
          <div class="field">
            <label for="b-note">Napomena</label>
            <textarea id="b-note" class="textarea" formControlName="note" maxlength="1000"
              placeholder="Npr. broj osoba, posebne želje..."></textarea>
<app-field-error [control]="bookingForm.controls.note" />
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
<app-field-error [control]="reviewForm.controls.comment" />
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
    .top-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .back {
      margin-left: calc(-1 * var(--space-2));
    }

    .plan-btn {
      --btn-bg: var(--accent);
      --btn-fg: var(--text-on-accent);
      min-height: 2.5rem;
      padding: 0 0.875rem;
    }

    .plan-btn:hover {
      background: var(--accent-hover);
    }

    .plan-btn.in {
      --btn-bg: var(--sage-soft);
      --btn-fg: var(--success);
    }

    .plan-btn.in:hover {
      background: var(--sage-soft);
    }

    .plan-btn.pop app-icon {
      animation: plan-pop 380ms var(--ease-out);
    }

    @keyframes plan-pop {
      40% {
        transform: scale(1.3) rotate(-8deg);
      }
    }

    @media (max-width: 29.99rem) {
      .plan-btn span {
        display: none;
      }

      .plan-btn {
        width: 2.5rem;
        padding: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .plan-btn.pop app-icon {
        animation: none;
      }
    }

    .rating-link {
      color: inherit;
    }

    .rating-link:hover {
      color: var(--text);
    }

    .breakdown {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: var(--space-5);
      padding: var(--space-4) var(--space-5);
    }

    .score {
      display: grid;
      justify-items: center;
      gap: var(--space-1);
    }

    .big {
      font-size: 2.5rem;
      line-height: 1;
      letter-spacing: -0.02em;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .bars {
      display: grid;
      gap: 0.3rem;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 0.75rem 1fr 1.5rem;
      align-items: center;
      gap: var(--space-2);
    }

    .bar {
      height: 0.375rem;
      border-radius: var(--radius-full);
      background: var(--fill-strong);
      overflow: hidden;
    }

    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--gold);
    }

    .count {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .map {
      overflow: hidden;
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-md);
      background: var(--bg-sunken);
    }

    .map iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }

    .availability {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: 1.25rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }

    .availability app-icon,
    .availability .spinner {
      width: 0.95rem;
      height: 0.95rem;
    }

    .availability.free {
      color: var(--success);
    }

    .availability.taken {
      color: var(--danger);
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

    .mobile-cta {
      position: fixed;
      left: var(--space-3);
      right: var(--space-3);
      bottom: calc(4.75rem + var(--safe-bottom));
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
      border-radius: var(--radius-full);
      background: var(--material-thick);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
    }

    @media (min-width: 48rem) {
      .mobile-cta {
        bottom: var(--space-4);
      }
    }

    // Prostor ispod sadržaja da plutajuća traka ne prekrije zadnju recenziju.
    @media (max-width: 59.99rem) {
      .layout {
        padding-bottom: 4.5rem;
      }
    }

    @media (min-width: 60rem) {
      .mobile-cta {
        display: none;
      }

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
export class VendorDetail {
  /** Parametar rute: "17-foto-trenutak" ili "17". */
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly vendorApi = inject(VendorApi);
  private readonly reviewApi = inject(ReviewApi);
  private readonly bookingApi = inject(BookingApi);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly destroyRef = inject(DestroyRef);
  private readonly plan = inject(PlanStore);
  private readonly lookups = inject(LookupStore);

  protected readonly vendor = signal<Vendor | null>(null);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly bookingOpen = signal(false);
  protected readonly reviewOpen = signal(false);
  protected readonly availability = signal<Availability>('idle');
  protected readonly planPop = signal(false);

  private readonly bookingSheet = viewChild<Sheet>('bookingSheet');
  private readonly reviewSheet = viewChild<Sheet>('reviewSheet');
  private readonly dateCheck$ = new Subject<string>();
  private request?: Subscription;

  protected readonly today = todayIso();
  protected readonly priceRange = formatPriceRange;
  protected readonly plural = plural;
  protected readonly date = (value: string) => formatDate(value);

  protected readonly bookingForm = this.fb.group({
    offeringId: this.fb.control<number | null>(null),
    eventDate: this.fb.nonNullable.control('', [Validators.required, V.notPast]),
    startTime: this.fb.control<string | null>(null),
    note: this.fb.control<string | null>(null, V.text(1000)),
  });

  protected readonly reviewForm = this.fb.group({
    rating: this.fb.nonNullable.control(0),
    comment: this.fb.control<string | null>(null, V.text(2000)),
  });

  protected readonly activeOfferings = computed<Offering[]>(() => this.vendor()?.offerings.filter((o) => o.isActive) ?? []);

  /** Usluge grupisane po kategoriji (FR-10: poseban cjenovnik po kategoriji). */
  protected readonly offeringGroups = computed(() => {
    const groups = new Map<string, Offering[]>();
    for (const offer of this.activeOfferings()) {
      const key = offer.serviceCategoryName ?? 'Ostalo';
      groups.set(key, [...(groups.get(key) ?? []), offer]);
    }
    return [...groups].map(([category, offers]) => ({ category, offers }));
  });

  /** Javne recenzije; vlastita (ako čeka odobrenje) se ne miješa sa objavljenim. */
  protected readonly publishedReviews = computed(() => this.reviews().filter((r) => r.status === 'Approved'));

  protected readonly breakdown = computed(() => {
    const list = this.publishedReviews();
    if (list.length < 2) return null;
    const average = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
    const rows = [5, 4, 3, 2, 1].map((stars) => {
      const count = list.filter((r) => r.rating === stars).length;
      return { stars, count, percent: (count / list.length) * 100 };
    });
    return { average, count: list.length, rows };
  });

  protected readonly myReview = computed(() => {
    const userId = this.auth.user()?.id;
    return userId ? (this.reviews().find((r) => r.userId === userId) ?? null) : null;
  });

  protected readonly canReview = computed(() => this.auth.hasRole('Couple'));

  /** "Dodaj u plan" je za mladence i goste (salonima i adminu ne treba). */
  protected readonly canPlan = computed(() => {
    const role = this.auth.role();
    return (role === null || role === 'Couple') && this.activeOfferings().length > 0;
  });

  protected readonly inPlan = computed(() => {
    const v = this.vendor();
    return !!v && this.plan.items().some((i) => i.vendorId === v.id);
  });

  protected readonly mapUrl = computed(() => {
    const v = this.vendor();
    if (!v) return null;
    if (v.latitude !== null && v.longitude !== null)
      return `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`;
    if (v.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.address}, ${v.cityName}`)}`;
    return null;
  });

  /** OpenStreetMap ugradnja (bez API ključa i bez kolačića za praćenje). */
  protected readonly mapEmbed = computed(() => {
    const v = this.vendor();
    if (!v || v.latitude === null || v.longitude === null) return null;
    const d = 0.006;
    const bbox = [v.longitude - d, v.latitude - d * 0.7, v.longitude + d, v.latitude + d * 0.7].join(',');
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${v.latitude},${v.longitude}`;
    // URL je sastavljen samo od brojeva iz baze, pa je siguran za iframe.
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
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

  constructor() {
    // Ista komponenta ostaje kad se pređe sa jednog ponuđača na drugog, pa se učitava na promjenu parametra.
    effect(() => {
      const id = vendorIdFromParam(this.id());
      untracked(() => this.load(id));
    });

    // Provjera dostupnosti datuma uživo (FR-20), prije slanja zahtjeva.
    this.dateCheck$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((date) => {
          const v = this.vendor()!;
          this.availability.set('checking');
          const context = new HttpContext().set(SKIP_ERROR_TOAST, true);
          return this.vendorApi.list({ availableOn: date, fts: v.name, pageSize: 50 }, context);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          const id = this.vendor()?.id;
          this.availability.set(result.items.some((x) => x.id === id) ? 'free' : 'taken');
        },
        error: () => this.availability.set('unknown'),
      });

    this.bookingForm.controls.eventDate.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((date) => {
      if (date) this.dateCheck$.next(date);
      else this.availability.set('idle');
    });

    this.destroyRef.onDestroy(() => this.meta.removeTag('name="description"'));
  }

  protected here(): string {
    return this.router.url;
  }

  /** Nazad tamo odakle se došlo (filteri u pretrazi ostaju), a sa direktnog linka na pretragu. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigateByUrl('/istrazi');
  }

  protected scrollTo(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }

  protected async share(v: Vendor): Promise<void> {
    const url = location.origin + this.router.serializeUrl(this.router.createUrlTree(vendorLink(v)));
    try {
      if (navigator.share) {
        await navigator.share({ title: v.name, text: `${v.name} · ${BRAND.name}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.toasts.success('Link je kopiran.');
    } catch {
      /* korisnik je odustao od dijeljenja */
    }
  }

  /** Dodaje ponuđača u "Moj plan" za svaku kategoriju koju nudi; ponovni klik ga uklanja (uz Poništi). */
  protected togglePlan(v: Vendor): void {
    if (this.inPlan()) {
      const removed = this.plan.items().filter((i) => i.vendorId === v.id);
      removed.forEach((i) => this.plan.remove(i.categoryId));
      this.toasts.info(`${v.name} je uklonjen iz plana.`, { label: 'Poništi', run: () => removed.forEach((i) => this.plan.put(i)) });
      return;
    }
    const categories = [...new Set(this.activeOfferings().map((o) => o.serviceCategoryId))].map((id) => {
      const known = this.lookups.categories().find((c) => c.id === id);
      const name = this.activeOfferings().find((o) => o.serviceCategoryId === id)?.serviceCategoryName ?? '';
      return { id, name: known?.name ?? name, slug: known?.slug ?? '' };
    });
    const replaced = categories
      .map((c) => PlanStore.itemFrom(v, c))
      .filter((i): i is PlanItem => i !== null)
      .map((item) => this.plan.put(item))
      .filter((i): i is PlanItem => !!i);
    this.planPop.set(true);
    if (replaced.length) {
      this.toasts.info(`Zamijenjen ${replaced.map((i) => i.vendorName).join(', ')} u planu.`, {
        label: 'Poništi',
        run: () => {
          categories.forEach((c) => this.plan.remove(c.id));
          replaced.forEach((i) => this.plan.put(i));
        },
      });
    } else {
      this.toasts.success(`${v.name} je dodan u vaš plan.`);
    }
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
          this.availability.set('idle');
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

  private load(id: number | null): void {
    this.request?.unsubscribe();
    this.vendor.set(null);
    this.reviews.set([]);
    if (id === null) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.vendorApi.get(id).subscribe({
      next: (v) => {
        this.vendor.set(v);
        this.loading.set(false);
        this.applySeo(v);
      },
      error: () => this.loading.set(false),
    });
    this.loadReviews(id);
  }

  /** Naslov, opis i čitljiv URL za dijeljenje i pretraživače. */
  private applySeo(v: Vendor): void {
    this.titleService.setTitle(`${v.name} · ${v.cityName} · ${BRAND.name}`);
    const description = (v.description ?? `${v.categories.join(', ')} u gradu ${v.cityName}.`).slice(0, 160);
    this.meta.updateTag({ name: 'description', content: description });
    const canonical = this.router.serializeUrl(this.router.createUrlTree(vendorLink(v)));
    if (!this.router.url.startsWith(canonical)) this.location.replaceState(canonical);
  }

  private loadReviews(vendorId: number): void {
    this.reviewApi.list({ vendorId, pageSize: 50 }).subscribe((r) => this.reviews.set(r.items));
  }
}
