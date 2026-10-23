import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Reveal } from '../../shared/motion/reveal';
import { Icon } from '../../shared/ui/icon';

const FAQ = [
  {
    q: 'Da li je korištenje besplatno za mladence?',
    a: 'Da. Pretraga, poređenje, planer i slanje upita salonima su besplatni.',
  },
  {
    q: 'Kako planer zna šta mi odgovara?',
    a: 'Odaberete usluge, budžet i grad, a planer raspodijeli budžet po kategorijama i predloži najbolje ocijenjene ponuđače čije cijene staju u taj okvir. Svaki prijedlog možete zamijeniti.',
  },
  {
    q: 'Jesu li cijene konačne?',
    a: 'Ne. Saloni navode okvirne cijene od–do; tačna cijena zavisi od datuma, broja gostiju i dogovora sa salonom.',
  },
  {
    q: 'Mogu li odmah rezervisati termin?',
    a: 'Kod salona koji imaju online zakazivanje, da. Neki termin potvrđuju odmah, a neki ručno. Ostale kontaktirate telefonom ili e-mailom sa njihove stranice.',
  },
  {
    q: 'Imam salon. Kako da se pojavim na platformi?',
    a: 'Pošaljite nam upit preko forme ispod. Otvorićemo vam nalog sa vlastitom stranicom, cjenovnikom, galerijom i (ako želite) online rezervacijama.',
  },
];

/** Česta pitanja na početnoj. Izdvojeno iz Landing da stilovi stranice ostanu u budžetu. */
@Component({
  selector: 'app-landing-faq',
  imports: [Icon, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 id="faq" class="t-title-2" appReveal>Česta pitanja</h2>
    <div class="list-group" appReveal [revealDelay]="60">
      @for (item of faq; track item.q) {
        <details class="list-row">
          <summary>{{ item.q }} <app-icon name="chevron-down" class="chev" /></summary>
          <p class="muted">{{ item.a }}</p>
        </details>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-5);
    }

    details {
      display: block;
    }

    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      min-height: 2.25rem;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
      transition: color var(--dur-fast) ease;
    }

    summary:hover {
      color: var(--accent);
    }

    summary::-webkit-details-marker {
      display: none;
    }

    .chev {
      flex: none;
      width: 1rem;
      height: 1rem;
      color: var(--text-tertiary);
      transition: transform var(--dur-base) var(--ease-out);
    }

    details[open] .chev {
      transform: rotate(180deg);
    }

    p {
      padding-bottom: var(--space-2);
      max-width: 42rem;
    }

    // Odgovor izlazi iz pitanja (odozgo), kratko; zatvaranje je trenutno, da ne kasni za namjerom.
    details[open] > p {
      animation: answer-in var(--dur-base) var(--ease-out) both;
    }

    @keyframes answer-in {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      details[open] > p {
        animation: none;
      }
    }
  `,
})
export class LandingFaq {
  protected readonly faq = FAQ;
}
