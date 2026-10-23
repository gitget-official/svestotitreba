import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Reveal } from '../../shared/motion/reveal';
import { Icon } from '../../shared/ui/icon';

/**
 * "Kako funkcioniše" na početnoj: tri koraka koja na širokom ekranu povezuje linija puta.
 * Izdvojeno iz Landing da stilovi stranice ostanu u budžetu.
 */
@Component({
  selector: 'app-landing-steps',
  imports: [Icon, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 id="kako" class="t-title-2" appReveal>Kako funkcioniše</h2>
    <ol class="steps" appReveal="stagger" [revealDelay]="60">
      <li>
        <span class="step-icon"><app-icon name="search" /></span>
        <h3 class="t-title-3">Pretražite i uporedite</h3>
        <p class="muted">Filtrirajte po gradu, cijeni, ocjeni i slobodnom datumu. Sačuvajte favorite i uporedite ih jedno uz drugo.</p>
      </li>
      <li>
        <span class="step-icon"><app-icon name="calendar" /></span>
        <h3 class="t-title-3">Rezervišite ili pitajte</h3>
        <p class="muted">Pošaljite zahtjev za termin salonu koji prima rezervacije, ili ga kontaktirajte direktno.</p>
      </li>
      <li>
        <span class="step-icon"><app-icon name="star" /></span>
        <h3 class="t-title-3">Podijelite iskustvo</h3>
        <p class="muted">Recenzije mladenaca pomažu drugim parovima. Svaku pregleda naš tim prije objave.</p>
      </li>
    </ol>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-5);
    }

    .steps {
      position: relative;
      display: grid;
      gap: var(--space-5);
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      position: relative;
      display: grid;
      gap: var(--space-2);
      align-content: start;
    }

    // Puna podloga (ne prozirna), da linija puta prolazi iza ikona.
    .step-icon {
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-md);
      background: var(--bg-elevated);
      border: 1px solid var(--separator);
      box-shadow: var(--shadow-sm);
      color: var(--accent);
    }

    // Na širokom ekranu linija se povuče kad sekcija uđe: tri koraka se čitaju kao put, ne kao lista.
    @media (min-width: 60rem) {
      .steps::before {
        content: "";
        position: absolute;
        top: calc(1.25rem - 1px);
        left: 3.25rem;
        width: calc((100% + var(--space-5)) * 2 / 3 - 4rem);
        height: 2px;
        border-radius: var(--radius-full);
        background: linear-gradient(90deg, var(--accent-soft), color-mix(in srgb, var(--accent) 38%, transparent), var(--accent-soft));
        transform-origin: left;
        transition: transform 900ms var(--ease-in-out) 220ms;
      }

      :host-context(.reveal-armed) .steps:not(.is-revealed)::before {
        transform: scaleX(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .steps::before {
        transition: none;
      }
    }
  `,
})
export class LandingSteps {}
