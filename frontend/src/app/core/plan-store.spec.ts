import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth';
import { PlanItem, PlanStore } from './plan-store';

const item = (categoryId: number, vendorId: number): PlanItem => ({
  categoryId,
  categoryName: 'Kategorija',
  categorySlug: 'kategorija',
  vendorId,
  vendorName: `V${vendorId}`,
  vendorSlug: `v${vendorId}`,
  cityName: null,
  cover: null,
  offeringTitle: 'Paket',
  priceFrom: 1000,
  priceTo: 2000,
});

function setup() {
  const user = signal<{ id: number } | null>(null);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { user, isLoggedIn: computed(() => user() !== null) } },
    ],
  });
  const store = TestBed.inject(PlanStore);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  return { store, http, user };
}

describe('PlanStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('gost: plan se čuva u pregledniku, ne na serveru', async () => {
    const { store, http } = setup();
    store.put(item(1, 10));
    vi.advanceTimersByTime(2000);
    expect(JSON.parse(localStorage.getItem('planiraj.mojplan.gost')!).items[0].vendorId).toBe(10);
    expect(await store.save()).toBe('local');
    http.expectNone(() => true);
  });

  it('prijava: gostov plan ide u profil i na server kad server nema plan', () => {
    const { store, http, user } = setup();
    store.put(item(1, 10));
    vi.advanceTimersByTime(300);

    user.set({ id: 7 });
    TestBed.tick();
    http.expectOne('/api/plans/me').flush(null, { status: 204, statusText: 'No Content' });
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/plans/me');
    expect(put.request.body.items[0].vendorId).toBe(10);
    expect(put.request.body.manual).toBe(false);
    put.flush({});
    expect(store.sync()).toBe('server');
    expect(localStorage.getItem('planiraj.mojplan.gost')).toBeNull();
  });

  it('prijavljen: promjena se automatski šalje na server nakon kratke pauze', () => {
    const { store, http, user } = setup();
    user.set({ id: 7 });
    TestBed.tick();
    http.expectOne('/api/plans/me').flush(null, { status: 204, statusText: 'No Content' });

    store.put(item(1, 10));
    store.put(item(2, 20));
    http.expectNone('/api/plans/me');
    vi.advanceTimersByTime(1600);
    const put = http.expectOne((r) => r.method === 'PUT');
    expect(put.request.body.items.map((i: PlanItem) => i.vendorId)).toEqual([10, 20]);
    put.flush({});
    http.verify();
  });

  it('noviji plan sa servera (drugi uređaj) zamijeni lokalni', () => {
    localStorage.setItem(
      'planiraj.mojplan.7',
      JSON.stringify({
        answers: { categoryIds: [], budget: 1, cityId: null, date: null, guests: null },
        items: [item(1, 10)],
        savedAt: null,
        updatedAt: '2026-11-01T10:00:00.000Z',
      }),
    );
    const { store, http, user } = setup();
    user.set({ id: 7 });
    TestBed.tick();
    http.expectOne('/api/plans/me').flush({
      answers: { categoryIds: [3], budget: 30000, cityId: 1, date: null, guests: 200 },
      items: [item(3, 30)],
      savedAt: '2026-11-08T10:00:00',
      updatedAt: '2026-11-08T10:00:00',
    });
    expect(store.items()[0].vendorId).toBe(30);
    expect(store.budget()).toBe(30000);
    expect(store.sync()).toBe('server');
    http.expectNone((r) => r.method === 'PUT');
  });

  it('"Sačuvaj" odmah šalje plan sa manual: true', async () => {
    const { store, http, user } = setup();
    user.set({ id: 7 });
    TestBed.tick();
    http.expectOne('/api/plans/me').flush(null, { status: 204, statusText: 'No Content' });

    store.put(item(1, 10));
    const done = store.save();
    const put = http.expectOne((r) => r.method === 'PUT');
    expect(put.request.body.manual).toBe(true);
    put.flush({});
    expect(await done).toBe('server');
    vi.advanceTimersByTime(2000);
    http.expectNone((r) => r.method === 'PUT');
  });
});
