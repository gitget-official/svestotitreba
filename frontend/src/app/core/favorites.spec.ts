import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth';
import { FavoritesService } from './favorites';
import { Vendor } from './models';

const vendor = (id: number): Vendor =>
  ({
    id,
    name: `V${id}`,
    slug: `v${id}`,
    cityName: 'Sarajevo',
    categories: ['Sala'],
    offerings: [],
    priceFrom: 100,
    priceTo: 200,
    images: [],
    averageRating: null,
    reviewCount: 0,
    bookingEnabled: false,
  }) as unknown as Vendor;

function setup() {
  const user = signal<{ id: number } | null>(null);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { user, isLoggedIn: computed(() => user() !== null) } },
    ],
  });
  const service = TestBed.inject(FavoritesService);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  return { service, http, user };
}

describe('FavoritesService', () => {
  beforeEach(() => localStorage.clear());

  it('gost: lista je samo u pregledniku, bez poziva servera', () => {
    const { service, http } = setup();
    service.add(vendor(1));
    expect(service.has(1)).toBe(true);
    expect(JSON.parse(localStorage.getItem('planiraj.saved.gost')!)[0].id).toBe(1);
    http.expectNone(() => true);
  });

  it('prijava spaja gostovu listu sa profilom i dohvati ponuđače koji fale', () => {
    const { service, http, user } = setup();
    service.add(vendor(1));

    user.set({ id: 7 });
    TestBed.tick();
    const sync = http.expectOne('/api/favorites/sync');
    expect(sync.request.body).toEqual({ vendorIds: [1] });
    sync.flush([
      { vendorId: 1, createdAt: '2026-11-09T10:00:00' },
      { vendorId: 2, createdAt: '2026-11-01T10:00:00' },
    ]);

    // ponuđača 2 (sačuvan na drugom uređaju) nema lokalno: dohvati se sa servera
    http.expectOne('/api/vendors/2').flush(vendor(2));
    expect(service.items().map((i) => i.id)).toEqual([1, 2]);
    expect(localStorage.getItem('planiraj.saved.gost')).toBeNull();
    http.verify();
  });

  it('prijavljen korisnik: server je izvor istine, dodavanje i uklanjanje idu na server', () => {
    localStorage.setItem(
      'planiraj.saved.7',
      JSON.stringify([{ id: 5, name: 'Stari', savedAt: '' }]),
    );
    const { service, http, user } = setup();
    user.set({ id: 7 });
    TestBed.tick();
    http.expectOne('/api/favorites').flush([]);
    expect(service.count()).toBe(0);

    service.add(vendor(3));
    const add = http.expectOne('/api/favorites/3');
    expect(add.request.method).toBe('POST');
    add.flush({});

    service.remove(3);
    const del = http.expectOne('/api/favorites/3');
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    expect(service.count()).toBe(0);
    http.verify();
  });

  it('bez servera lista ostaje lokalna', () => {
    localStorage.setItem(
      'planiraj.saved.7',
      JSON.stringify([{ id: 5, name: 'Lokalni', savedAt: '' }]),
    );
    const { service, http, user } = setup();
    user.set({ id: 7 });
    TestBed.tick();
    http.expectOne('/api/favorites').flush(null, { status: 0, statusText: 'offline' });
    expect(service.items().map((i) => i.id)).toEqual([5]);
  });
});
