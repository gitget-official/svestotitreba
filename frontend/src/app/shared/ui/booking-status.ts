import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { BOOKING_STATUS, formatDate } from '../../core/format';
import { BookingsStore } from '../../core/my-bookings';

/**
 * Status rezervacije za jednog ponuđača u planu: "Čeka potvrdu · 31. okt", "Potvrđeno", "Odbijeno",
 * ili dugme "Rezerviši" koje otvara popunjenu rezervaciju na stranici ponuđača.
 */
@Component({
  selector: 'app-booking-status',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (booking(); as b) {
      <a
        [class]="'status ' + b.status"
        routerLink="/moje-rezervacije"
        (click)="navigated.emit()"
        [attr.aria-label]="'Rezervacija: ' + label[b.status].label + ', ' + date(b.eventDate)"
      >
        <span class="dot" aria-hidden="true"></span>
        <span>{{ label[b.status].label }}</span>
        <span class="when">· {{ date(b.eventDate) }}</span>
      </a>
    } @else if (bookable()) {
      <a
        class="btn btn-tinted btn-sm"
        [routerLink]="link()"
        [queryParams]="{ rezervacija: 1 }"
        (click)="navigated.emit()"
      >
        Rezerviši
      </a>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-full);
      background: var(--warning-soft);
      color: var(--text);
      font-size: 0.8125rem;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
    }

    .status:hover {
      text-decoration: underline;
    }

    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--warning);
    }

    .Confirmed {
      background: var(--success-soft);
    }

    .Confirmed .dot {
      background: var(--success);
    }

    .Rejected {
      background: var(--danger-soft);
    }

    .Rejected .dot {
      background: var(--danger);
    }

    .when {
      color: var(--text-secondary);
      font-weight: 500;
    }
  `,
})
export class BookingStatus {
  readonly vendorId = input.required<number>();
  readonly link = input.required<unknown[] | string>();
  /** Nepoznato (stariji sačuvan plan) se tretira kao da salon prima rezervacije; stranica ponuđača kaže tačno. */
  readonly bookingEnabled = input<boolean | undefined>(undefined);
  /** Klik vodi na drugu stranicu (npr. da "Moj plan" zatvori svoj list). */
  readonly navigated = output<void>();

  private readonly auth = inject(AuthService);
  private readonly bookings = inject(BookingsStore);

  protected readonly label = BOOKING_STATUS;
  protected readonly date = (value: string) =>
    formatDate(value, { year: undefined, month: 'short' });

  protected readonly booking = computed(() =>
    this.auth.hasRole('Couple') ? this.bookings.latestFor(this.vendorId()) : null,
  );

  /** Gost vidi "Rezerviši" (stranica ponuđača ga vodi na prijavu); salon i administrator ne. */
  protected readonly bookable = computed(() => {
    const role = this.auth.role();
    return this.bookingEnabled() !== false && (role === null || role === 'Couple');
  });
}
