import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { RouterLink } from '@angular/router';
import { BookingApi, ReviewApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { BOOKING_STATUS, REVIEW_STATUS, formatDate, formatTime, todayIso } from '../../core/format';
import { Booking, Review } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Rating } from '../../shared/ui/rating';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

/** Rezervacije mladenaca: nadolazeće i prošle, sa mogućnošću otkazivanja. */
@Component({
  selector: 'app-my-bookings',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page narrow">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Moje rezervacije</h1>
          <p class="muted">Termini koje ste zatražili kod salona.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="skeleton block"></div>
      } @else if (!bookings().length) {
        <div class="empty-state">
          <app-icon name="calendar" />
          <h3 class="t-title-3">Još nemate rezervacija</h3>
          <p>Salone koji primaju online rezervacije pronađite u pretrazi.</p>
          <a class="btn btn-tinted" routerLink="/istrazi" [queryParams]="{ rezervacija: 1 }">Pronađi salon</a>
        </div>
      } @else {
        @for (group of groups(); track group.title) {
          @if (group.items.length) {
            <section class="stack-sm group">
              <h2 class="t-eyebrow">{{ group.title }}</h2>
              <div class="list-group">
                @for (b of group.items; track b.id) {
                  <div class="list-row booking">
                    <div class="date-tile" aria-hidden="true">
                      <span class="day">{{ day(b.eventDate) }}</span>
                      <span class="month">{{ month(b.eventDate) }}</span>
                    </div>
                    <div class="grow">
                      <a class="vendor" [routerLink]="['/ponudjaci', b.vendorId]">{{ b.vendorName }}</a>
                      <p class="t-footnote muted">
                        {{ date(b.eventDate) }}@if (b.startTime) {, {{ time(b.startTime) }}}
                        @if (b.offeringTitle) { · {{ b.offeringTitle }} }
                      </p>
                      @if (b.statusNote) { <p class="t-footnote subtle">„{{ b.statusNote }}“</p> }
                      @if (b.requiresDeposit && b.depositNote && b.status !== 'Cancelled') {
                        <p class="t-footnote subtle">{{ b.depositNote }}</p>
                      }
                    </div>
                    <div class="side">
                      <span class="badge" [class]="status[b.status].badge">{{ status[b.status].label }}</span>
                      @if (b.status === 'Pending' || b.status === 'Confirmed') {
                        <button type="button" class="btn btn-plain btn-sm" (click)="cancel(b)">Otkaži</button>
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        }
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 48rem; }
    .group { margin-bottom: var(--space-5); }
    .booking { align-items: flex-start; }
    .date-tile {
      display: grid; justify-items: center; flex: none; width: 3.25rem; padding: 0.375rem 0;
      border-radius: var(--radius-md); background: var(--accent-soft); color: var(--accent);
    }
    .day { font-size: 1.25rem; font-weight: 700; line-height: 1.1; }
    .month { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    .grow { flex: 1; display: grid; gap: 0.125rem; min-width: 0; }
    .vendor { color: var(--text); font-weight: 600; }
    .side { display: grid; justify-items: end; gap: var(--space-1); }
    .block { height: 12rem; border-radius: var(--radius-lg); }
  `,
})
export class MyBookings implements OnInit {
  private readonly api = inject(BookingApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);

  protected readonly bookings = signal<Booking[]>([]);
  protected readonly loading = signal(true);
  protected readonly status = BOOKING_STATUS;
  protected readonly date = (v: string) => formatDate(v, { weekday: 'long', year: undefined });
  protected readonly time = formatTime;
  protected readonly day = (v: string) => v.slice(8, 10);
  protected readonly month = (v: string) => formatDate(v, { day: undefined, year: undefined, month: 'short' });

  protected readonly groups = computed(() => {
    const today = todayIso();
    const upcoming = this.bookings().filter((b) => b.eventDate >= today && b.status !== 'Cancelled' && b.status !== 'Rejected');
    const rest = this.bookings().filter((b) => !upcoming.includes(b));
    return [
      { title: 'Nadolazeće', items: upcoming },
      { title: 'Prošle i zatvorene', items: rest.reverse() },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  protected async cancel(booking: Booking): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Otkazati rezervaciju?',
      message: `Termin kod „${booking.vendorName}“ ${formatDate(booking.eventDate)} biće otkazan. Ovo se ne može poništiti.`,
      confirmText: 'Otkaži rezervaciju',
    });
    if (!ok) return;
    this.api.cancel(booking.id, { note: null }).subscribe(() => {
      this.toasts.success('Rezervacija je otkazana.');
      this.load();
    });
  }

  private load(): void {
    this.api.list({ pageSize: 100 }).subscribe({
      next: (r) => {
        this.bookings.set(r.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}

/** Recenzije koje su mladenci ostavili, sa statusom moderacije. */
@Component({
  selector: 'app-my-reviews',
  imports: [RouterLink, ReactiveFormsModule, Icon, Rating, Sheet, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page narrow">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Moje recenzije</h1>
          <p class="muted">Recenzije se objavljuju nakon odobrenja administratora.</p>
        </div>
      </header>

      @if (!loading() && !reviews().length) {
        <div class="empty-state">
          <app-icon name="star" />
          <h3 class="t-title-3">Još niste ostavili recenziju</h3>
          <p>Ocijenite salone sa kojima ste sarađivali, na njihovoj stranici.</p>
        </div>
      }

      <div class="stack">
        @for (r of reviews(); track r.id) {
          <article class="card card-pad stack-sm">
            <div class="row">
              <a class="vendor" [routerLink]="['/ponudjaci', r.vendorId]">{{ r.vendorName }}</a>
              <span class="spacer"></span>
              <span class="badge" [class]="status[r.status].badge">{{ status[r.status].label }}</span>
            </div>
            <app-rating [value]="r.rating" />
            @if (r.comment) { <p>{{ r.comment }}</p> }
            <div class="row">
              <span class="t-caption subtle">{{ date(r.updatedAt ?? r.createdAt) }}</span>
              <span class="spacer"></span>
              <button type="button" class="btn btn-plain btn-sm" (click)="edit(r)">Uredi</button>
              <button type="button" class="btn btn-plain btn-sm danger" (click)="remove(r)">Obriši</button>
            </div>
          </article>
        }
      </div>
    </div>

    @if (editing(); as r) {
      <app-sheet title="Uredi recenziju" (closed)="editing.set(null)">
        <form class="stack" [formGroup]="form" (ngSubmit)="save(r)">
          <app-rating [editable]="true" [value]="form.controls.rating.value" (valueChange)="form.controls.rating.setValue($event)" />
          <textarea class="textarea" formControlName="comment" maxlength="2000" aria-label="Komentar"></textarea>
<app-field-error [control]="form.controls.comment" />
          <p class="t-footnote muted">Izmijenjena recenzija ponovo ide na odobrenje.</p>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || form.controls.rating.value < 1">Sačuvaj</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .narrow { max-width: 44rem; }
    .vendor { color: var(--text); font-weight: 600; }
    .danger { --btn-fg: var(--danger); }
  `,
})
export class MyReviews implements OnInit {
  private readonly api = inject(ReviewApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly sheet = viewChild(Sheet);

  protected readonly reviews = signal<Review[]>([]);
  protected readonly loading = signal(true);
  protected readonly editing = signal<Review | null>(null);
  protected readonly status = REVIEW_STATUS;
  protected readonly date = (v: string) => formatDate(v);

  private readonly fb = inject(FormBuilder);
  protected readonly form = this.fb.group({
    rating: this.fb.nonNullable.control(0),
    comment: this.fb.control<string | null>(null, V.text(2000)),
  });

  ngOnInit(): void {
    this.load();
  }

  protected edit(review: Review): void {
    this.form.reset({ rating: review.rating, comment: review.comment });
    this.editing.set(review);
  }

  protected save(review: Review): void {
    const { rating, comment } = this.form.getRawValue();
    this.api.update(review.id, { rating, comment: comment || null }).subscribe(() => {
      this.toasts.success('Recenzija je poslana na odobrenje.');
      this.sheet()?.close();
      this.load();
    });
  }

  protected async remove(review: Review): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Obrisati recenziju?',
      message: `Recenzija za „${review.vendorName}“ biće trajno obrisana.`,
    });
    if (!ok) return;
    this.api.remove(review.id).subscribe(() => {
      this.toasts.success('Recenzija je obrisana.');
      this.load();
    });
  }

  private load(): void {
    const userId = this.auth.user()?.id;
    this.api.list({ userId, pageSize: 100 }).subscribe({
      next: (r) => {
        this.reviews.set(r.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
