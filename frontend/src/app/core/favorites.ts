import { Injectable, computed, effect, inject, signal } from '@angular/core';
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

/**
 * "Sačuvano": ponuđači koje mladenci razmatraju.
 * @TODO backend: za sada se čuva u pregledniku (po korisniku); kad bude endpointa, sinhronizovati sa serverom.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly auth = inject(AuthService);
  private readonly key = computed(() => PREFIX + (this.auth.user()?.id ?? 'gost'));

  readonly items = signal<SavedVendor[]>([]);
  readonly count = computed(() => this.items().length);
  private readonly ids = computed(() => new Set(this.items().map((i) => i.id)));

  constructor() {
    // Novi korisnik (prijava/odjava) = njegova lista.
    effect(() => this.items.set(read(this.key())));
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
  }

  remove(id: number): void {
    this.write(this.items().filter((i) => i.id !== id));
  }

  /** Vraća uklonjenu stavku na isto mjesto (za "Poništi"). */
  restore(item: SavedVendor, index: number): void {
    if (this.has(item.id)) return;
    const list = [...this.items()];
    list.splice(Math.min(index, list.length), 0, item);
    this.write(list);
  }

  private write(list: SavedVendor[]): void {
    this.items.set(list);
    try {
      localStorage.setItem(this.key(), JSON.stringify(list));
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
