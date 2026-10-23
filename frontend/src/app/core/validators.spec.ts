import { FormControl, FormGroup } from '@angular/forms';
import { AppValidators as V, errorMessage } from './validators';

const check = (validators: any, value: unknown) => new FormControl(value, validators).errors;

describe('validacija unosa', () => {
  it('ime ne smije sadržavati brojeve', () => {
    expect(check(V.personName, 'Lejla')).toBeNull();
    expect(check(V.personName, 'Ana-Marija Đurić')).toBeNull();
    expect(errorMessage(check(V.personName, 'Lejla2'))).toContain('samo slova');
    expect(check(V.personName, 'L')).not.toBeNull();
  });

  it('telefon traži 8 do 15 cifara', () => {
    expect(check(V.phone, '+387 61 123 456')).toBeNull();
    expect(check(V.phone, '061/123-456')).toBeNull();
    expect(check(V.phone, '123')).not.toBeNull();
    expect(check(V.phone, 'abc defg')).not.toBeNull();
  });

  it('lozinka traži slovo i broj', () => {
    expect(check(V.password, 'tajna1234')).toBeNull();
    expect(check(V.password, 'samoslova')).not.toBeNull();
    expect(check(V.password, '12345678')).not.toBeNull();
  });

  it('link mreže mora biti na pravom domenu', () => {
    expect(check(V.social('instagram.com'), 'https://instagram.com/salon')).toBeNull();
    expect(check(V.social('instagram.com'), 'https://facebook.com/salon')).not.toBeNull();
  });

  it('cijena "do" ne može biti manja od "od"', () => {
    const g = new FormGroup({ a: new FormControl(500), b: new FormControl(300) }, { validators: V.range('a', 'b') });
    expect(g.errors).not.toBeNull();
    g.controls.b.setValue(800);
    expect(g.errors).toBeNull();
  });

  it('prazna opciona polja su ispravna', () => {
    expect(check(V.phone, '')).toBeNull();
    expect(check(V.url, null)).toBeNull();
  });
});
