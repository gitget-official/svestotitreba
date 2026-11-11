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
import { DomSanitizer, Title } from '@angular/platform-browser';
import { SeoService, vendorJsonLd } from '../../core/seo';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, Subscription, debounceTime, switchMap } from 'rxjs';
import { ReviewApi, SKIP_ERROR_TOAST, VendorApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { BRAND } from '../../core/brand';
import { BOOKING_STATUS, DAYS, formatDate, formatPriceRange, formatTime, plural, toTimeOnly, todayIso, formatRating } from '../../core/format';
import { vendorIdFromParam, vendorLink } from '../../core/links';
import { Booking, Offering, Review, Vendor } from '../../core/models';
import { BookingsStore, isOpen } from '../../core/my-bookings';
import { Reveal } from '../../shared/motion/reveal';
import { Gallery } from '../../shared/ui/gallery';
import { LookupStore } from '../../core/lookups';
import { PlanItem, PlanStore } from '../../core/plan-store';
import { DateField, TimeField } from '../../shared/ui/date-time-fields';
import { Icon } from '../../shared/ui/icon';
import { Rating } from '../../shared/ui/rating';
import { SaveButton } from '../../shared/ui/save-button';
import { Sheet } from '../../shared/ui/sheet';
import { ConfirmService } from '../../shared/ui/confirm';
import { ToastService } from '../../shared/ui/toast';
import { Select, SelectOption } from '../../shared/ui/select';

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'mine' | 'unknown';

/**
 * Stranica ponuđača (FR-7): sve iz sekcije 4.3 zahtjeva, rezervacija (ako je uključena) i recenzije.
 * Link je /ponudjaci/{id}-{slug}; stari /ponudjaci/{id} i dalje radi i tiho se dopunjava slugom.
 */
@Component({
  selector: 'app-vendor-detail',
  imports: [RouterLink, ReactiveFormsModule, Gallery, Icon, Rating, Reveal, SaveButton, Sheet, DateField, TimeField, FieldError, Select, SelectOption],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <div class="top-actions">
        <button type="button" class="back btn btn-plain" (click)="back()" aria-label="Nazad"><app-icon name="chevron-left" /> <span class="hide-xs">Nazad</span></button>
        @if (vendor(); as v) {
          <div class="row">
            <button type="button" class="icon-btn" (click)="share(v)" aria-label="Podijeli"><app-icon name="share" /></button>
            <app-save-button [vendor]="v" [withLabel]="true" />
            @if (canPlan()) {
              <button type="button" class="btn plan-btn" [class.in]="inPlan()" [class.pop]="planPop()" (animationend)="planPop.set(false)"
                (click)="togglePlan(v)" [attr.aria-pressed]="inPlan()"
                [attr.aria-label]="inPlan() ? 'U planu' : 'Dodaj u plan'">
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
              <app-gallery [images]="v.images" [style.view-transition-name]="'vendor-' + v.id" />
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
                    <app-rating [value]="rating" /> {{ rate(rating) }} · {{ v.reviewCount }} {{ plural(v.reviewCount, 'recenzija', 'recenzije', 'recenzija') }}
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

            <section class="section" appReveal>
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

            <section class="section" id="recenzije" appReveal>
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
                <div class="breakdown card" appReveal [revealDelay]="80">
                  <div class="score">
                    <span class="big">{{ rate(b.average) }}</span>
                    <app-rating [value]="b.average" />
                    <span class="t-footnote muted">{{ b.count }} {{ plural(b.count, 'recenzija', 'recenzije', 'recenzija') }}</span>
                  </div>
                  <div class="bars">
                    @for (row of b.rows; track row.stars) {
                      <div class="bar-row">
                        <span class="t-footnote">{{ row.stars }}</span>
                        <span class="bar" aria-hidden="true"><span [style.--p]="row.percent / 100"></span></span>
                        <span class="t-footnote muted count">{{ row.count }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
              <div class="reviews" appReveal="stagger" [revealDelay]="120">
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
                @if (myBooking(); as b) {
                  <!-- Postojeći zahtjev je glavna informacija: mladenci odmah vide gdje su stali. -->
                  <div [class]="'my-booking ' + b.status" role="status">
                    <span class="badge" [class]="status[b.status].badge">{{ status[b.status].label }}</span>
                    <p class="my-booking-title">{{ headline(b) }}</p>
                    <p class="t-footnote muted">
                      {{ longDate(b.eventDate) }}@if (b.startTime) {, {{ time(b.startTime) }}}
                      @if (b.offeringTitle) { · {{ b.offeringTitle }} }
                    </p>
                    @if (b.statusNote) { <p class="t-footnote subtle">„{{ b.statusNote }}“</p> }
                    <div class="row-wrap">
                      <a class="btn btn-tinted btn-sm" routerLink="/moje-rezervacije">Moje rezervacije</a>
                      @if (open(b)) {
                        <button type="button" class="btn btn-plain btn-sm" (click)="cancelBooking(b)">Otkaži zahtjev</button>
                      }
                    </div>
                  </div>
                  <button type="button" class="btn btn-block" (click)="openBooking(v)">
                    <app-icon name="calendar" /> {{ open(b) ? 'Rezerviši drugi termin' : 'Pošalji novi zahtjev' }}
                  </button>
                } @else {
                  <button type="button" class="btn btn-primary btn-lg btn-block" (click)="openBooking(v)">
                    <app-icon name="calendar" /> Rezerviši termin
                  </button>
                  <p class="t-caption subtle center">
                    {{ v.autoConfirmBookings ? 'Termin se potvrđuje odmah.' : 'Salon potvrđuje zahtjev.' }}
                  </p>
                }
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
            @if (myBooking(); as b) {
              <p class="t-caption muted">Vaš zahtjev · {{ shortDate(b.eventDate) }}</p>
              <span class="badge" [class]="status[b.status].badge">{{ status[b.status].label }}</span>
            } @else {
              <p class="t-caption muted">Okvirna cijena</p>
              <strong>{{ priceRange(v.priceFrom, v.priceTo) }}</strong>
            }
          </div>
          @if (v.bookingEnabled && auth.hasRole('Couple')) {
            @if (myBooking()) {
              <a class="btn" routerLink="/moje-rezervacije">Pogledaj</a>
            } @else {
              <button type="button" class="btn btn-primary" (click)="openBooking(v)">Rezerviši</button>
            }
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
      <app-sheet #bookingSheet title="Rezervacija termina" (closed)="bookingOpen.set(false); sent.set(null)">
        @if (sent(); as b) {
          <!-- Potvrda ostaje na ekranu dok je korisnik sam ne zatvori (toast nestane prebrzo). -->
          <div class="sent stack" role="status">
            <span class="sent-icon" [class.ok]="b.status === 'Confirmed'">
              <app-icon [name]="b.status === 'Confirmed' ? 'check' : 'clock'" [strokeWidth]="2.2" />
            </span>
            <h3 class="t-title-2">{{ b.status === 'Confirmed' ? 'Termin je potvrđen' : 'Zahtjev je poslan' }}</h3>
            <p class="muted">
              @if (b.status === 'Confirmed') {
                {{ v.name }} vas očekuje. Termin je rezervisan za vas.
              } @else {
                {{ v.name }} sada pregleda vaš zahtjev. Termin je vaš kad ga salon potvrdi.
              }
            </p>
            <dl class="sent-summary">
              <div><dt>Datum</dt><dd>{{ longDate(b.eventDate) }}</dd></div>
              @if (b.startTime) { <div><dt>Vrijeme</dt><dd>{{ time(b.startTime) }}</dd></div> }
              @if (b.offeringTitle) { <div><dt>Usluga</dt><dd>{{ b.offeringTitle }}</dd></div> }
              <div><dt>Status</dt><dd><span class="badge" [class]="status[b.status].badge">{{ status[b.status].label }}</span></dd></div>
            </dl>
            @if (v.requiresDeposit && v.depositNote) {
              <p class="alert alert-info"><strong>Sljedeći korak:</strong> {{ v.depositNote }}</p>
            }
            @if (addedToPlan(); as note) {
              <p class="t-footnote muted"><app-icon name="rings" class="inline-icon" /> {{ note }}</p>
            }
            <p class="t-footnote muted">Status pratite ovdje, u svom planu i pod Rezervacije.</p>
            <div class="sent-actions">
              <button type="button" class="btn" (click)="bookingSheet.close()">Zatvori</button>
              <a class="btn btn-primary" routerLink="/moje-rezervacije">Moje rezervacije</a>
            </div>
          </div>
        } @else {
        <form class="stack" [formGroup]="bookingForm" (ngSubmit)="book()">
          <p class="muted">{{ v.name }}</p>
          @if (prefilled()) {
            <p class="t-footnote prefilled"><app-icon name="sparkles" class="inline-icon" /> Popunjeno iz vašeg plana. Provjerite i pošaljite.</p>
          }
          <div class="field">
            <label for="b-offer">Usluga</label>
            <app-select inputId="b-offer" formControlName="offeringId">
              <app-option [value]="null">Nije odabrano</app-option>
              @for (offer of activeOfferings(); track offer.id) {
                <app-option [value]="offer.id">{{ offer.title }} · {{ priceRange(offer.priceFrom, offer.priceTo) }}</app-option>
              }
            </app-select>
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
                  @case ('mine') { <app-icon name="info" /> Već imate zahtjev kod ovog salona za taj datum. }
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
            <button type="submit" class="btn btn-primary btn-block" [disabled]="bookingForm.invalid || busy() || availability() === 'mine'">
              @if (busy()) { <span class="spinner"></span> } @else { {{ v.autoConfirmBookings ? 'Rezerviši termin' : 'Pošalji zahtjev' }} }
            </button>
          </div>
        </form>
        }
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

    // Traka se puni kad kartica uđe u vidno polje, od pet zvjezdica naniže. Pomjera se (translateX) unutar
    // zaobljenog okvira, pa zaobljenje ostaje čisto, bez rastezanja.
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--gold);
      transform: translateX(calc((var(--p, 0) - 1) * 100%));
      transition: transform 760ms var(--ease-out);
    }

    @for $i from 2 through 5 {
      .bar-row:nth-child(#{$i}) .bar span {
        transition-delay: #{($i - 1) * 70}ms;
      }
    }

    :host-context(.reveal-armed) .breakdown:not(.is-revealed) .bar span {
      transform: translateX(-100%);
    }

    @media (prefers-reduced-motion: reduce) {
      .bar span {
        transition: none;
      }
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

    .availability.mine {
      color: var(--warning);
    }

    .prefilled {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      color: var(--accent-ink);
    }

    .inline-icon {
      width: 1rem;
      height: 1rem;
      flex: none;
      vertical-align: -0.15em;
    }

    // Postojeći zahtjev na stranici salona: boja ivice prati status.
    .my-booking {
      display: grid;
      gap: var(--space-2);
      justify-items: start;
      padding: var(--space-4);
      border: 1px solid var(--separator);
      border-left: 3px solid var(--warning);
      border-radius: var(--radius-md);
      background: var(--warning-soft);
    }

    .my-booking.Confirmed {
      border-left-color: var(--success);
      background: var(--success-soft);
    }

    .my-booking.Rejected {
      border-left-color: var(--danger);
      background: var(--danger-soft);
    }

    .my-booking p {
      margin: 0;
    }

    .my-booking-title {
      font-weight: 600;
    }

    .sent {
      justify-items: center;
      text-align: center;
      padding-top: var(--space-2);
    }

    .sent h3,
    .sent p {
      margin: 0;
    }

    .sent-icon {
      display: grid;
      place-items: center;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: var(--warning-soft);
      color: var(--warning);
      animation: sent-pop 520ms var(--ease-out) both;
    }

    .sent-icon.ok {
      background: var(--success-soft);
      color: var(--success);
    }

    .sent-icon app-icon {
      width: 1.75rem;
      height: 1.75rem;
    }

    @keyframes sent-pop {
      from {
        opacity: 0;
        transform: scale(0.6);
      }
      60% {
        transform: scale(1.08);
      }
    }

    .sent-summary {
      display: grid;
      width: 100%;
      margin: 0;
      border: 1px solid var(--separator);
      border-radius: var(--radius-md);
      text-align: left;
    }

    .sent-summary div {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
    }

    .sent-summary div + div {
      border-top: 1px solid var(--separator);
    }

    .sent-summary dt {
      color: var(--text-secondary);
    }

    .sent-summary dd {
      margin: 0;
      font-weight: 600;
      text-align: right;
    }

    .sent .alert {
      width: 100%;
      margin: 0;
      text-align: left;
    }

    .sent-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
      width: 100%;
    }

    @media (prefers-reduced-motion: reduce) {
      .sent-icon {
        animation: none;
      }
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
  protected readonly rate = formatRating;
  /** Parametar rute: "17-foto-trenutak" ili "17". */
  readonly id = input.required<string>();
  /** `?rezervacija=1` (iz plana): otvori rezervaciju čim se ponuđač učita. */
  readonly rezervacija = input<string>();

  protected readonly auth = inject(AuthService);
  private readonly vendorApi = inject(VendorApi);
  private readonly reviewApi = inject(ReviewApi);
  private readonly myBookings = inject(BookingsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly titleService = inject(Title);
  private readonly seo = inject(SeoService);
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
  /** Upravo poslan zahtjev: list prikazuje potvrdu umjesto forme. */
  protected readonly sent = signal<Booking | null>(null);
  protected readonly prefilled = signal(false);
  protected readonly addedToPlan = signal<string | null>(null);

  private readonly bookingSheet = viewChild<Sheet>('bookingSheet');
  private readonly reviewSheet = viewChild<Sheet>('reviewSheet');
  private readonly dateCheck$ = new Subject<string>();
  private request?: Subscription;

  protected readonly today = todayIso();
  protected readonly priceRange = formatPriceRange;
  protected readonly plural = plural;
  protected readonly date = (value: string) => formatDate(value);
  protected readonly longDate = (value: string) => capitalize(formatDate(value, { weekday: 'long' }));
  protected readonly shortDate = (value: string) => formatDate(value, { year: undefined, month: 'short' });
  protected readonly time = formatTime;
  protected readonly status = BOOKING_STATUS;
  protected readonly open = isOpen;

  /** Zahtjev mladenaca kod ovog ponuđača (otvoren ili odbijen za budući datum), da se ne rezerviše "naslijepo". */
  protected readonly myBooking = computed(() => {
    const v = this.vendor();
    return v && this.auth.hasRole('Couple') ? this.myBookings.latestFor(v.id) : null;
  });

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
        switchMap((date) => {
          const v = this.vendor()!;
          if (this.myBookings.openOn(v.id, date)) {
            this.availability.set('mine');
            return EMPTY;
          }
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

    this.destroyRef.onDestroy(() => this.seo.reset());
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

  /** Otvori rezervaciju popunjenu iz plana: datum vjenčanja, usluga iz plana i broj gostiju u napomeni. */
  protected openBooking(v: Vendor): void {
    const answers = this.plan.answers();
    const item = this.plan.items().find((i) => i.vendorId === v.id);
    const offers = this.activeOfferings();
    const offering =
      offers.find((o) => item && o.serviceCategoryId === item.categoryId && o.title === item.offeringTitle) ??
      (offers.length === 1 ? offers[0] : null);
    const date = answers.date && answers.date >= this.today ? answers.date : '';
    const note = item && answers.guests ? `Broj gostiju: ${answers.guests}.` : null;

    this.sent.set(null);
    this.addedToPlan.set(null);
    this.availability.set('idle');
    this.prefilled.set(!!date || (!!item && !!offering));
    this.bookingForm.reset({ offeringId: offering?.id ?? null, eventDate: date, startTime: null, note });
    this.bookingOpen.set(true);
  }

  protected headline(b: Booking): string {
    switch (b.status) {
      case 'Confirmed':
        return 'Vaš termin je potvrđen.';
      case 'Rejected':
        return 'Salon nije mogao prihvatiti vaš zahtjev.';
      default:
        return 'Vaš zahtjev čeka potvrdu salona.';
    }
  }

  protected async cancelBooking(b: Booking): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Otkazati zahtjev?',
      message: `Zahtjev kod „${b.vendorName}“ za ${formatDate(b.eventDate)} biće otkazan.`,
      confirmText: 'Otkaži zahtjev',
    });
    if (!ok) return;
    this.myBookings.cancel(b.id).subscribe(() => this.toasts.success('Zahtjev je otkazan.'));
  }

  /**
   * Rezervisan ponuđač pripada planu: ako ga tamo nema, dodaj ga u kategoriju rezervisane usluge.
   * Vraća rečenicu za potvrdu (ili null kad je već bio u planu).
   */
  private keepInPlan(v: Vendor, booking: Booking): string | null {
    if (this.inPlan()) return null;
    const offering = this.activeOfferings().find((o) => o.id === booking.offeringId) ?? this.activeOfferings()[0];
    if (!offering) return null;
    const known = this.lookups.categories().find((c) => c.id === offering.serviceCategoryId);
    const item = PlanStore.itemFrom(v, {
      id: offering.serviceCategoryId,
      name: known?.name ?? offering.serviceCategoryName ?? '',
      slug: known?.slug ?? '',
    });
    if (!item) return null;
    const replaced = this.plan.put(item);
    return replaced ? `${v.name} je u vašem planu umjesto ${replaced.vendorName}.` : `${v.name} je dodan u vaš plan.`;
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
    this.myBookings
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
          this.addedToPlan.set(this.keepInPlan(v, booking));
          this.sent.set(booking);
          this.bookingForm.reset();
          this.availability.set('idle');
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
        if (this.rezervacija() && v.bookingEnabled && this.auth.hasRole('Couple') && !this.myBooking()) this.openBooking(v);
      },
      error: () => this.loading.set(false),
    });
    this.loadReviews(id);
  }

  /** Naslov, opis i čitljiv URL za dijeljenje i pretraživače. */
  private applySeo(v: Vendor): void {
    this.titleService.setTitle(`${v.name} · ${v.cityName} · ${BRAND.name}`);
    const description = (v.description || `${v.categories.join(', ')} u gradu ${v.cityName}.`).slice(0, 160);
    const canonical = this.router.serializeUrl(this.router.createUrlTree(vendorLink(v)));
    if (!this.router.url.startsWith(canonical)) this.location.replaceState(canonical);
    const image = (v.images.find((i) => i.isCover) ?? v.images[0])?.url ?? null;
    this.seo.set({ description, path: canonical, image, jsonLd: vendorJsonLd(v, location.origin + canonical, image) });
  }

  private loadReviews(vendorId: number): void {
    this.reviewApi.list({ vendorId, pageSize: 50 }).subscribe((r) => this.reviews.set(r.items));
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
