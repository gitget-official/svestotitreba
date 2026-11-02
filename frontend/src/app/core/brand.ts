import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Ime platforme: mijenja se samo ovdje (i u index.html). */
export const BRAND = {
  name: 'Svadbeno',
  mark: 'S',
  tagline: 'Sve za vaše vjenčanje, na jednom mjestu.',
  email: 'info@svadbeno.com',
} as const;

/** Rute imaju kratke naslove ("Istraži"); brend se dodaje ovdje, na jednom mjestu. */
@Injectable({ providedIn: 'root' })
export class BrandTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    this.title.setTitle(title ? `${title} · ${BRAND.name}` : `${BRAND.name}: ${BRAND.tagline}`);
  }
}
