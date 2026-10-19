import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BRAND } from '../../core/brand';

/** Znak i ime platforme (jedan izvor za traku, prijavu i početnu). */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="mark" aria-hidden="true">{{ brand.mark }}</span><span class="name">{{ brand.name }}</span>`,
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

    .mark {
      display: grid;
      place-items: center;
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 9px;
      background: var(--accent);
      color: var(--text-on-accent);
      font-family: var(--font-display);
      font-size: 1.05rem;
    }

    .name {
      font-family: var(--font-display);
    }
  `,
})
export class BrandMark {
  protected readonly brand = BRAND;
}
