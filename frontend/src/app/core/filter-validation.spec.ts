import { futureDateError, numberError, rangeError } from './filter-validation';
import { todayIso } from './format';

describe('validacija filtera', () => {
  const price = { label: 'Cijena', feminine: true, max: 1_000_000 };

  it('prihvata prazno i ispravan broj', () => {
    expect(numberError(null, price)).toBeNull();
    expect(numberError(0, price)).toBeNull();
    expect(numberError(2500, price)).toBeNull();
  });

  it('odbija negativan broj, nevažeći unos i previsok iznos', () => {
    expect(numberError(-5, price)).toBe('Cijena ne može biti negativna.');
    expect(numberError(null, price, true)).toBe('Unesite broj (samo cifre).');
    expect(numberError(Number.NaN, price)).toBe('Unesite broj (samo cifre).');
    expect(numberError(2_000_000, price)).toContain('najviše');
  });

  it('poštuje cijeli broj i najmanju vrijednost', () => {
    expect(numberError(2.5, { integer: true })).toBe('Unesite cijeli broj.');
    expect(numberError(0, { min: 1, max: 5, label: 'Ocjena', feminine: true })).toContain(
      'najmanje',
    );
  });

  it('"od" ne smije biti veće od "do"', () => {
    expect(rangeError(500, 100)).toBe('Cijena "od" ne može biti veća od "do".');
    expect(rangeError(100, 500)).toBeNull();
    expect(rangeError(100, null)).toBeNull();
  });

  it('datum mora biti ispravan i ne u prošlosti', () => {
    expect(futureDateError(null)).toBeNull();
    expect(futureDateError(todayIso())).toBeNull();
    expect(futureDateError('2001-01-01')).toBe('Datum ne može biti u prošlosti.');
    expect(futureDateError('31.12.2027')).toContain('ispravan datum');
  });
});
