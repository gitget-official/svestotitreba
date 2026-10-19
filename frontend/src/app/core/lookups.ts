import { Injectable, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { CategoryApi, CityApi } from './api';
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

  ensureLoaded(force = false): void {
    if ((this.loaded() && !force) || this.loading) return;
    this.loading = true;
    forkJoin({
      cities: this.cityApi.list({ pageSize: 100 }),
      categories: this.categoryApi.list({ pageSize: 100 }),
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
