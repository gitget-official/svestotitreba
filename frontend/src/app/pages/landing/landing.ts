import { HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST, VendorApi } from '../../core/api';
import { BRAND } from '../../core/brand';
import { LookupStore } from '../../core/lookups';
import { Vendor } from '../../core/models';
import { FadeInImage } from '../../shared/motion/fade-in-image';
import { Reveal } from '../../shared/motion/reveal';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Icon } from '../../shared/ui/icon';
import { Ink } from '../../shared/ui/ink';
import { LoveLine } from '../../shared/motion/love-line';
import { Petals } from '../../shared/motion/petals';
import { LandingFaq } from './landing-faq';
import { LandingSteps } from './landing-steps';
import { VendorCard } from '../../shared/ui/vendor-card';

const CATEGORIES = [
  { slug: 'saloni-za-vjencanje', name: 'Sale i prostori', icon: 'building', text: 'Restorani, sale i bašte za svako slavlje.' },
  { slug: 'vjencanice-i-odijela', name: 'Vjenčanice i odijela', icon: 'dress', text: 'Najam, prodaja i šivenje po mjeri.' },
  { slug: 'fotografi', name: 'Fotografi', icon: 'camera', text: 'Fotografija i video za uspomene.' },
  { slug: 'dekoracije', name: 'Dekoracije', icon: 'flower', text: 'Cvijeće, aranžmani i uređenje sale.' },
  { slug: 'svecani-automobili', name: 'Svečani automobili', icon: 'car', text: 'Oldtimeri, limuzine i luksuzna vozila.' },
  { slug: 'frizeri', name: 'Frizeri', icon: 'scissors', text: 'Frizure za mladu, mladoženju i svatove.' },
  { slug: 'beauty-makeup', name: 'Beauty i make-up', icon: 'sparkles', text: 'Šminka i tretmani pred veliki dan.' },
];

/**
 * Javna početna. Prvo ono što gost traži (pretraga i stvarna ponuda), pa kako funkcioniše, planer,
 * ponuda za salone i česta pitanja. Dijelovi koji traže API (gradovi, istaknuti ponuđači) se tiho
 * izostavljaju dok backend ne dozvoli javni pristup.
 */
