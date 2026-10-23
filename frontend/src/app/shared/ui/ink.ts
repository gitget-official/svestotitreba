import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Potez pera ispod riječi, kao na pozivnici: iscrta se jednom, nakon `delay` ms (da sačeka ulaz naslova).
 * Samo za emotivne naslove, najviše jednom po ekranu. stroke-dashoffset nije transform, ali je ovo mali SVG
 * koji se crta jednom. Kod reduced-motion potez je tu od početka i samo se pretopi.
 */
@Component({
  selector: 'app-ink',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content />
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path pathLength="1" d="M4 15 C 70 7, 170 4, 296 10" />
      <path pathLength="1" class="second" d="M58 20 C 130 14, 210 13, 268 16" />
    </svg>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      white-space: nowrap;
    }

    svg {
      position: absolute;
      left: -3%;
      bottom: -0.16em;
      width: 106%;
      height: 0.3em;
      overflow: visible;
      pointer-events: none;
    }

    path {
      fill: none;
      stroke: var(--accent);
      stroke-width: 3.2;
      stroke-linecap: round;
      // Bez vector-effect: non-scaling-stroke, jer tada Chrome pogrešno računa crtice sa pathLength (potez ostane do pola).
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      opacity: 0.8;
      animation: draw 820ms var(--ease-in-out) var(--ink-delay) forwards;
    }

    .second {
      stroke-width: 2;
      opacity: 0.45;
      animation-duration: 560ms;
      animation-delay: calc(var(--ink-delay) + 460ms);
    }

    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      path,
      .second {
        stroke-dashoffset: 0;
        animation: appear var(--dur-base) ease both;
      }

      @keyframes appear {
        from {
          opacity: 0;
        }
      }
    }
  `,
  host: {
    '[style.--ink-delay.ms]': 'delay()',
  },
})
export class Ink {
  readonly delay = input(0);
}
