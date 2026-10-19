import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';

/**
 * Planiranje vjenčanja uz AI (FR-24 – FR-28) dolazi u fazi 4.
 * Ovdje je samo najava, da mladenci znaju šta ih čeka, i put nazad na samostalnu pretragu.
 */
@Component({
  selector: 'app-planning',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page enter">
      <section class="hero card">
        <span class="badge badge-gold">Uskoro</span>
        <h1 class="t-title-1 serif">Planiranje vjenčanja</h1>
        <p class="lead muted">
          Odgovorite na nekoliko pitanja (koje usluge trebate, okvirni budžet i grad), a mi ćemo vam predložiti
          kompletan paket ponuđača sa procjenom ukupne cijene. Plan ćete moći sačuvati u profilu.
        </p>
        <ol class="steps">
          <li><app-icon name="check" /> Odaberite usluge</li>
          <li><app-icon name="check" /> Unesite budžet i grad</li>
          <li><app-icon name="check" /> Dobijte prijedlog paketa</li>
        </ol>
        <a class="btn btn-primary" routerLink="/istrazi">Do tada, istražite ponudu <app-icon name="arrow-right" /></a>
      </section>
    </div>
  `,
  styles: `
    .hero {
      display: grid;
      justify-items: start;
      gap: var(--space-4);
      max-width: 44rem;
      padding: var(--space-7) var(--space-6);
      border-radius: var(--radius-xl);
      background:
        radial-gradient(30rem 16rem at 100% 0%, var(--accent-soft), transparent 70%),
        var(--bg-elevated);
    }

    .lead {
      font-size: 1.0625rem;
    }

    .steps {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .steps li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .steps app-icon {
      color: var(--success);
    }
  `,
})
export class Planning {}
