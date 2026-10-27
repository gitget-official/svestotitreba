import { formatDate, formatNumber, formatPrice, formatPriceRange, formatRating } from './format';

describe('formatiranje', () => {
  it('piše cijene sa tačkom za hiljade, nezavisno od preglednika', () => {
    expect(formatNumber(6000)).toBe('6.000');
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(950)).toBe('950');
    expect(formatPrice(24000)).toBe('24.000 KM');
    expect(formatPriceRange(6000, 24000)).toBe('6.000 – 24.000 KM');
    expect(formatPriceRange(null, null)).toBe('Cijena na upit');
  });

  it('piše datume na bosanskom', () => {
    expect(formatDate('2026-10-07')).toBe('7. oktobar 2026.');
    expect(formatDate('2027-06-12', { weekday: 'long', year: undefined })).toBe('subota, 12. juni');
    expect(formatDate('2027-06-12', { day: undefined, year: undefined, month: 'short' })).toBe('jun');
    expect(formatDate('2027-06-12', { weekday: 'long' })).toBe('subota, 12. juni 2027.');
    expect(formatDate('')).toBe('');
    expect(formatDate('nije datum')).toBe('');
  });

  it('piše ocjenu sa zarezom', () => {
    expect(formatRating(4.5)).toBe('4,5');
    expect(formatRating(5)).toBe('5,0');
  });
});
