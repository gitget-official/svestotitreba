import { Injectable, inject, signal } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { CategoryApi, CityApi, SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST } from './api';
import { City, ServiceCategory } from './models';

/** Gradovi i kategorije se rijetko mijenjaju: učitaj jednom i dijeli kroz aplikaciju. */
@Injectable({ providedIn: 'root' })
export class LookupStore {
  private readonly cityApi = inject(CityApi);
  private readonly categoryApi = inject(CategoryApi);

  readonly cities = signal<City[]>([]);
  readonly categories = signal<ServiceCategory[]>([]);
  readonly loaded = signal(false);
  private loading = false;

  /** `quiet`: bez poruke o grešci i bez preusmjeravanja gosta (početna radi i kad API traži prijavu). */
  ensureLoaded(force = false, quiet = false): void {
    if ((this.loaded() && !force) || this.loading) return;
    this.loading = true;
    const context = quiet ? new HttpContext().set(SKIP_AUTH_REDIRECT, true).set(SKIP_ERROR_TOAST, true) : undefined;
    forkJoin({
      cities: this.cityApi.list({ pageSize: 100 }, context),
      categories: this.categoryApi.list({ pageSize: 100 }, context),
    }).subscribe({
      next: ({ cities, categories }) => {
        this.cities.set(cities.items);
        this.categories.set(categories.items);
        this.loaded.set(true);
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  categoryByName(name: string): ServiceCategory | undefined {
    return this.categories().find((c) => c.name === name);
  }
}
