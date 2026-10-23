import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Ime platforme se još bira: mijenja se samo ovdje (i u index.html). */
export const BRAND = {
  name: 'Planiraj',
  mark: 'P',
  tagline: 'Sve za vaše vjenčanje, na jednom mjestu.',
  email: 'info@planiraj.ba',
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
