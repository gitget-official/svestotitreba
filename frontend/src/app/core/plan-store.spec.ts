import { PlanItem, snapshotOf } from './plan-store';
import { PlanAnswers } from './planner';

const answers = (change: Partial<PlanAnswers> = {}): PlanAnswers => ({
  categoryIds: [1, 2],
  budget: 20000,
  cityId: null,
  date: null,
  guests: null,
  ...change,
});

const item = (categoryId: number, vendorId: number) =>
  ({ categoryId, vendorId, offeringTitle: 'Usluga' }) as PlanItem;

describe('snimak plana (dugme "Sačuvaj")', () => {
  it('isti sadržaj daje isti snimak bez obzira na redoslijed', () => {
    const a = snapshotOf({ answers: answers(), items: [item(1, 5), item(2, 7)] });
    const b = snapshotOf({
      answers: answers({ categoryIds: [2, 1] }),
      items: [item(2, 7), item(1, 5)],
    });
    expect(a).toBe(b);
  });

  it('promjena ponuđača ili odgovora mijenja snimak, a vraćanje ga vraća', () => {
    const saved = snapshotOf({ answers: answers(), items: [item(1, 5)] });
    expect(snapshotOf({ answers: answers(), items: [item(1, 6)] })).not.toBe(saved);
    expect(snapshotOf({ answers: answers({ budget: 25000 }), items: [item(1, 5)] })).not.toBe(
      saved,
    );
    expect(snapshotOf({ answers: answers(), items: [item(1, 5)] })).toBe(saved);
  });

  it('prazan raspon cijene se ne računa kao izmjena', () => {
    const saved = snapshotOf({ answers: answers(), items: [] });
    const emptyRange = snapshotOf({
      answers: answers({ priceRanges: { 1: { min: null, max: null } } }),
      items: [],
    });
    expect(emptyRange).toBe(saved);
  });
});
