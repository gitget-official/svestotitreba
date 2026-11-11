import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST } from './api';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';
import { Vendor } from './models';
import { PlanAnswers } from './planner';

/** Jedna stavka plana: izabrani ponuđač za jednu kategoriju usluge. */
export interface PlanItem {
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  vendorId: number;
  vendorName: string;
  vendorSlug: string;
  cityName: string | null;
  cover: string | null;
  offeringTitle: string;
  priceFrom: number;
  priceTo: number;
  /** Prima li ponuđač online rezervacije (stariji sačuvani planovi ovo nemaju). */
  bookingEnabled?: boolean;
}

export interface PlanState {
  answers: PlanAnswers;
  items: PlanItem[];
  /** Kad je korisnik zadnji put sam kliknuo "Sačuvaj". */
  savedAt: string | null;
  /** Kad se plan zadnji put promijenio (automatsko čuvanje). */
  updatedAt: string | null;
  /** Sadržaj plana pri zadnjem "Sačuvaj" (vidi snapshotOf); stariji sačuvani planovi ga nemaju. */
  savedSnapshot?: string | null;
}

/**
 * Sadržaj plana koji je bitan za "Sačuvaj": odgovori i izabrani ponuđači, bez vremena i redoslijeda klikova.
 * Isti plan uvijek daje isti tekst, pa vraćanje na sačuvano stanje opet znači "nema izmjena".
 */
export function snapshotOf(state: Pick<PlanState, 'answers' | 'items'>): string {
  const { answers, items } = state;
  const ranges = Object.entries(answers.priceRanges ?? {})
    .filter(([, r]) => r.min !== null || r.max !== null)
    .sort(([a], [b]) => Number(a) - Number(b));
  return JSON.stringify({
    categoryIds: [...answers.categoryIds].sort((a, b) => a - b),
    budget: answers.budget,
    cityId: answers.cityId,
    date: answers.date,
    guests: answers.guests,
    ranges,
    items: items.map((i) => [i.categoryId, i.vendorId, i.offeringTitle]).sort((a, b) => Number(a[0]) - Number(b[0])),
  });
}

export type SyncState = 'local' | 'saving' | 'server' | 'offline';

const PREFIX = 'planiraj.mojplan.';
const EMPTY: PlanState = {
  answers: { categoryIds: [], budget: 20000, cityId: null, date: null, guests: null },
  items: [],
  savedAt: null,
  updatedAt: null,
  savedSnapshot: null,
};

