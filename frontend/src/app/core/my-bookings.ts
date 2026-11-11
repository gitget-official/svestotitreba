import { HttpContext } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BookingApi, SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST } from './api';
import { AuthService } from './auth';
import { todayIso } from './format';
import { Booking, BookingInsertRequest } from './models';

const OPEN: Booking['status'][] = ['Pending', 'Confirmed'];

export function isOpen(b: Booking): boolean {
  return OPEN.includes(b.status);
}

/**
 * Rezervacije prijavljenih mladenaca, na jednom mjestu: stranica ponuđača, planer, "Moj plan" i navigacija
 * čitaju odavde, pa se poslan zahtjev odmah vidi svuda (bez osvježavanja stranice).
 */
@Injectable({ providedIn: 'root' })
export class BookingsStore {
  private readonly api = inject(BookingApi);
  private readonly auth = inject(AuthService);
  private readonly quiet = new HttpContext()
    .set(SKIP_AUTH_REDIRECT, true)
    .set(SKIP_ERROR_TOAST, true);

  readonly bookings = signal<Booking[]>([]);
  readonly loaded = signal(false);

  /** Nadolazeći termini koji su još u igri (čekaju potvrdu ili su potvrđeni). */
  readonly upcoming = computed(() => {
    const today = todayIso();
    return this.bookings().filter((b) => isOpen(b) && b.eventDate >= today);
  });
  readonly upcomingCount = computed(() => this.upcoming().length);

  constructor() {
    // Prijava/odjava ili drugi profil: učitaj rezervacije tog profila.
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        this.reset();
        if (user?.role === 'Couple') this.refresh();
      });
    });
  }

  /**
   * Šta mladenci trebaju znati o ovom ponuđaču: otvoren zahtjev (najbliži datum), a ako ga nema,
   * odbijen zahtjev za neki budući datum (da se ne čini kao da je sve u redu).
   */
  latestFor(vendorId: number): Booking | null {
    const today = todayIso();
    const mine = this.bookings()
      .filter((b) => b.vendorId === vendorId && b.eventDate >= today)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return mine.find(isOpen) ?? mine.find((b) => b.status === 'Rejected') ?? null;
  }

  /** Otvoren zahtjev kod ponuđača za tačno taj datum (backend ne dozvoljava drugi). */
  openOn(vendorId: number, date: string): Booking | null {
    return (
      this.bookings().find((b) => b.vendorId === vendorId && b.eventDate === date && isOpen(b)) ??
      null
    );
  }

  refresh(): void {
    this.api.list({ pageSize: 100 }, this.quiet).subscribe({
      next: (r) => {
        this.bookings.set(r.items);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  create(request: BookingInsertRequest): Observable<Booking> {
    return this.api.create(request).pipe(tap((b) => this.upsert(b)));
  }

  cancel(id: number): Observable<Booking> {
    return this.api.cancel(id, { note: null }).pipe(tap((b) => this.upsert(b)));
  }

  private upsert(booking: Booking): void {
    this.bookings.update((list) => [booking, ...list.filter((b) => b.id !== booking.id)]);
  }

  private reset(): void {
    this.bookings.set([]);
    this.loaded.set(false);
  }
}
