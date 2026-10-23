import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FavoritesService } from '../../core/favorites';
import { Vendor } from '../../core/models';
import { Icon } from './icon';
import { ToastService } from './toast';

/**
 * Srce za "Sačuvano". Odziv je na pritisak (skupi se), a kad se stavka sačuva, srce kratko "iskoči".
 * Uklanjanje se može poništiti iz poruke (oprost umjesto dijaloga potvrde).
 */
@Component({
  selector: 'app-save-button',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="save"
      [class.on]="saved()"
      [class.pop]="pop()"
      [class.floating]="floating()"
      [attr.aria-pressed]="saved()"
      [attr.aria-label]="saved() ? 'Ukloni iz sačuvanog' : 'Sačuvaj'"
      (click)="toggle($event)"
      (animationend)="onAnimationEnd($event)"
    >
      <app-icon name="heart" [filled]="saved()" [strokeWidth]="2" />
      @if (withLabel()) { <span>{{ saved() ? 'Sačuvano' : 'Sačuvaj' }}</span> }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .save {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-width: 2.5rem;
      height: 2.5rem;
      padding: 0 0.625rem;
      border: 0;
      border-radius: var(--radius-full);
      background: var(--fill);
      color: var(--text);
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        transform var(--dur-press) ease-out,
        background-color var(--dur-fast) ease,
        color var(--dur-fast) ease;
    }

    .save:hover {
      background: var(--fill-strong);
    }

    .save:active {
      transform: scale(0.9);
    }

    // Na fotografiji: prozirni materijal, da srce bude čitljivo na svakoj slici.
    .floating {
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-thin);
      backdrop-filter: var(--blur-thin);
      box-shadow: var(--shadow-sm);
    }

    .floating:hover {
      background: var(--material-thick);
    }

    .on {
      color: var(--accent);
    }

    app-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .pop app-icon {
      animation: pop 360ms var(--ease-out);
    }

    @keyframes pop {
      40% {
        transform: scale(1.28);
      }
    }

    // Jedan prsten se raširi oko srca i nestane: potvrda da je sačuvano, bez konfeta.
    .save {
      position: relative;
    }

    .pop::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      border: 2px solid var(--accent);
      pointer-events: none;
      animation: ring 520ms var(--ease-out) forwards;
    }

    @keyframes ring {
      from {
        opacity: 0.55;
        transform: scale(0.7);
      }
      to {
        opacity: 0;
        transform: scale(1.55);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pop app-icon {
        animation: none;
      }

      .pop::after {
        display: none;
      }
    }
  `,
})
export class SaveButton {
  readonly vendor = input.required<Vendor>();
  /** Prikaži tekst pored srca (stranica ponuđača). */
  readonly withLabel = input(false);
  /** Srce leži preko fotografije. */
  readonly floating = input(false);

  private readonly favorites = inject(FavoritesService);
  private readonly toasts = inject(ToastService);

  protected readonly saved = computed(() => this.favorites.has(this.vendor().id));
  protected readonly pop = signal(false);

  /** Prsten traje duže od "iskakanja" srca; klasa se skida tek kad on završi (Angular dodaje prefiks imenu). */
  protected onAnimationEnd(event: AnimationEvent): void {
    if (event.animationName.endsWith('ring')) this.pop.set(false);
  }

  protected toggle(event: Event): void {
    // Srce je često unutar linka (kartica): ne otvaraj ponuđača.
    event.preventDefault();
    event.stopPropagation();

    const vendor = this.vendor();
    const index = this.favorites.items().findIndex((i) => i.id === vendor.id);
    const item = this.favorites.items()[index];
    const nowSaved = this.favorites.toggle(vendor);

    if (nowSaved) {
      this.pop.set(true);
    } else if (item) {
      this.toasts.info(`${vendor.name} je uklonjen iz sačuvanog.`, {
        label: 'Poništi',
        run: () => this.favorites.restore(item, index),
      });
    }
  }
}
