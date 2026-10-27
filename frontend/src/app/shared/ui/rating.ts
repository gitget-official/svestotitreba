import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { Icon } from './icon';

/** Prikaz ocjene (zvjezdice), ili unos ocjene kad je `editable`. */
@Component({
  selector: 'app-rating',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editable()) {
      <div class="stars input" role="radiogroup" aria-label="Ocjena">
        @for (star of stars; track star) {
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="value() === star"
            [attr.aria-label]="star + ' od 5'"
            [class.on]="star <= value()"
            (click)="value.set(star)"
          >
            <app-icon name="star" [filled]="star <= value()" />
          </button>
        }
      </div>
    } @else {
      <span class="stars" role="img" [attr.aria-label]="'Ocjena ' + value() + ' od 5'">
        @for (star of stars; track star) {
          <app-icon name="star" [filled]="star <= rounded()" [class.on]="star <= rounded()" />
        }
      </span>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    .stars { display: inline-flex; gap: 0.125rem; color: var(--text-tertiary); }
    .stars app-icon { width: var(--star-size, 0.95rem); height: var(--star-size, 0.95rem); }
    .on { color: var(--gold); }
    .input button {
      display: grid; place-items: center; width: 2.75rem; height: 2.75rem;
      border: 0; border-radius: 50%; background: transparent; color: var(--text-tertiary);
      cursor: pointer; transition: transform var(--dur-press) ease-out;
    }
    .input button:active { transform: scale(0.88); }
    .input button.on { color: var(--gold); }
    .input app-icon { width: 1.75rem; height: 1.75rem; }
  `,
})
export class Rating {
  readonly value = model(0);
  readonly editable = input(false);
  protected readonly stars = [1, 2, 3, 4, 5];

  protected rounded(): number {
    return Math.round(this.value());
  }
}
