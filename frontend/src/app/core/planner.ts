import { ServiceCategory, Vendor } from './models';

/**
 * Planer vjenčanja (FR-24 – FR-28), deterministički dio.
 * Budžet se raspoređuje po kategorijama prema uobičajenim udjelima, a u svakoj kategoriji bira se
 * najbolje ocijenjen ponuđač čija početna cijena staje u taj dio budžeta. Bira se samo iz baze (FR-28).
 * AI sloj (faza 4) kasnije može objasniti ili doraditi prijedlog, ali ovaj algoritam ostaje osnova.
 */

export interface PlanAnswers {
  categoryIds: number[];
  budget: number;
  cityId: number | null;
  date: string | null;
  guests: number | null;
}

export interface PlanOption {
  vendor: Vendor;
  offeringTitle: string;
  priceFrom: number;
  priceTo: number;
  /** Početna cijena je iznad dijela budžeta za ovu kategoriju. */
  overBudget: boolean;
}

export interface PlanLine {
  category: ServiceCategory;
  allocation: number;
  choice: PlanOption | null;
  alternatives: PlanOption[];
}

export interface Plan {
  lines: PlanLine[];
  totalFrom: number;
  totalTo: number;
  budget: number;
}

/** Okvirni udjeli u budžetu svadbe (BiH); nepoznate kategorije dobijaju zadani udio. */
const SHARE: Record<string, number> = {
  'saloni-za-vjencanje': 45,
  'vjencanice-i-odijela': 14,
  fotografi: 13,
  dekoracije: 10,
  'svecani-automobili': 7,
  frizeri: 5,
  'beauty-makeup': 5,
};
const DEFAULT_SHARE = 6;

/** Ocjena "ublažena" brojem recenzija, da 5,0 iz jedne recenzije ne pobijedi 4,8 iz pedeset. */
export function smoothedRating(average: number | null, count: number): number {
  const prior = 3.8;
  const weight = 2;
  return ((average ?? prior) * count + prior * weight) / (count + weight);
}

export function allocate(categories: ServiceCategory[], budget: number): Map<number, number> {
  const shares = categories.map((c) => SHARE[c.slug] ?? DEFAULT_SHARE);
  const sum = shares.reduce((a, b) => a + b, 0) || 1;
  return new Map(categories.map((c, i) => [c.id, (budget * shares[i]) / sum]));
}

/** Najjeftinija aktivna usluga ponuđača u datoj kategoriji. */
export function optionFor(vendor: Vendor, categoryId: number, allocation: number): PlanOption | null {
  const offers = vendor.offerings.filter((o) => o.isActive && o.serviceCategoryId === categoryId);
  if (!offers.length) return null;
  const cheapest = offers.reduce((a, b) => (b.priceFrom < a.priceFrom ? b : a));
  return {
    vendor,
    offeringTitle: cheapest.title,
    priceFrom: cheapest.priceFrom,
    priceTo: cheapest.priceTo,
    overBudget: cheapest.priceFrom > allocation,
  };
}

/** Redoslijed: prvo opcije koje staju u budžet, pa bolja ocjena, pa niža cijena. */
export function rankOptions(options: PlanOption[]): PlanOption[] {
  return [...options].sort(
    (a, b) =>
      Number(a.overBudget) - Number(b.overBudget) ||
      smoothedRating(b.vendor.averageRating, b.vendor.reviewCount) -
        smoothedRating(a.vendor.averageRating, a.vendor.reviewCount) ||
      a.priceFrom - b.priceFrom ||
      a.vendor.id - b.vendor.id,
  );
}

/**
 * Sastavi plan. `vendorsByCategory` su kandidati iz pretrage (već filtrirani po gradu/datumu),
 * `picks` su ručni izbori mladenaca (categoryId -> vendorId) koji imaju prednost.
 */
export function buildPlan(
  categories: ServiceCategory[],
  budget: number,
  vendorsByCategory: Map<number, Vendor[]>,
  picks: Record<number, number> = {},
): Plan {
  const allocations = allocate(categories, budget);

  const lines: PlanLine[] = categories.map((category) => {
    const allocation = allocations.get(category.id) ?? 0;
    const options = rankOptions(
      (vendorsByCategory.get(category.id) ?? [])
        .map((v) => optionFor(v, category.id, allocation))
        .filter((o): o is PlanOption => o !== null),
    );
    const picked = options.find((o) => o.vendor.id === picks[category.id]);
    const choice = picked ?? options[0] ?? null;
    return { category, allocation, choice, alternatives: options.filter((o) => o !== choice).slice(0, 3) };
  });

  // Ako ukupna početna cijena prelazi budžet, spuštaj najveće prekoračenje na jeftiniju opciju
  // (samo u kategorijama koje mladenci nisu ručno izabrali).
  for (let guard = 0; guard < 20 && total(lines).from > budget; guard++) {
    const candidates = lines
      .filter((l) => l.choice && picks[l.category.id] === undefined)
      .map((l) => ({ line: l, cheaper: cheapestBelow(l) }))
      .filter((c) => c.cheaper !== null)
      .sort((a, b) => b.line.choice!.priceFrom - b.line.allocation - (a.line.choice!.priceFrom - a.line.allocation));
    const next = candidates[0];
    if (!next) break;
    const previous = next.line.choice!;
    next.line.choice = next.cheaper;
    next.line.alternatives = [previous, ...next.line.alternatives.filter((o) => o !== next.cheaper)].slice(0, 3);
  }

  const { from, to } = total(lines);
  return { lines, totalFrom: from, totalTo: to, budget };
}

function cheapestBelow(line: PlanLine): PlanOption | null {
  const current = line.choice!.priceFrom;
  const cheaper = line.alternatives.filter((o) => o.priceFrom < current);
  return cheaper.length ? cheaper.reduce((a, b) => (b.priceFrom < a.priceFrom ? b : a)) : null;
}

function total(lines: PlanLine[]): { from: number; to: number } {
  return lines.reduce(
    (sum, l) => ({ from: sum.from + (l.choice?.priceFrom ?? 0), to: sum.to + (l.choice?.priceTo ?? 0) }),
    { from: 0, to: 0 },
  );
}
