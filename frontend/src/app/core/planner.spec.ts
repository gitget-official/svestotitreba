import { ServiceCategory, Vendor } from './models';
import { allocate, buildPlan, inRange, smoothedRating } from './planner';

const category = (id: number, slug: string): ServiceCategory => ({
  id,
  slug,
  name: slug,
  description: null,
  sortOrder: id,
  isActive: true,
});

const vendor = (id: number, categoryId: number, priceFrom: number, rating: number | null, reviews = 5): Vendor =>
  ({
    id,
    name: `V${id}`,
    averageRating: rating,
    reviewCount: rating === null ? 0 : reviews,
    offerings: [
      { id: id * 10, vendorId: id, serviceCategoryId: categoryId, title: 'Usluga', priceFrom, priceTo: priceFrom * 2, isActive: true },
    ],
    images: [],
  }) as unknown as Vendor;

const hall = category(1, 'saloni-za-vjencanje');
const photo = category(2, 'fotografi');

describe('planer', () => {
  it('raspoređuje budžet po udjelima kategorija', () => {
    const shares = allocate([hall, photo], 5800);
    expect(shares.get(1)).toBeCloseTo(4500);
    expect(shares.get(2)).toBeCloseTo(1300);
  });

  it('ublažava ocjenu sa malo recenzija', () => {
    expect(smoothedRating(5, 1)).toBeLessThan(smoothedRating(4.8, 50));
  });

  it('bira najbolje ocijenjenog ponuđača koji staje u budžet', () => {
    const plan = buildPlan([hall], 10000, new Map([[1, [vendor(1, 1, 12000, 5), vendor(2, 1, 8000, 4.5), vendor(3, 1, 6000, 4)]]]));
    expect(plan.lines[0].choice?.vendor.id).toBe(2);
    expect(plan.lines[0].alternatives.map((a) => a.vendor.id)).toEqual([3, 1]);
  });

  it('poštuje ručni izbor mladenaca', () => {
    const plan = buildPlan([hall], 10000, new Map([[1, [vendor(2, 1, 8000, 4.5), vendor(3, 1, 6000, 4)]]]), { 1: 3 });
    expect(plan.lines[0].choice?.vendor.id).toBe(3);
  });

  it('spušta se na jeftinije opcije kad ukupno prelazi budžet', () => {
    const plan = buildPlan(
      [hall, photo],
      7000,
      new Map([
        [1, [vendor(1, 1, 6000, 5), vendor(2, 1, 4000, 4)]],
        [2, [vendor(3, 2, 2500, 5), vendor(4, 2, 1000, 4)]],
      ]),
    );
    expect(plan.totalFrom).toBeLessThanOrEqual(7000);
  });

  it('vraća prazan izbor kad nema ponuđača', () => {
    const plan = buildPlan([photo], 5000, new Map());
    expect(plan.lines[0].choice).toBeNull();
    expect(plan.totalFrom).toBe(0);
  });

  it('gornja granica cijene iz upitnika zamjenjuje udio u budžetu', () => {
    const shares = allocate([hall, photo], 5800, { 2: { min: null, max: 500 } });
    expect(shares.get(2)).toBe(500);
    expect(Math.round(shares.get(1)!)).toBe(4500);
  });

  it('bira samo ponude u rasponu cijene (preklapanje kao na serveru)', () => {
    expect(inRange(900, 1800, { min: 1000, max: null })).toBe(true);
    expect(inRange(900, 1800, { min: 2000, max: null })).toBe(false);
    expect(inRange(900, 1800, { min: null, max: 800 })).toBe(false);
    const plan = buildPlan(
      [hall],
      20000,
      new Map([[1, [vendor(1, 1, 12000, 5), vendor(2, 1, 4000, 4)]]]),
      {},
      { 1: { min: null, max: 5000 } },
    );
    expect(plan.lines[0].choice?.vendor.id).toBe(2);
    expect(plan.lines[0].alternatives.length).toBe(0);
  });
});
