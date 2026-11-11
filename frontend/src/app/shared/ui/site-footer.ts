import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { BRAND } from '../../core/brand';
import { BrandMark } from './brand-mark';

/**
 * Podnožje na svakoj stranici (postavlja ga App, ne pojedinačne stranice).
 * Na dnu ekrana je i kad je sadržaj kratak (sticky footer, vidi `app-root` u _base.scss).
 * U okviru aplikacije dobija dodatni prostor ispod sebe za donju traku i dugme "Moj plan" (`--footer-extra`).
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, BrandMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="footer">
      <div class="container footer-grid">
        <div class="stack-sm">
          <app-brand-mark />
          <p class="t-footnote muted">{{ brand.tagline }}</p>
        </div>
        <nav class="footer-links t-footnote" aria-label="Podnožje">
          <a routerLink="/istrazi">Istraži</a>
          <a routerLink="/planiranje">Planer</a>
          @if (!auth.isLoggedIn()) {
            <a routerLink="/" fragment="saloni">Za salone</a>
          }
          <a routerLink="/uslovi">Uslovi korištenja</a>
          <a routerLink="/privatnost">Privatnost</a>
          <a [href]="'mailto:' + brand.email">{{ brand.email }}</a>
        </nav>
        <p class="t-caption subtle">© {{ year }} {{ brand.name }}</p>
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }

    .footer {
      margin-top: var(--space-6);
      padding-block: var(--space-6)
        calc(var(--space-7) + var(--footer-extra, 0px) + var(--safe-bottom));
      border-top: 1px solid var(--separator);
      background: var(--bg);
    }

    .footer-grid {
      display: grid;
      gap: var(--space-5);
    }

    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-5);
    }

    .footer-links a {
      color: var(--text-secondary);
    }

    .footer-links a:hover {
      color: var(--text);
    }

    @media (min-width: 40rem) {
      .footer-grid {
        grid-template-columns: 1fr auto;
        align-items: center;
      }
    }

    @media print {
      :host {
        display: none;
      }
    }
  `,
})
export class SiteFooter {
  protected readonly auth = inject(AuthService);
  protected readonly brand = BRAND;
  protected readonly year = new Date().getFullYear();
}
