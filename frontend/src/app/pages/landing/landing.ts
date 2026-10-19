import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';

/** Javna početna stranica. Pregled ponude traži prijavu (FR-1), pa ovdje samo predstavljamo platformu. */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="nav material">
      <div class="container bar">
        <span class="brand"><span class="mark" aria-hidden="true">P</span><span class="serif">Planiraj</span></span>
        <div class="row">
          <a class="btn btn-plain" routerLink="/prijava">Prijava</a>
          <a class="btn btn-primary btn-sm" routerLink="/registracija">Napravite profil</a>
        </div>
      </div>
    </header>

    <section class="hero">
      <div class="container hero-inner enter">
        <p class="t-eyebrow">Za mladence u Bosni i Hercegovini</p>
        <h1 class="t-display">Sve za vaše vjenčanje,<br />na jednom mjestu.</h1>
        <p class="lead">
          Saloni vjenčanica, sale, fotografi, dekoracije, frizeri i svečani automobili. Uporedite ponude,
          pogledajte cijene i rezervišite termin, bez desetina poziva.
        </p>
        <div class="row-wrap cta">
          <a class="btn btn-primary btn-lg" routerLink="/registracija">
            Počnite planirati <app-icon name="arrow-right" />
          </a>
          <a class="btn btn-lg" routerLink="/prijava">Već imam profil</a>
        </div>
      </div>
    </section>

    <section class="container section">
      <h2 class="t-title-2">Šta sve možete pronaći</h2>
      <div class="categories">
        @for (category of categories; track category.name) {
          <div class="category card">
            <span class="cat-icon"><app-icon [name]="category.icon" /></span>
            <div>
              <h3 class="t-title-3">{{ category.name }}</h3>
              <p class="t-footnote muted">{{ category.text }}</p>
            </div>
          </div>
        }
      </div>
    </section>

    <section class="container section">
      <h2 class="t-title-2">Kako funkcioniše</h2>
      <ol class="steps">
        <li>
          <span class="num">1</span>
          <h3 class="t-title-3">Napravite profil</h3>
          <p class="muted">Besplatno, za manje od minute.</p>
        </li>
        <li>
          <span class="num">2</span>
          <h3 class="t-title-3">Pretražite i uporedite</h3>
          <p class="muted">Filtrirajte po gradu, cijeni, ocjeni i slobodnom datumu.</p>
        </li>
        <li>
          <span class="num">3</span>
          <h3 class="t-title-3">Kontaktirajte ili rezervišite</h3>
          <p class="muted">Pošaljite zahtjev za termin direktno salonu koji to nudi.</p>
        </li>
      </ol>
    </section>

    <section class="container section">
      <div class="vendor-cta card card-pad">
        <div>
          <p class="t-eyebrow">Za salone i ponuđače</p>
          <h2 class="t-title-2">Imate salon ili nudite usluge za vjenčanja?</h2>
          <p class="muted">Javite nam se i otvorićemo vam nalog sa vlastitom stranicom, cjenovnikom i rezervacijama.</p>
        </div>
        <a class="btn btn-tinted" href="mailto:info@planiraj.ba">Kontaktirajte nas</a>
      </div>
    </section>

    <footer class="container footer t-footnote subtle">© {{ year }} Planiraj</footer>
  `,
  styles: `
    .nav {
      position: sticky;
      top: 0;
      z-index: 10;
      height: var(--nav-height);
    }

    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 100%;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 1.25rem;
      font-weight: 600;
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
    }

    .hero {
      padding-block: clamp(3.5rem, 10vw, 7rem) clamp(2.5rem, 6vw, 4.5rem);
      background:
        radial-gradient(60rem 30rem at 85% -10%, var(--accent-soft), transparent 70%),
        radial-gradient(40rem 24rem at 0% 0%, var(--gold-soft), transparent 70%);
    }

    .hero-inner {
      display: grid;
      gap: var(--space-4);
      max-width: 48rem;
    }

    .lead {
      font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
      line-height: 1.5;
      color: var(--text-secondary);
      max-width: 38rem;
    }

    .cta {
      margin-top: var(--space-3);
      gap: var(--space-3);
    }

    .section {
      display: grid;
      gap: var(--space-5);
      padding-block: var(--space-6);
    }

    .categories {
      display: grid;
      gap: var(--space-3);
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
    }

    .category {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    .cat-icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: var(--radius-md);
      background: var(--accent-soft);
      color: var(--accent);
    }

    .steps {
      display: grid;
      gap: var(--space-5);
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .steps li {
      display: grid;
      gap: var(--space-2);
    }

    .num {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--text);
      color: var(--bg);
      font-weight: 700;
      font-size: 0.875rem;
    }

    .vendor-cta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);

      > div {
        display: grid;
        gap: var(--space-2);
        max-width: 36rem;
      }
    }

    .footer {
      padding-block: var(--space-6) var(--space-7);
    }
  `,
})
export class Landing {
  protected readonly year = new Date().getFullYear();

  protected readonly categories = [
    { name: 'Vjenčanice i odijela', icon: 'dress', text: 'Najam, prodaja i šivenje po mjeri.' },
    { name: 'Saloni za vjenčanje', icon: 'building', text: 'Sale i prostori za svako slavlje.' },
    { name: 'Dekoracije', icon: 'flower', text: 'Cvijeće, aranžmani i uređenje sale.' },
    { name: 'Fotografi', icon: 'camera', text: 'Fotografija i video za uspomene.' },
    { name: 'Svečani automobili', icon: 'car', text: 'Oldtimeri, limuzine i luksuzna vozila.' },
    { name: 'Frizeri', icon: 'scissors', text: 'Frizure za mladu, mladoženju i svatove.' },
    { name: 'Beauty i make-up', icon: 'sparkles', text: 'Šminka i tretmani pred veliki dan.' },
  ];
}