/**
 * "Moj plan" (FR-27): izabrani ponuđači po kategorijama, budžet i odgovori iz planera.
 * - Čuva se automatski pri svakoj promjeni (ništa se ne gubi ako korisnik zaboravi kliknuti "Sačuvaj").
 * - Vezan je za profil: ključ je Id korisnika; gost ima svoj plan koji se pri prijavi prenosi u profil.
 * - Prijavljenom korisniku se plan, kratko poslije svake promjene, čuva i na serveru (PUT /api/plans/me),
 *   pa je isti na svakom uređaju. "Sačuvaj" to radi odmah i bilježi vrijeme ručnog čuvanja.
 * - Bez mreže plan ostaje u pregledniku; sljedeća promjena ili prijava ga pošalje na server.
 */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/plans/me`;
  private readonly quiet = new HttpContext().set(SKIP_AUTH_REDIRECT, true).set(SKIP_ERROR_TOAST, true);

  readonly state = signal<PlanState>(EMPTY);
  readonly sync = signal<SyncState>('local');

  readonly items = computed(() => this.state().items);
  readonly answers = computed(() => this.state().answers);
  readonly count = computed(() => this.items().length);
  readonly totalFrom = computed(() => this.items().reduce((s, i) => s + i.priceFrom, 0));
  readonly totalTo = computed(() => this.items().reduce((s, i) => s + i.priceTo, 0));
  readonly budget = computed(() => this.answers().budget);
  readonly overBy = computed(() => Math.max(0, this.totalFrom() - this.budget()));
  /** Ima li izmjena od zadnjeg "Sačuvaj" (dugme je aktivno samo tada). */
  readonly dirty = computed(() => snapshotOf(this.state()) !== (this.state().savedSnapshot ?? null));

  private key = PREFIX + 'gost';
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private serverTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Prijava/odjava: učitaj plan tog profila. Gostov plan ide u profil ako je profil prazan.
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => this.switchUser(userId));
    });
  }

  has(vendorId: number): boolean {
    return this.items().some((i) => i.vendorId === vendorId);
  }

  itemFor(categoryId: number): PlanItem | undefined {
    return this.items().find((i) => i.categoryId === categoryId);
  }

  setAnswers(answers: PlanAnswers): void {
    this.update((s) => ({ ...s, answers }));
  }

  /** Postavi ponuđača za kategoriju (zamjenjuje prethodnog u toj kategoriji). Vraća zamijenjenu stavku. */
  put(item: PlanItem): PlanItem | undefined {
    const previous = this.itemFor(item.categoryId);
    this.update((s) => {
      const items = s.items.filter((i) => i.categoryId !== item.categoryId);
      const answers = s.answers.categoryIds.includes(item.categoryId)
        ? s.answers
        : { ...s.answers, categoryIds: [...s.answers.categoryIds, item.categoryId] };
      return { ...s, answers, items: [...items, item].sort((a, b) => a.categoryId - b.categoryId) };
    });
    return previous?.vendorId === item.vendorId ? undefined : previous;
  }

  /** Zamijeni sve stavke odjednom (npr. novi prijedlog iz planera). */
  replaceItems(items: PlanItem[]): void {
    this.update((s) => ({ ...s, items: [...items].sort((a, b) => a.categoryId - b.categoryId) }));
  }

  remove(categoryId: number): PlanItem | undefined {
    const removed = this.itemFor(categoryId);
    this.update((s) => ({ ...s, items: s.items.filter((i) => i.categoryId !== categoryId) }));
    return removed;
  }

  clear(): void {
    this.update(() => ({ ...EMPTY, answers: { ...EMPTY.answers } }));
  }

  /**
   * Ručno čuvanje: odmah na server ako je korisnik prijavljen, inače ostaje u pregledniku.
   * Bez izmjena od zadnjeg čuvanja ne radi ništa (i dvostruki klik), jer je snimak postavljen odmah.
   */
  save(): Promise<SyncState | null> {
    if (!this.dirty() || this.sync() === 'saving') return Promise.resolve(null);
    this.update((s) => ({ ...s, savedAt: new Date().toISOString(), savedSnapshot: snapshotOf(s) }));
    if (!this.auth.isLoggedIn()) {
      this.sync.set('local');
      return Promise.resolve('local');
    }
    return this.putServer(true);
  }

  private putServer(manual: boolean): Promise<SyncState> {
    clearTimeout(this.serverTimer);
    this.sync.set('saving');
    const userId = this.auth.user()?.id;
    const { answers, items } = this.state();
    return new Promise((resolve) =>
      this.http.put(this.url, { answers, items, manual }, { context: this.quiet }).subscribe({
        next: () => {
          if (this.auth.user()?.id === userId) this.sync.set('server');
          resolve('server');
        },
        error: () => {
          // Server nije dostupan: plan je ipak sačuvan u pregledniku, pa se računa kao sačuvan
          // (dugme se gasi do sljedeće izmjene, a toast kaže gdje je plan).
          if (this.auth.user()?.id === userId) this.sync.set('offline');
          resolve('offline');
        },
      }),
    );
  }

  /** Napravi stavku plana iz ponuđača i kategorije (najjeftinija aktivna usluga u toj kategoriji). */
  static itemFrom(vendor: Vendor, category: { id: number; name: string; slug: string }): PlanItem | null {
    const offers = vendor.offerings.filter((o) => o.isActive && o.serviceCategoryId === category.id);
    if (!offers.length) return null;
    const cheapest = offers.reduce((a, b) => (b.priceFrom < a.priceFrom ? b : a));
    return {
      categoryId: category.id,
      categoryName: category.name,
      categorySlug: category.slug,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      cityName: vendor.cityName,
      cover: (vendor.images.find((i) => i.isCover) ?? vendor.images[0])?.url ?? null,
      offeringTitle: cheapest.title,
      priceFrom: cheapest.priceFrom,
      priceTo: cheapest.priceTo,
      bookingEnabled: vendor.bookingEnabled,
    };
  }

  private update(fn: (s: PlanState) => PlanState): void {
    this.state.update((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }));
    if (this.sync() === 'server') this.sync.set('local');
    // Automatsko čuvanje, kratko odgođeno da brze promjene (klizač budžeta) ne pišu svaki put.
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => write(this.key, this.state()), 250);
    // Na server rjeđe: tek kad korisnik na trenutak stane sa izmjenama.
    clearTimeout(this.serverTimer);
    if (this.auth.isLoggedIn()) this.serverTimer = setTimeout(() => void this.putServer(false), 1500);
  }

  private switchUser(userId: number | null): void {
    clearTimeout(this.writeTimer);
    clearTimeout(this.serverTimer);
    const guestKey = PREFIX + 'gost';
    const nextKey = PREFIX + (userId ?? 'gost');
    let next = read(nextKey);

    if (userId !== null) {
      const guest = read(guestKey);
      if (guest?.items.length && !next?.items.length) {
        next = guest;
        write(nextKey, guest);
        remove(guestKey);
      }
    }

    this.key = nextKey;
    this.state.set(next ?? { ...EMPTY, answers: { ...EMPTY.answers } });
    this.sync.set('local');
    if (userId !== null) this.pull();
  }

  /** Ako server ima noviji plan (npr. sa drugog uređaja), preuzmi ga; ako je lokalni noviji, pošalji ga. */
  private pull(): void {
    const userId = this.auth.user()?.id;
    this.http.get<Partial<PlanState> | null>(this.url, { context: this.quiet }).subscribe({
      next: (remote) => {
        if (this.auth.user()?.id !== userId) return;
        const local = this.state();
        if (!remote?.items) {
          // Na serveru još nema plana (204): pošalji lokalni, npr. onaj koji je gost napravio prije prijave.
          if (local.items.length || local.answers.categoryIds.length) void this.putServer(false);
          return;
        }
        if (!local.updatedAt || (remote.updatedAt && remote.updatedAt > local.updatedAt)) {
          const next = { ...EMPTY, ...remote } as PlanState;
          this.state.set({ ...next, savedSnapshot: snapshotOf(next) });
          write(this.key, this.state());
          this.sync.set('server');
        } else if (remote.updatedAt !== local.updatedAt) {
          void this.putServer(false);
        } else {
          this.sync.set('server');
        }
      },
      error: () => {
        /* server nedostupan: radimo lokalno */
      },
    });
  }
}

function read(key: string): PlanState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlanState;
    return parsed && Array.isArray(parsed.items) ? { ...EMPTY, ...parsed } : null;
  } catch {
    return null;
  }
}

function write(key: string, state: PlanState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage nedostupan: plan ostaje u memoriji do zatvaranja */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignoriši */
  }
}
