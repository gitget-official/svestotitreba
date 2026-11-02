import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BRAND } from '../../core/brand';

/** Znak i ime platforme (jedan izvor za traku, prijavu i početnu). */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img class="mark" src="/img/logo.png" width="30" height="30" alt="" /><span class="name">{{ brand.name }}</span>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text);
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.015em;
    }

    // Logo: slagalica sa S (isti kao na kraju uvodne animacije, pa se oblik ne mijenja kad znak sleti).
    .mark {
      display: block;
      flex: none;
      width: 1.875rem;
      height: 1.875rem;
      filter: drop-shadow(0 2px 5px rgba(60, 35, 15, 0.14));
    }

    .name {
      font-family: var(--font-display);
      font-optical-sizing: auto;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
  `,
})
export class BrandMark {
  protected readonly brand = BRAND;
}
