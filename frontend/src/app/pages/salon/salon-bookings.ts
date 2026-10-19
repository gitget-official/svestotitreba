import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BookingApi } from '../../core/api';
import { BOOKING_STATUS, formatDate, formatTime, todayIso } from '../../core/format';
import { Booking, BookingStatus } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

type Filter = 'Pending' | 'Confirmed' | 'all';

/** Rezervacije za salone vlasnika (administrator vidi sve): potvrda, odbijanje, otkazivanje. */
@Component({
  selector: 'app-salon-bookings',
  imports: [FormsModule, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page narrow">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Rezervacije</h1>
          <p class="muted">Zahtjevi mladenaca za vaše termine.</p>
        </div>
      </header>

      <div class="segmented filter" role="tablist">
        @for (f of filters; track f.key) {
          <button type="button" role="tab" [class.is-active]="filter() === f.key" (click)="setFilter(f.key)">
            {{ f.label }}
            @if (f.key === 'Pending' && pendingCount()) { <span class="dot">{{ pendingCount() }}</span> }
          </button>
        }
      </div>

      @if (!loading() && !visible().length) {
        <div class="empty-state">
          <app-icon name="calendar" />
          <h3 class="t-title-3">{{ filter() === 'Pending' ? 'Nema zahtjeva na čekanju' : 'Nema rezervacija' }}</h3>
          <p>Novi zahtjevi će se pojaviti ovdje.</p>
        </div>
      }

      <div class="stack">
        @for (b of visible(); track b.id) {
          <article class="card card-pad booking">
            <div class="row">
              <div class="grow">
                <p class="t-footnote muted">{{ b.vendorName }}@if (b.offeringTitle) { · {{ b.offeringTitle }} }</p>
                <h2 class="t-title-3">{{ date(b.eventDate) }}@if (b.startTime) {, {{ time(b.startTime) }}}</h2>
              </div>
              <span class="badge" [class]="status[b.status].badge">{{ status[b.status].label }}</span>
            </div>
            <div class="person">
              <strong>{{ b.userFullName }}</strong>
              <div class="row-wrap t-footnote">
                @if (b.userPhoneNumber) { <a [href]="'tel:' + b.userPhoneNumber"><app-icon name="phone" /> {{ b.userPhoneNumber }}</a> }
                @if (b.userEmail) { <a [href]="'mailto:' + b.userEmail"><app-icon name="mail" /> {{ b.userEmail }}</a> }
              </div>
            </div>
            @if (b.note) { <p class="note">{{ b.note }}</p> }
            @if (b.statusNote) { <p class="t-footnote subtle">Napomena: {{ b.statusNote }}</p> }
            @if (b.status === 'Pending' || b.status === 'Confirmed') {
              <div class="form-actions">
                @if (b.status === 'Pending') {
                  <button type="button" class="btn btn-sm" (click)="openReject(b)">Odbij</button>
                  <button type="button" class="btn btn-primary btn-sm" (click)="confirmBooking(b)"><app-icon name="check" /> Potvrdi</button>
                } @else {
                  <button type="button" class="btn btn-sm btn-danger" (click)="cancel(b)">Otkaži</button>
                }
              </div>
            }
          </article>
        }
      </div>
    </div>

    @if (rejecting(); as b) {
      <app-sheet title="Odbij zahtjev" (closed)="rejecting.set(null)">
        <form class="stack" (ngSubmit)="reject(b)">
          <p class="muted">{{ b.userFullName }} · {{ date(b.eventDate) }}</p>
          <div class="field">
            <label for="reason">Razlog (vide ga mladenci)</label>
            <textarea id="reason" class="textarea" name="reason" [(ngModel)]="reason" maxlength="500"
              placeholder="Npr. termin je već zauzet"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-danger btn-block">Odbij zahtjev</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .narrow { max-width: 48rem; }
    .filter { margin-bottom: var(--space-5); }
    .dot {
      display: inline-grid; place-items: center; min-width: 1.125rem; height: 1.125rem; margin-left: 0.25rem;
      border-radius: var(--radius-full); background: var(--accent); color: var(--text-on-accent); font-size: 0.6875rem;
    }
    .booking { display: grid; gap: var(--space-3); }
    .grow { flex: 1; }
    .person { display: grid; gap: 0.25rem; }
    .person a { display: inline-flex; align-items: center; gap: 0.25rem; }
    .person app-icon { width: 0.9rem; height: 0.9rem; }
    .note { padding: var(--space-3); border-radius: var(--radius-md); background: var(--fill); white-space: pre-line; }
  `,
})
export class SalonBookings implements OnInit {
  private readonly api = inject(BookingApi);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly sheet = viewChild(Sheet);

  protected readonly filters: { key: Filter; label: string }[] = [
    { key: 'Pending', label: 'Na čekanju' },
    { key: 'Confirmed', label: 'Potvrđene' },
    { key: 'all', label: 'Sve' },
  ];

  protected readonly bookings = signal<Booking[]>([]);
  protected readonly filter = signal<Filter>('Pending');
  protected readonly loading = signal(true);
  protected readonly rejecting = signal<Booking | null>(null);
  protected reason = '';

  protected readonly status = BOOKING_STATUS;
  protected readonly date = (v: string) => formatDate(v, { weekday: 'long' });
  protected readonly time = formatTime;

  protected readonly pendingCount = computed(() => this.bookings().filter((b) => b.status === 'Pending').length);

  protected readonly visible = computed(() => {
    const f = this.filter();
    const today = todayIso();
    const list = this.bookings();
    if (f === 'all') return list;
    return list.filter((b) => b.status === (f as BookingStatus) && (f === 'Pending' || b.eventDate >= today));
  });

  ngOnInit(): void {
    this.load();
  }

  protected setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  protected confirmBooking(booking: Booking): void {
    this.api.confirm(booking.id).subscribe(() => {
      this.toasts.success('Rezervacija je potvrđena.');
      this.load();
    });
  }

  protected openReject(booking: Booking): void {
    this.reason = '';
    this.rejecting.set(booking);
  }

  protected reject(booking: Booking): void {
    this.api.reject(booking.id, { note: this.reason.trim() || null }).subscribe(() => {
      this.toasts.success('Zahtjev je odbijen.');
      this.sheet()?.close();
      this.load();
    });
  }

  protected async cancel(booking: Booking): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Otkazati potvrđenu rezervaciju?',
      message: `${booking.userFullName} će vidjeti da je termin ${formatDate(booking.eventDate)} otkazan.`,
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