@Component({
  selector: 'app-landing',
  imports: [FormsModule, RouterLink, BrandMark, FadeInImage, Icon, Ink, LandingFaq, LandingSteps, LoveLine, Petals, Reveal, VendorCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#sadrzaj">Preskoči na sadržaj</a>
    <app-petals />

    <header class="nav material" [class.scrolled]="scrolled()">
      <div class="container bar">
        <a class="brand" routerLink="/"><app-brand-mark /></a>
        <nav class="links" aria-label="Glavna navigacija">
          <a routerLink="/istrazi">Istraži</a>
          <a routerLink="/planiranje">Planer</a>
          <a href="#saloni">Za salone</a>
        </nav>
        <div class="row actions">
          <a class="btn btn-plain btn-sm" routerLink="/prijava">Prijava</a>
          <a class="btn btn-primary btn-sm" routerLink="/registracija"><span class="label-long">Napravite profil</span><span class="label-short">Registracija</span></a>
        </div>
      </div>
    </header>

    <main id="sadrzaj">
      <app-love-line />
      <section class="hero">
        <div class="container hero-grid">
          <div class="hero-copy">
            <p class="t-eyebrow">Za mladence u Bosni i Hercegovini</p>
            <h1 class="t-display">
              Sve za vaše <span class="nowrap"><app-ink [delay]="620">vjenčanje</app-ink>,</span> na jednom mjestu.
            </h1>
            <p class="lead">
              Sale, vjenčanice, fotografi, dekoracije, frizeri i svečani automobili. Uporedite cijene, sačuvajte
              favorite i rezervišite termin, bez desetina poziva.
            </p>

            <form class="search material" (ngSubmit)="search()" role="search" aria-label="Brza pretraga">
              <label class="search-field">
                <span class="t-caption muted">Šta tražite</span>
                <select name="category" [(ngModel)]="category">
                  <option value="">Sve usluge</option>
                  @for (c of categories; track c.slug) { <option [value]="c.slug">{{ c.name }}</option> }
                </select>
              </label>
              @if (lookups.cities().length) {
                <span class="divider" aria-hidden="true"></span>
                <label class="search-field">
                  <span class="t-caption muted">Grad</span>
                  <select name="city" [(ngModel)]="cityId">
                    <option [ngValue]="null">Cijela BiH</option>
                    @for (city of lookups.cities(); track city.id) { <option [ngValue]="city.id">{{ city.name }}</option> }
                  </select>
                </label>
              }
              <button type="submit" class="btn btn-primary search-btn">
                <app-icon name="search" /> <span>Pretraži</span>
              </button>
            </form>

            <p class="t-footnote muted planner-hint">
              Ne znate odakle početi? <a routerLink="/planiranje">Neka vam planer složi paket po budžetu <app-icon name="arrow-right" /></a>
            </p>
          </div>

          <div class="collage" aria-hidden="true">
            @for (tile of collage(); track $index; let i = $index) {
              <div class="tile" [class]="'tile t' + i + (tile.image ? '' : ' cat')">
                @if (tile.image) {
                  <img appFadeIn [src]="tile.image" alt="" [attr.loading]="i === 0 ? 'eager' : 'lazy'" decoding="async" />
                } @else {
                  <span class="tile-icon"><app-icon [name]="tile.icon" [strokeWidth]="1.4" /></span>
                }
                <span class="tile-label">{{ tile.label }}</span>
              </div>
            }
          </div>
        </div>
      </section>

      <section class="container section" aria-labelledby="kategorije">
        <div class="section-head" appReveal>
          <h2 id="kategorije" class="t-title-2">Šta sve možete pronaći</h2>
          <a class="btn btn-plain btn-sm" routerLink="/istrazi">Sve ponude <app-icon name="chevron-right" /></a>
        </div>
        <div class="categories" appReveal="stagger" [revealDelay]="60">
          @for (c of categories; track c.slug) {
            <a class="category card" routerLink="/istrazi" [queryParams]="{ kategorija: c.slug }">
              <span class="cat-icon"><app-icon [name]="c.icon" /></span>
              <span class="cat-text">
                <span class="t-title-3">{{ c.name }}</span>
                <span class="t-footnote muted">{{ c.text }}</span>
              </span>
              <app-icon name="chevron-right" class="chev" />
            </a>
          }
        </div>
      </section>

      @if (featured().length) {
        <section class="container section" aria-labelledby="istaknuti">
          <div class="section-head" appReveal>
            <h2 id="istaknuti" class="t-title-2">Izdvojeni ponuđači</h2>
            <a class="btn btn-plain btn-sm" routerLink="/istrazi">Pogledaj sve <app-icon name="chevron-right" /></a>
          </div>
          <div class="rail" appReveal="stagger" [revealDelay]="60">
            @for (v of featured(); track v.id) {
              <app-vendor-card [vendor]="v" />
            }
          </div>
        </section>
      }

      <section class="container section">
        <div class="planner card" appReveal>
          <div class="planner-copy">
            <span class="badge badge-accent"><app-icon name="sparkles" /> Planer vjenčanja</span>
            <h2 class="t-title-1 serif">Recite nam budžet, mi složimo paket.</h2>
            <p class="muted">
              Odaberite usluge, unesite budžet, grad i datum. Planer raspodijeli novac po kategorijama i predloži
              najbolje ocijenjene ponuđače koji staju u okvir. Svaki prijedlog možete zamijeniti jednim dodirom.
            </p>
            <a class="btn btn-magic btn-lg" routerLink="/planiranje"><app-icon name="sparkles" /> Složi mi paket</a>
          </div>
          <ol class="planner-steps" appReveal="stagger" [revealDelay]="180">
            <li><span class="num">1</span><div><strong>Usluge</strong><p class="t-footnote muted">Sala, fotograf, vjenčanica…</p></div></li>
            <li><span class="num">2</span><div><strong>Budžet i grad</strong><p class="t-footnote muted">Okvirno, ne mora biti tačno.</p></div></li>
            <li><span class="num">3</span><div><strong>Vaš paket</strong><p class="t-footnote muted">Sa procjenom ukupne cijene.</p></div></li>
          </ol>
        </div>
      </section>

      <section class="container section" aria-labelledby="kako">
        <app-landing-steps />
      </section>

      <section class="container section" id="saloni" aria-labelledby="za-salone">
        <div class="vendors card" appReveal>
          <div class="vendors-copy">
            <p class="t-eyebrow">Za salone i ponuđače</p>
            <h2 id="za-salone" class="t-title-1">Neka vas mladenci pronađu.</h2>
            <ul class="benefits">
              <li><app-icon name="check-circle" /> Vlastita stranica sa galerijom, cjenovnikom i radnim vremenom</li>
              <li><app-icon name="check-circle" /> Upiti i rezervacije na jednom mjestu, uz automatsku ili ručnu potvrdu</li>
              <li><app-icon name="check-circle" /> Recenzije koje grade povjerenje</li>
              <li><app-icon name="check-circle" /> Više kategorija na jednom nalogu (npr. frizer i make-up)</li>
            </ul>
            <a class="btn btn-primary btn-lg" routerLink="/za-salone">Registrujte salon besplatno</a>
            <p class="t-footnote muted">Prijava Google nalogom, a stranicu postavljate sami za par minuta. Ne stignete? Ostavite nam broj i postavićemo je za vas.</p>
          </div>
          <form class="lead-form stack" (ngSubmit)="sendLead()" #leadForm="ngForm">
            <div class="field">
              <label for="l-name">Naziv salona</label>
              <input id="l-name" class="input" name="name" required minlength="2" maxlength="150" [(ngModel)]="lead.name"
                autocomplete="organization" #leadName="ngModel" />
              @if (leadName.invalid && leadName.touched) { <span class="error">Unesite naziv salona (najmanje 2 znaka).</span> }
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="l-cat">Usluga</label>
                <select id="l-cat" class="select" name="category" [(ngModel)]="lead.category">
                  @for (c of categories; track c.slug) { <option [value]="c.name">{{ c.name }}</option> }
                  <option value="Drugo">Drugo</option>
                </select>
              </div>
              <div class="field">
                <label for="l-city">Grad</label>
                <input id="l-city" class="input" name="city" required [pattern]="cityPattern" maxlength="100" [(ngModel)]="lead.city"
                  autocomplete="address-level2" #leadCity="ngModel" />
                @if (leadCity.invalid && (leadCity.touched || leadCity.dirty)) {
                  <span class="error">{{ leadCity.errors?.['pattern'] ? 'Naziv grada može sadržavati samo slova.' : 'Unesite grad.' }}</span>
                }
              </div>
            </div>
            <div class="field">
              <label for="l-phone">Telefon</label>
              <input id="l-phone" class="input" name="phone" type="tel" required [pattern]="phonePattern" [(ngModel)]="lead.phone"
                autocomplete="tel" inputmode="tel" #leadPhone="ngModel" />
              @if (leadPhone.invalid && (leadPhone.touched || leadPhone.dirty)) {
                <span class="error">Unesite broj telefona (npr. +387 61 123 456).</span>
              }
            </div>
            <button type="submit" class="btn btn-block" [disabled]="leadForm.invalid">Postavite salon za mene</button>
            <p class="t-caption subtle">Javljamo se u roku od jednog radnog dana.</p>
          </form>
        </div>
      </section>

      <section class="container section narrow" aria-labelledby="faq">
        <app-landing-faq />
      </section>
    </main>

    <footer class="footer">
      <div class="container footer-grid">
        <div class="stack-sm">
          <app-brand-mark />
          <p class="t-footnote muted">{{ brand.tagline }}</p>
        </div>
        <nav class="footer-links t-footnote" aria-label="Podnožje">
          <a routerLink="/istrazi">Istraži</a>
          <a routerLink="/planiranje">Planer</a>
          <a href="#saloni">Za salone</a>
          <a routerLink="/uslovi">Uslovi</a>
          <a routerLink="/privatnost">Privatnost</a>
          <a [href]="'mailto:' + brand.email">{{ brand.email }}</a>
        </nav>
        <p class="t-caption subtle">© {{ year }} {{ brand.name }}</p>
      </div>
    </footer>
  `,
  styles: `
    // isolation: latice i linija (z-index −1) ostaju iza sadržaja, a iznad pozadine stranice.
    :host {
      display: block;
      isolation: isolate;
    }

    main {
      position: relative;
    }

    .nav {
      position: sticky;
      top: 0;
      z-index: 10;
      height: var(--nav-height);
      box-shadow: none;
      transition: box-shadow var(--dur-base) ease;
    }

    .nav.scrolled {
      box-shadow: 0 1px 0 var(--separator);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      height: 100%;
    }

    .brand {
      display: inline-flex;
    }

    .links {
      display: none;
      gap: var(--space-1);
    }

    .links a {
      padding: 0.4rem 0.8rem;
      border-radius: var(--radius-full);
      color: var(--text-secondary);
      font-size: 0.9375rem;
      font-weight: 500;
      transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease;
    }

    .links a:hover {
      color: var(--text);
      background: var(--fill);
    }

    .actions {
      margin-left: auto;
      gap: var(--space-1);
    }

    // ---- Hero ----
    .hero {
      padding-block: clamp(2.5rem, 7vw, 5.5rem) clamp(2rem, 5vw, 4rem);
      background:
        radial-gradient(60rem 30rem at 85% -10%, var(--accent-soft), transparent 70%),
        radial-gradient(40rem 24rem at 0% 0%, var(--sage-soft), transparent 70%);
    }

    .hero-grid {
      display: grid;
      gap: var(--space-7);
      align-items: center;
    }

    .hero-copy {
      display: grid;
      gap: var(--space-4);
      max-width: 40rem;
    }

    // Ulaz naslova redom: nadnaslov, naslov, tekst, pretraga.
    .hero-copy > * {
      animation: hero-in 620ms var(--ease-out) both;
    }

    .hero-copy > :nth-child(2) { animation-delay: 70ms; }
    .hero-copy > :nth-child(3) { animation-delay: 140ms; }
    .hero-copy > :nth-child(4) { animation-delay: 210ms; }
    .hero-copy > :nth-child(5) { animation-delay: 280ms; }

    @keyframes hero-in {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
    }
    // Zarez ostaje uz riječ sa potezom pera (inače na telefonu pređe u novi red).
    .nowrap {
      white-space: nowrap;
    }

    .lead {
      font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .search {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: var(--space-1);
      margin-top: var(--space-3);
      padding: var(--space-2);
      border-radius: var(--radius-xl);
      background: var(--material-thick);
      box-shadow: var(--shadow-md), inset 0 1px 0 var(--material-edge);
    }

    .search-field {
      flex: 1 1 10rem;
      display: grid;
      gap: 0.125rem;
      padding: 0.375rem var(--space-4);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: background-color var(--dur-fast) ease;
    }

    .search-field:hover,
    .search-field:focus-within {
      background: var(--fill);
    }

    .search-field select {
      width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      outline: none;
    }

    .divider {
      width: 1px;
      margin-block: var(--space-2);
      background: var(--separator);
    }

    .search-btn {
      flex: 1 1 100%;
      min-height: 3rem;
      border-radius: var(--radius-lg);
    }

    .planner-hint a {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-weight: 600;
    }

    .planner-hint app-icon {
      width: 0.95rem;
      height: 0.95rem;
    }

    // Kolaž: stvarne fotografije ponuđača kad su dostupne, inače mirne pločice kategorija.
    .collage {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      grid-template-rows: repeat(6, minmax(0, 3.2rem));
      gap: var(--space-3);
    }

    .tile {
      position: relative;
      overflow: hidden;
      container-type: size;
      border-radius: var(--radius-lg);
      background: linear-gradient(160deg, var(--bg-elevated), var(--bg-sunken));
      box-shadow: var(--shadow-md);
      animation: tile-in 600ms var(--ease-out) both;
    }

    .t0 { grid-column: 1 / 5; grid-row: 1 / 5; animation-delay: 60ms; }
    .t1 { grid-column: 5 / 7; grid-row: 1 / 4; animation-delay: 140ms; }
    .t2 { grid-column: 5 / 7; grid-row: 4 / 7; animation-delay: 220ms; }
    .t3 { grid-column: 1 / 5; grid-row: 5 / 7; animation-delay: 300ms; }

    .tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    // Fotografija se po učitavanju jednom "smjesti" u okvir (blago približena pa na mjesto), bez ponavljanja.
    .tile img.is-loaded {
      animation: settle 1400ms var(--ease-out) both;
    }

    @keyframes settle {
      from {
        transform: scale(1.08);
      }
    }

    .tile-icon {
      display: grid;
      place-items: center;
      height: 100%;
    }

    .tile-label {
      position: absolute;
      left: var(--space-2);
      bottom: var(--space-2);
      padding: 0.25rem 0.625rem;
      border-radius: var(--radius-full);
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-thin);
      backdrop-filter: var(--blur-thin);
      font-size: 0.75rem;
      font-weight: 600;
    }

    @keyframes tile-in {
      from {
        opacity: 0;
        transform: translateY(14px) scale(0.98);
      }
    }

    // ---- Sekcije ----
    .section {
      display: grid;
      gap: var(--space-5);
      padding-block: var(--space-6);
    }

    .narrow {
      max-width: 52rem;
    }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .categories {
      display: grid;
      gap: var(--space-3);
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
    }

    .category {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      color: inherit;
      transition:
        transform var(--dur-press) ease-out,
        box-shadow var(--dur-base) var(--ease-out);
    }

    .category:hover {
      box-shadow: var(--shadow-md);
    }

    .category:active {
      transform: scale(0.98);
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
      transition:
        transform var(--dur-base) var(--ease-out),
        background-color var(--dur-fast) ease;
    }

    // Ikona se pod mišem blago podigne i nagne prema kursoru: kategorija "odgovara" prije klika.
    @media (hover: hover) and (pointer: fine) {
      .category:hover .cat-icon {
        transform: translateY(-2px) rotate(-6deg);
        background: color-mix(in srgb, var(--accent) 16%, transparent);
      }
    }

    .cat-text {
      display: grid;
      flex: 1;
      gap: 0.125rem;
    }

    .chev {
      width: 1rem;
      height: 1rem;
      color: var(--text-tertiary);
      transition: transform var(--dur-fast) var(--ease-out);
    }

    .category:hover .chev {
      transform: translateX(2px);
    }

    // Vodoravni niz koji se prevlači; poravnanje na kartice, rub nestaje mekano.
    .rail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(16rem, 20rem);
      gap: var(--space-4);
      overflow-x: auto;
      margin-inline: calc(-1 * var(--space-4));
      padding: var(--space-1) var(--space-4) var(--space-3);
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--space-4);
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .rail::-webkit-scrollbar {
      display: none;
    }

    .rail > * {
      scroll-snap-align: start;
    }

    .planner {
      display: grid;
      gap: var(--space-6);
      padding: clamp(var(--space-5), 4vw, var(--space-7));
      border-radius: var(--radius-xl);
      background:
        radial-gradient(36rem 20rem at 100% 0%, var(--accent-soft), transparent 70%),
        radial-gradient(28rem 18rem at 0% 100%, var(--sage-soft), transparent 70%),
        var(--bg-elevated);
    }

    .planner-copy {
      display: grid;
      justify-items: start;
      gap: var(--space-4);
      max-width: 36rem;
    }

    .badge app-icon {
      width: 0.85rem;
      height: 0.85rem;
    }

    .planner-steps {
      display: grid;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .planner-steps li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--material-regular);
      box-shadow: var(--shadow-sm), inset 0 1px 0 var(--material-edge);
    }

    .num {
      display: grid;
      place-items: center;
      flex: none;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--text);
      color: var(--bg);
      font-weight: 700;
      font-size: 0.8125rem;
    }

    .vendors {
      display: grid;
      gap: var(--space-6);
      padding: clamp(var(--space-5), 4vw, var(--space-7));
      border-radius: var(--radius-xl);
    }

    .vendors-copy {
      display: grid;
      gap: var(--space-4);
      align-content: start;
    }

    .benefits {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .benefits li {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
    }

    .benefits app-icon {
      color: var(--success);
      margin-top: 0.1rem;
    }

    .lead-form {
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      background: var(--bg-sunken);
    }

    .footer {
      margin-top: var(--space-6);
      padding-block: var(--space-6) calc(var(--space-7) + var(--safe-bottom));
      border-top: 1px solid var(--separator);
    }

    .footer-grid {
      display: grid;
      gap: var(--space-5);
    }

    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-5);
    }

    .footer-links a {
      color: var(--text-secondary);
    }

    .footer-links a:hover {
      color: var(--text);
    }

    @media (min-width: 40rem) {
      .search {
        flex-wrap: nowrap;
        border-radius: var(--radius-full);
      }

      .search-field {
        border-radius: var(--radius-full);
      }

      .search-btn {
        flex: none;
        border-radius: var(--radius-full);
        padding-inline: 1.5rem;
      }
    }

    @media (min-width: 48rem) {
      .links {
        display: flex;
      }

      .rail {
        margin-inline: 0;
        padding-inline: 0;
        scroll-padding-inline: 0;
      }
    }

    @media (min-width: 60rem) {
      .hero-grid {
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      }

      .planner,
      .vendors {
        grid-template-columns: 1.2fr 1fr;
        align-items: center;
      }

      .footer-grid {
        grid-template-columns: 1fr auto;
        align-items: center;
      }
    }

    @media (max-width: 59.99rem) {
      .collage {
        grid-template-rows: repeat(6, minmax(0, 2.4rem));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero-copy > * {
        animation: tile-fade var(--dur-fast) ease both;
        animation-delay: 0ms !important;
      }

      .tile {
        animation: tile-fade var(--dur-fast) ease both;
        animation-delay: 0ms !important;
      }

      .tile img.is-loaded {
        animation: none;
      }
      .cat-icon {
        transition: none;
      }

      .category:hover .cat-icon {
        transform: none;
      }

      @keyframes tile-fade {
        from {
          opacity: 0;
        }
      }
    }
  `,
  host: {
    '(window:scroll)': 'onScroll()',
  },
})
export class Landing implements OnInit {
  protected readonly lookups = inject(LookupStore);
  private readonly vendorApi = inject(VendorApi);
  private readonly router = inject(Router);

  protected readonly brand = BRAND;
  protected readonly year = new Date().getFullYear();
  protected readonly categories = CATEGORIES;
  protected readonly featured = signal<Vendor[]>([]);
  protected readonly scrolled = signal(false);

  protected category = '';
  protected cityId: number | null = null;
  protected lead = { name: '', category: CATEGORIES[0].name, city: '', phone: '' };
  protected readonly cityPattern = "^[A-Za-zČčĆćĐđŠšŽž]+(?:[ .\\-][A-Za-zČčĆćĐđŠšŽž]+)*$";
  protected readonly phonePattern = '^\\+?[0-9 ()/\\-]{8,20}$';

  /** Četiri pločice kolaža: fotografije istaknutih ponuđača, a dok ih nema, kategorije. */
  protected readonly collage = computed(() => {
    const photos = this.featured()
      .map((v) => ({ image: (v.images.find((i) => i.isCover) ?? v.images[0])?.url ?? null, label: v.name, icon: 'image' }))
      .filter((t) => t.image);
    const fallback = CATEGORIES.slice(0, 4).map((c) => ({ image: null, label: c.name, icon: c.icon }));
    return photos.length >= 4 ? photos.slice(0, 4) : fallback;
  });

  ngOnInit(): void {
    this.lookups.ensureLoaded(false, true);
    // Istaknuti prvi (backend sortira po pretplati, pa ocjeni). Ako API traži prijavu, sekcija se ne prikazuje.
    const context = new HttpContext().set(SKIP_AUTH_REDIRECT, true).set(SKIP_ERROR_TOAST, true);
    this.vendorApi.list({ pageSize: 8 }, context).subscribe({
      next: (r) => this.featured.set(r.items),
      error: () => this.featured.set([]),
    });
  }

  protected onScroll(): void {
    const scrolled = window.scrollY > 4;
    if (scrolled !== this.scrolled()) this.scrolled.set(scrolled);
  }

  protected search(): void {
    void this.router.navigate(['/istrazi'], {
      queryParams: { kategorija: this.category || null, grad: this.cityId },
    });
  }

  /** @TODO backend: endpoint za upite salona; do tada se upit šalje e-mailom sa popunjenim podacima. */
  protected sendLead(): void {
    const { name, category, city, phone } = this.lead;
    const subject = `Upit salona: ${name}`;
    const body = `Naziv: ${name}\nUsluga: ${category}\nGrad: ${city}\nTelefon: ${phone}\n`;
    location.href = `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
}
