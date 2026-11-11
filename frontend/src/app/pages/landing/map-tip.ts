import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

export interface MapTipData {
  /** Broj ponuđača u grupi; 1 znači pojedinačnu lokaciju (prikazuje se pribadača umjesto broja). */
  count: number;
  title: string;
  detail: string;
  hint: string;
  /** Uz gornju ivicu mape opis ide ispod markera. */
  below: boolean;
  /** Razmak od centra markera do opisa, u pikselima. */
  offset: number;
}

/**
 * Mali opis markera na mapi (hover ili fokus tastature): šta broj znači, koji je grad i šta klik radi.
 * Položaj (left/top centra markera) postavlja roditelj na host elementu.
 */
@Component({
  selector: 'app-map-tip',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'tooltip',
    class: 'glass',
    '[class.below]': 'data().below',
    '[style.--offset.px]': 'data().offset',
  },
  template: `
    <span class="head">
      <span class="count serif">
        @if (data().count === 1) {
          <app-icon name="map-pin" />
        } @else {
          {{ data().count }}
        }
      </span>
      <strong>{{ data().title }}</strong>
    </span>
    @if (data().detail) {
      <span class="detail">{{ data().detail }}</span>
    }
    <span class="hint">{{ data().hint }}</span>
  `,
  styles: `
    :host {
      position: absolute;
      z-index: 5;
      display: grid;
      gap: 0.3rem;
      width: max-content;
      max-width: 16rem;
      padding: 0.6rem 0.8rem 0.65rem;
      translate: -50% calc(-100% - var(--offset));
      border-radius: var(--radius-md);
      box-shadow:
        inset 0 1px 0 var(--glass-highlight),
        var(--shadow-lg);
      color: var(--text);
      font-size: 0.875rem;
      pointer-events: none;
      animation: tip-in 160ms var(--ease-out) both;
    }

    :host(.below) {
      translate: -50% var(--offset);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }

    strong {
      font-weight: 650;
    }

    .count {
      display: grid;
      place-items: center;
      flex: none;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--accent);
      color: var(--text-on-accent);
      font-size: 0.9rem;
      font-weight: 620;
    }

    .count app-icon {
      width: 0.95rem;
      height: 0.95rem;
    }

    .detail {
      color: var(--text-secondary);
      font-size: 0.8125rem;
    }

    .hint {
      color: var(--text-tertiary);
      font-size: 0.75rem;
    }

    @keyframes tip-in {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }
  `,
})
export class MapTip {
  readonly data = input.required<MapTipData>();
}
