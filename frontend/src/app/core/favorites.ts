import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST } from './api';
import { AuthService } from './auth';
import { Vendor } from './models';

/** Sažetak ponuđača koji se čuva lokalno, da lista i poređenje rade bez dodatnih poziva. */
export interface SavedVendor {
  id: number;
  name: string;
  slug: string;
  cityName: string | null;
  categories: string[];
  offerings: { category: string; title: string; priceFrom: number; priceTo: number }[];
  priceFrom: number | null;
  priceTo: number | null;
  cover: string | null;
  averageRating: number | null;
  reviewCount: number;
  bookingEnabled: boolean;
  savedAt: string;
}

const PREFIX = 'planiraj.saved.';

export function toSaved(v: Vendor): SavedVendor {
  return {
    id: v.id,
    name: v.name,
    slug: v.slug,
    cityName: v.cityName,
    categories: v.categories,
    offerings: v.offerings
      .filter((o) => o.isActive)
      .map((o) => ({
        category: o.serviceCategoryName ?? '',
        title: o.title,
        priceFrom: o.priceFrom,
        priceTo: o.priceTo,
      })),
    priceFrom: v.priceFrom,
    priceTo: v.priceTo,
    cover: (v.images.find((i) => i.isCover) ?? v.images[0])?.url ?? null,
    averageRating: v.averageRating,
    reviewCount: v.reviewCount,
    bookingEnabled: v.bookingEnabled,
    savedAt: new Date().toISOString(),
  };
}

interface FavoriteDto {
  vendorId: number;
  createdAt: string;
}

/**
 * "Sačuvano": ponuđači koje mladenci razmatraju.
 * - Gost: lista je samo u pregledniku.
 * - Prijavljen korisnik: server (/api/favorites) je izvor istine, a preglednik čuva sažetke da lista i poređenje
 *   rade odmah i bez mreže. Pri prijavi se gostova lista spaja u profil (POST /api/favorites/sync).
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/favorites`;
  private readonly quiet = new HttpContext()
    .set(SKIP_AUTH_REDIRECT, true)
    .set(SKIP_ERROR_TOAST, true);

  readonly items = signal<SavedVendor[]>([]);
  readonly count = computed(() => this.items().length);
  private readonly ids = computed(() => new Set(this.items().map((i) => i.id)));

  private key = PREFIX + 'gost';
  private userId: number | null = null;

  constructor() {
    // Novi korisnik (prijava/odjava) = njegova lista.
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      untracked(() => this.switchUser(userId));
    });
  }

  has(id: number): boolean {
    return this.ids().has(id);
  }

  /** Vraća novo stanje (true = sačuvano). */
  toggle(vendor: Vendor): boolean {
    if (this.has(vendor.id)) {
      this.remove(vendor.id);
      return false;
    }
    this.add(vendor);
    return true;
  }

  add(vendor: Vendor): void {
    if (this.has(vendor.id)) return;
    this.write([toSaved(vendor), ...this.items()]);
    this.push('POST', vendor.id);
  }

  remove(id: number): void {
    if (!this.has(id)) return;
    this.write(this.items().filter((i) => i.id !== id));
    this.push('DELETE', id);
  }

  /** Vraća uklonjenu stavku na isto mjesto (za "Poništi"). */
  restore(item: SavedVendor, index: number): void {
    if (this.has(item.id)) return;
    const list = [...this.items()];
    list.splice(Math.min(index, list.length), 0, item);
    this.write(list);
    this.push('POST', item.id);
  }

  private push(method: 'POST' | 'DELETE', vendorId: number): void {
    if (this.userId === null) return;
    // Greška (npr. bez mreže) ne smeta: lokalna lista ostaje, a sljedeća prijava je uskladi sa serverom.
    this.http
      .request(method, `${this.url}/${vendorId}`, { context: this.quiet })
      .subscribe({ error: () => undefined });
  }

  private switchUser(userId: number | null): void {
    const guestKey = PREFIX + 'gost';
    this.userId = userId;
    this.key = PREFIX + (userId ?? 'gost');
    const cached = read(this.key);
    this.items.set(cached);
    if (userId === null) return;

    // Gostova lista ide u profil, a server vraća cijelu listu profila.
    const guest = read(guestKey);
    const request =
      guest.length > 0
        ? this.http.post<FavoriteDto[]>(
            `${this.url}/sync`,
            { vendorIds: guest.map((g) => g.id) },
            { context: this.quiet },
          )
        : this.http.get<FavoriteDto[]>(this.url, { context: this.quiet });
    request.subscribe({
      next: (remote) => {
        if (this.userId !== userId) return;
        if (guest.length) remove(guestKey);
        this.reconcile(remote, [...cached, ...guest]);
      },
      error: () => {
        /* server nedostupan: radimo sa lokalnom listom */
      },
    });
  }

  /** Lista sa servera, sa sažecima iz preglednika; one kojih nema lokalno dohvati sa servera. */
  private reconcile(remote: FavoriteDto[], known: SavedVendor[]): void {
    const byId = new Map(known.map((k) => [k.id, k]));
    const list: SavedVendor[] = [];
    const missing: FavoriteDto[] = [];
    for (const f of remote) {
      const k = byId.get(f.vendorId);
      if (k) list.push({ ...k, savedAt: f.createdAt });
      else missing.push(f);
    }
    this.write(list);
    if (!missing.length) return;

    const userId = this.userId;
    forkJoin(
      missing.map((f) =>
        this.http
          .get<Vendor>(`${environment.apiUrl}/vendors/${f.vendorId}`, { context: this.quiet })
          .pipe(
            map((v) => ({ ...toSaved(v), savedAt: f.createdAt })),
            catchError(() => of(null)),
          ),
      ),
    ).subscribe((fetched) => {
      if (this.userId !== userId) return;
      const add = fetched.filter((x): x is SavedVendor => x !== null && !this.has(x.id));
      if (!add.length) return;
      const order = new Map(remote.map((f, i) => [f.vendorId, i]));
      this.write(
        [...this.items(), ...add].sort(
          (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
        ),
      );
    });
  }

  private write(list: SavedVendor[]): void {
    this.items.set(list);
    try {
      localStorage.setItem(this.key, JSON.stringify(list));
    } catch {
      /* storage nedostupan: lista ostaje samo u memoriji */
    }
  }
}

function read(key: string): SavedVendor[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as SavedVendor[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignoriši */
  }
}
