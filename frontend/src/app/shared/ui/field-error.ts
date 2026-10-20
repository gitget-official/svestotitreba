import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { errorMessage } from '../../core/validators';

/**
 * Poruka o grešci ispod polja, odmah dok korisnik kuca (ne tek na slanje).
 * "Obavezno" se prikazuje tek kad korisnik napusti polje, da prazna forma ne bude crvena.
 */
@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as m) {
      <span class="error" [id]="errorId()" role="alert">{{ m }}</span>
    }
  `,
  styles: `
    :host { display: contents; }
    .error {
      font-size: 0.75rem;
      line-height: 1.35;
      color: var(--danger);
      animation: show var(--dur-fast) var(--ease-out) both;
    }
    @keyframes show { from { opacity: 0; transform: translateY(-2px); } }
    @media (prefers-reduced-motion: reduce) { .error { animation: none; } }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();
  readonly errorId = input<string | null>(null);

  protected readonly message = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const c = this.control();
      const update = () => {
        if (!c.invalid) return this.message.set(null);
        const onlyRequired = !!c.errors?.['required'];
        const visible = c.touched || (c.dirty && !onlyRequired);
        this.message.set(visible ? errorMessage(c.errors) : null);
      };
      update();
      const sub = c.events.subscribe(update);
      onCleanup(() => sub.unsubscribe());
    });
  }
}
