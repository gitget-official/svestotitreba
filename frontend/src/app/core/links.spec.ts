import { plural } from './format';
import { vendorIdFromParam, vendorLink } from './links';

describe('linkovi ponuđača', () => {
  it('pravi čitljiv link sa slug-om', () => {
    expect(vendorLink({ id: 17, slug: 'foto-trenutak' })).toEqual(['/ponudjaci', '17-foto-trenutak']);
    expect(vendorLink({ id: 17, slug: null })).toEqual(['/ponudjaci', '17']);
  });

  it('čita Id iz novog i starog oblika linka', () => {
    expect(vendorIdFromParam('17-foto-trenutak')).toBe(17);
    expect(vendorIdFromParam('17')).toBe(17);
    expect(vendorIdFromParam('foto-17')).toBeNull();
    expect(vendorIdFromParam(undefined)).toBeNull();
  });
});

describe('množina', () => {
  it('prati bosanska pravila', () => {
    const r = (n: number) => plural(n, 'recenzija', 'recenzije', 'recenzija');
    expect([1, 2, 5, 11, 12, 21, 22, 25].map(r)).toEqual([
      'recenzija',
      'recenzije',
      'recenzija',
      'recenzija',
      'recenzija',
      'recenzija',
      'recenzije',
      'recenzija',
    ]);
  });
});
