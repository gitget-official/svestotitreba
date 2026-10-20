import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { VendorApi } from '../../core/api';
import { FavoritesService } from '../../core/favorites';
import { formatDate, formatPrice, formatPriceRange, plural, todayIso } from '../../core/format';
import { vendorLink } from '../../core/links';
import { LookupStore } from '../../core/lookups';
import { ServiceCategory, Vendor } from '../../core/models';
import { PlanItem, PlanStore } from '../../core/plan-store';
import { Plan, PlanAnswers, PlanOption, buildPlan } from '../../core/planner';
import { DateField } from '../../shared/ui/date-time-fields';
import { Icon, categoryIcon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast';


const DEFAULT_SLUGS = ['saloni-za-vjencanje', 'vjencanice-i-odijela', 'fotografi', 'dekoracije'];
const BUDGET_PRESETS = [10000, 20000, 30000, 50000];

/**
 * Planiranje vjenčanja (FR-24 – FR-28): vođeni upitnik u tri koraka i prijedlog cijelog paketa.
 * Algoritam je u core/planner.ts; izabrani paket živi u PlanStore ("Moj plan", FR-27).
 */
@Component({
  selector: 'app-planning',
  imports: [FormsModule, RouterLink, Icon, DateField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page planner">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Planer vjenčanja</h1>
          <p class="muted">Tri kratka koraka do prijedloga cijelog paketa, u okviru vašeg budžeta.</p>
        </div>
        @if (step() === 2) {
          <button type="button" class="btn" (click)="restart()"><app-icon name="refresh" /> Ispočetka</button>
        }
      </header>

      <ol class="progress" aria-label="Koraci">
        @for (label of stepLabels; track label; let i = $index) {
          <li [class.done]="i < step()" [class.current]="i === step()" [attr.aria-current]="i === step() ? 'step' : null">
            <button type="button" [disabled]="i > maxStep()" (click)="goTo(i)">
              <span class="dot">@if (i < step()) { <app-icon name="check" [strokeWidth]="2.5" /> } @else { {{ i + 1 }} }</span>
              <span class="label">{{ label }}</span>
            </button>
          </li>
        }
      </ol>

      @switch (step()) {
        @case (0) {
          <section [class]="'step ' + direction()" aria-labelledby="s1">
            <h2 id="s1" class="t-title-2">Koje usluge vam trebaju?</h2>
            <p class="muted">Odaberite sve što planirate. Kasnije možete dodati ili ukloniti.</p>
            @if (!lookups.categories().length) {
              <div class="choices">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton choice-skeleton"></div> }
              </div>
            } @else {
              <div class="choices" role="group" aria-label="Usluge">
                @for (c of lookups.categories(); track c.id) {
                  <button type="button" class="choice" [class.on]="isChosen(c.id)" [attr.aria-pressed]="isChosen(c.id)"
                    (click)="toggleCategory(c.id)">
                    <span class="choice-icon"><app-icon [name]="icon(c.slug)" /></span>
                    <span class="choice-name">{{ c.name }}</span>
                    <span class="tick"><app-icon name="check" [strokeWidth]="2.5" /></span>
                  </button>
                }
              </div>
            }
            <div class="step-actions">
              <span class="t-footnote muted">{{ answers().categoryIds.length }} odabrano</span>
              <button type="button" class="btn btn-primary btn-lg" [disabled]="!answers().categoryIds.length" (click)="goTo(1)">
                Dalje <app-icon name="arrow-right" />
              </button>
            </div>
          </section>
        }

        @case (1) {
          <section [class]="'step ' + direction()" aria-labelledby="s2">
            <h2 id="s2" class="t-title-2">Budžet, grad i datum</h2>
            <p class="muted">Okvirno je dovoljno. Planer raspoređuje budžet po kategorijama prema uobičajenim udjelima.</p>

            <div class="card card-pad stack">
              <div class="field">
                <label for="p-budget">Ukupni budžet</label>
                <div class="budget">
                  <input id="p-budget" class="input budget-input" type="number" min="1000" step="500" inputmode="numeric"
                    [ngModel]="answers().budget" (ngModelChange)="patch({ budget: +$event || 0 })" />
                  <span class="unit">KM</span>
                </div>
                @if (budgetError(); as e) { <span class="error" role="alert">{{ e }}</span> }
                <input class="range" type="range" min="3000" max="100000" step="500" aria-label="Budžet klizač"
                  [ngModel]="answers().budget" (ngModelChange)="patch({ budget: +$event })" />
                <div class="row-wrap">
                  @for (preset of presets; track preset) {
                    <button type="button" class="chip" [class.is-active]="answers().budget === preset" (click)="patch({ budget: preset })">
                      {{ price(preset) }}
                    </button>
                  }
                </div>
              </div>

              <div class="form-grid">
                <div class="field">
                  <label for="p-city">Grad</label>
                  <select id="p-city" class="select" [ngModel]="answers().cityId" (ngModelChange)="patch({ cityId: $event })">
                    <option [ngValue]="null">Cijela BiH</option>
                    @for (city of lookups.cities(); track city.id) { <option [ngValue]="city.id">{{ city.name }}</option> }
                  </select>
                </div>
                <div class="field">
                  <label for="p-date">Datum vjenčanja <span class="subtle">(opciono)</span></label>
                  <app-date-field inputId="p-date" [min]="today" [ngModel]="answers().date"
                    (ngModelChange)="patch({ date: $event || null })" />
                </div>
                <div class="field">
                  <label for="p-guests">Broj gostiju <span class="subtle">(opciono)</span></label>
                  <input id="p-guests" class="input" type="number" min="1" inputmode="numeric" [ngModel]="answers().guests"
                    (ngModelChange)="patch({ guests: $event === null || $event === '' ? null : +$event })" />
                  @if (guestsError(); as e) {
                    <span class="error" role="alert">{{ e }}</span>
                  } @else {
                    <span class="hint">Pomaže pri razgovoru sa salom; cijena sale često zavisi od broja gostiju.</span>
                  }
                </div>
              </div>
            </div>

            <div class="step-actions">
              <button type="button" class="btn btn-plain" (click)="goTo(0)"><app-icon name="arrow-left" /> Nazad</button>
              <button type="button" class="btn btn-primary btn-lg" [disabled]="!!budgetError() || !!guestsError()" (click)="compose()">
                <app-icon name="sparkles" /> Složi paket
              </button>
            </div>
          </section>
        }

        @case (2) {
          <section [class]="'step ' + direction()" aria-labelledby="s3" aria-live="polite">
            <h2 id="s3" class="sr-only">Vaš paket</h2>
            @if (loading()) {
              <div class="skeleton summary-skeleton"></div>
              @for (i of skeletonLines(); track i) { <div class="skeleton line-skeleton"></div> }
            } @else if (plan(); as p) {
              <div class="summary card">
                <div class="summary-head">
                  <div>
                    <p class="t-caption muted">Procjena ukupno</p>
                    <p class="t-title-1 total">{{ range(p.totalFrom, p.totalTo) }}</p>
                  </div>
                  @switch (fit()) {
                    @case ('over') { <span class="badge badge-warning">Iznad budžeta za {{ price(overBy()) }}</span> }
                    @case ('maybe') { <span class="badge badge-gold">Početne cijene staju u budžet</span> }
                    @default { <span class="badge badge-success">U okviru budžeta</span> }
                  }
                </div>
                <div class="meter" role="meter" [attr.aria-valuenow]="p.totalFrom" aria-valuemin="0" [attr.aria-valuemax]="p.budget"
                  aria-label="Iskorišteno od budžeta">
                  <span class="fill" [class.over]="overBy() > 0" [style.transform]="'scaleX(' + meter() + ')'"></span>
                </div>
                <p class="t-footnote muted">
                  Budžet {{ price(p.budget) }}
                  @if (cityName()) { · {{ cityName() }} }
                  @if (answers().date) { · {{ date(answers().date!) }} }
                  @if (answers().guests) { · {{ answers().guests }} gostiju }
                </p>
              </div>

              <div class="lines">
                @for (line of p.lines; track line.category.id) {
                  <article class="line card">
                    <header class="line-head">
                      <span class="choice-icon small"><app-icon [name]="icon(line.category.slug)" /></span>
                      <h3 class="t-title-3">{{ line.category.name }}</h3>
                      <span class="t-footnote muted alloc">do ~{{ price(round(line.allocation)) }}</span>
                    </header>

                    @if (line.choice; as c) {
                      <a class="pick" [routerLink]="link(c.vendor)">
                        <span class="thumb">
                          @if (cover(c.vendor); as url) { <img [src]="url" alt="" loading="lazy" decoding="async" /> }
                        </span>
                        <span class="pick-info">
                          <strong>{{ c.vendor.name }}</strong>
                          <span class="t-footnote muted">
                            {{ c.vendor.cityName }}
                            @if (c.vendor.averageRating) { · ★ {{ c.vendor.averageRating.toFixed(1) }} }
                            · {{ c.offeringTitle }}
                          </span>
                        </span>
                        <span class="pick-price">
                          <strong>{{ range(c.priceFrom, c.priceTo) }}</strong>
                          @if (c.overBudget) { <span class="t-caption warn">iznad dijela budžeta</span> }
                        </span>
                      </a>

                      @if (line.alternatives.length) {
                        <button type="button" class="btn btn-plain btn-sm swap" [attr.aria-expanded]="isOpen(line.category.id)"
                          (click)="toggleOpen(line.category.id)">
                          {{ isOpen(line.category.id) ? 'Sakrij' : 'Zamijeni' }} ({{ line.alternatives.length }})
                          <app-icon name="chevron-down" class="chev" [class.up]="isOpen(line.category.id)" />
                        </button>
                        @if (isOpen(line.category.id)) {
                          <ul class="alternatives">
                            @for (alt of line.alternatives; track alt.vendor.id) {
                              <li>
                                <button type="button" class="alt" (click)="choose(line.category.id, alt)">
                                  <span class="pick-info">
                                    <strong>{{ alt.vendor.name }}</strong>
                                    <span class="t-footnote muted">
                                      {{ alt.vendor.cityName }}
                                      @if (alt.vendor.averageRating) { · ★ {{ alt.vendor.averageRating.toFixed(1) }} }
                                    </span>
                                  </span>
                                  <span class="pick-price">
                                    <span>{{ range(alt.priceFrom, alt.priceTo) }}</span>
                                    <span class="t-caption" [class.cheaper]="alt.priceFrom < c.priceFrom" [class.warn]="alt.priceFrom > c.priceFrom">
                                      {{ diff(alt.priceFrom - c.priceFrom) }}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            }
                          </ul>
                        }
                      }
                    } @else {
                      <div class="none">
                        <p class="muted">Nema ponuđača za ovu uslugu{{ answers().cityId ? ' u odabranom gradu' : '' }}{{ answers().date ? ' za taj datum' : '' }}.</p>
                        <a class="btn btn-tinted btn-sm" routerLink="/istrazi" [queryParams]="{ kategorija: line.category.id }">Pogledaj sve</a>
                      </div>
                    }
                  </article>
                }
              </div>

              <div class="plan-actions">
                <button type="button" class="btn" (click)="goTo(1)"><app-icon name="edit" /> Uredi odgovore</button>
                <span class="spacer"></span>
                <button type="button" class="btn btn-tinted" (click)="saveAll()" [disabled]="!chosenVendors().length">
                  <app-icon name="heart" /> Dodaj sve u Sačuvano
                </button>
                <button type="button" class="btn btn-primary" (click)="savePlan()">
                  <app-icon name="check" /> {{ savedAt() ? 'Sačuvaj izmjene' : 'Sačuvaj plan' }}
                </button>
              </div>
              <p class="t-caption subtle disclaimer">
                Prijedlog se zasniva na okvirnim cijenama i ocjenama ponuđača na platformi. Konačnu cijenu dogovarate sa salonom.
                @if (savedAt(); as at) { Plan je sačuvan {{ date(at) }}. }
              </p>
            }
          </section>
        }
      }
    </div>
  `,
  styles: `
    .planner {
      max-width: 56rem;
    }

    .progress {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-2);
      margin: 0 0 var(--space-6);
      padding: 0;
      list-style: none;
    }

    .progress button {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-2) 0 0;
      border: 0;
      border-top: 3px solid var(--fill-strong);
      background: none;
      color: var(--text-tertiary);
      font-size: 0.875rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: color var(--dur-fast) ease, border-color var(--dur-base) var(--ease-out);
    }

    .progress button:disabled {
      cursor: default;
    }

    .progress .done button,
    .progress .current button {
      border-top-color: var(--accent);
      color: var(--text);
    }

    .dot {
      display: grid;
      place-items: center;
      flex: none;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--fill-strong);
      font-size: 0.75rem;
    }

    .dot app-icon {
      width: 0.85rem;
      height: 0.85rem;
    }

    .done .dot,
    .current .dot {
      background: var(--accent);
      color: var(--text-on-accent);
    }

    // Prelaz između koraka: naprijed ulazi zdesna, nazad slijeva (prostorna dosljednost).
    .step {
      display: grid;
      gap: var(--space-4);
    }

    .forward {
      animation: from-right var(--dur-base) var(--ease-out) both;
    }

    .back {
      animation: from-left var(--dur-base) var(--ease-out) both;
    }

    @keyframes from-right {
      from {
        opacity: 0;
        transform: translateX(16px);
      }
    }

    @keyframes from-left {
      from {
        opacity: 0;
        transform: translateX(-16px);
      }
    }

    .choices {
      display: grid;
      gap: var(--space-3);
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
    }

    .choice-skeleton {
      height: 4.25rem;
      border-radius: var(--radius-lg);
    }

    .choice {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 4.25rem;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--separator);
      border-radius: var(--radius-lg);
      background: var(--bg-elevated);
      text-align: left;
      font-weight: 600;
      cursor: pointer;
      transition:
        transform var(--dur-press) ease-out,
        border-color var(--dur-fast) ease,
        box-shadow var(--dur-fast) ease,
        background-color var(--dur-fast) ease;
    }

    .choice:active {
      transform: scale(0.97);
    }

    .choice.on {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--bg-elevated));
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .choice-icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-md);
      background: var(--accent-soft);
      color: var(--accent);
    }

    .choice-icon.small {
      width: 2rem;
      height: 2rem;
    }

    .choice-icon.small app-icon {
      width: 1.1rem;
      height: 1.1rem;
    }

    .choice-name {
      flex: 1;
    }

    .tick {
      display: grid;
      place-items: center;
      width: 1.375rem;
      height: 1.375rem;
      border-radius: 50%;
      border: 1.5px solid var(--separator);
      color: transparent;
      transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease, border-color var(--dur-fast) ease;
    }

    .tick app-icon {
      width: 0.8rem;
      height: 0.8rem;
    }

    .on .tick {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--text-on-accent);
    }

    .step-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-top: var(--space-3);
    }

    .budget {
      position: relative;
    }

    .budget-input {
      padding-right: 3rem;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
    }

    .unit {
      position: absolute;
      right: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
      font-weight: 600;
    }

    .range {
      width: 100%;
      accent-color: var(--accent);
    }

    .summary {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
      margin-bottom: var(--space-4);
    }

    .summary-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .total {
      font-variant-numeric: tabular-nums;
    }

    .meter {
      height: 0.5rem;
      border-radius: var(--radius-full);
      background: var(--fill-strong);
      overflow: hidden;
    }

    .fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--success);
      transform-origin: left;
      transition: transform 500ms var(--ease-out), background-color var(--dur-fast) ease;
    }

    .fill.over {
      background: var(--warning);
    }

    .summary-skeleton {
      height: 9rem;
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
    }

    .line-skeleton {
      height: 6.5rem;
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-3);
    }

    .lines {
      display: grid;
      gap: var(--space-3);
    }

    .line {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    .line-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .line-head h3 {
      flex: 1;
    }

    .pick,
    .alt {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-2);
      border: 0;
      border-radius: var(--radius-md);
      background: var(--fill);
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: transform var(--dur-press) ease-out, background-color var(--dur-fast) ease;
    }

    .pick:hover,
    .alt:hover {
      background: var(--fill-strong);
    }

    .pick:active,
    .alt:active {
      transform: scale(0.985);
    }

    .thumb {
      flex: none;
      width: 3.5rem;
      height: 3.5rem;
      overflow: hidden;
      border-radius: var(--radius-sm);
      background: var(--bg-sunken);
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .pick-info {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    .pick-info .t-footnote {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .pick-price {
      display: grid;
      justify-items: end;
      flex: none;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .warn {
      color: var(--warning);
    }

    .cheaper {
      color: var(--success);
    }

    .swap {
      justify-self: start;
    }

    .chev {
      width: 0.95rem;
      height: 0.95rem;
      transition: transform var(--dur-fast) var(--ease-out);
    }

    .chev.up {
      transform: rotate(180deg);
    }

    .alternatives {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
      animation: from-top var(--dur-base) var(--ease-out) both;
    }

    @keyframes from-top {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }

    .alt {
      background: transparent;
      border: 1px dashed var(--separator);
    }

    .none {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .plan-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-5);
    }

    .disclaimer {
      margin-top: var(--space-3);
    }

    @media (max-width: 39.99rem) {
      // Na uskom ekranu cijena ide ispod naziva, da naziv ne puca u tri reda.
      .pick,
      .alt {
        flex-wrap: wrap;
      }

      .pick-info {
        flex-basis: calc(100% - 4.5rem);
      }

      .pick .pick-price {
        justify-items: start;
        margin-left: calc(3.5rem + var(--space-3));
        text-align: left;
      }

      .alt .pick-price {
        justify-items: start;
        text-align: left;
      }

      .progress .label {
        display: none;
      }

      .progress .current .label {
        display: inline;
      }

      .plan-actions .btn {
        flex: 1 1 100%;
      }

      .plan-actions .spacer {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .forward,
      .back,
      .alternatives {
        animation: fade var(--dur-fast) ease both;
      }

      .fill {
        transition: none;
      }

      @keyframes fade {
        from {
          opacity: 0;
        }
      }
    }
  `,
})
export class Planning implements OnInit {
  protected readonly lookups = inject(LookupStore);
  private readonly vendorApi = inject(VendorApi);
  private readonly favorites = inject(FavoritesService);
  private readonly toasts = inject(ToastService);
  protected readonly store = inject(PlanStore);

  protected readonly stepLabels = ['Usluge', 'Budžet i grad', 'Vaš paket'];
  protected readonly presets = BUDGET_PRESETS;
  protected readonly today = todayIso();
  protected readonly icon = categoryIcon;
  protected readonly price = formatPrice;
  protected readonly range = formatPriceRange;
  protected readonly link = vendorLink;
  protected readonly round = (n: number) => Math.round(n / 100) * 100;
  protected readonly date = (value: string) => formatDate(value);

  protected readonly step = signal(0);
  protected readonly maxStep = signal(0);
  protected readonly direction = signal<'forward' | 'back'>('forward');
  /** Odgovori i izbori žive u "Moj plan" (PlanStore), pa su dostupni sa svake stranice i čuvaju se sami. */
  protected readonly answers = this.store.answers;
  protected readonly picks = computed<Record<number, number>>(() =>
    Object.fromEntries(this.store.items().map((i) => [i.categoryId, i.vendorId])),
  );
  protected readonly candidates = signal<Map<number, Vendor[]>>(new Map());
  protected readonly loading = signal(false);
  protected readonly savedAt = computed(() => this.store.state().savedAt);
  private readonly open = signal<number[]>([]);
  private defaultsApplied = false;

  private readonly chosenCategories = computed<ServiceCategory[]>(() => {
    const ids = this.answers().categoryIds;
    return this.lookups.categories().filter((c) => ids.includes(c.id));
  });

  protected readonly plan = computed<Plan | null>(() => {
    if (this.step() !== 2 || this.loading()) return null;
    return buildPlan(this.chosenCategories(), this.answers().budget, this.candidates(), this.picks());
  });

  protected readonly overBy = computed(() => {
    const p = this.plan();
    return p ? Math.max(0, p.totalFrom - p.budget) : 0;
  });

  /** "maybe": početne cijene staju, ali gornja granica raspona prelazi budžet. */
  protected readonly fit = computed(() => {
    const p = this.plan();
    if (!p) return 'ok';
    if (p.totalFrom > p.budget) return 'over';
    return p.totalTo > p.budget ? 'maybe' : 'ok';
  });

  protected readonly meter = computed(() => {
    const p = this.plan();
    return p && p.budget > 0 ? Math.min(1, p.totalFrom / p.budget) : 0;
  });

  protected readonly budgetError = computed(() => {
    const b = this.answers().budget;
    if (!b || b < 1000) return 'Unesite budžet od najmanje 1.000 KM.';
    if (b > 1_000_000) return 'Budžet može biti najviše 1.000.000 KM.';
    return null;
  });

  protected readonly guestsError = computed(() => {
    const g = this.answers().guests;
    if (g === null) return null;
    if (!Number.isInteger(g) || g < 1) return 'Broj gostiju mora biti cijeli broj veći od 0.';
    if (g > 2000) return 'Najviše 2.000 gostiju.';
    return null;
  });

  protected readonly cityName = computed(
    () => this.lookups.cities().find((c) => c.id === this.answers().cityId)?.name ?? null,
  );

  protected readonly chosenVendors = computed(
    () => this.plan()?.lines.map((l) => l.choice?.vendor).filter((v): v is Vendor => !!v) ?? [],
  );

  protected readonly skeletonLines = computed(() => this.answers().categoryIds.map((_, i) => i));

  constructor() {
    // Prvi put: predloži najčešće usluge čim stignu kategorije.
    effect(() => {
      const categories = this.lookups.categories();
      untracked(() => {
        if (this.defaultsApplied || !categories.length || this.answers().categoryIds.length) return;
        this.defaultsApplied = true;
        this.patch({ categoryIds: categories.filter((c) => DEFAULT_SLUGS.includes(c.slug)).map((c) => c.id) });
      });
    });
  }

  ngOnInit(): void {
    this.lookups.ensureLoaded();
    // Postojeći plan: odmah prikaži paket (izbori su sačuvani), a odgovori se mogu urediti.
    if (this.store.count() && this.answers().categoryIds.length) {
      this.defaultsApplied = true;
      this.maxStep.set(2);
      this.compose();
    }
  }

  protected patch(change: Partial<PlanAnswers>): void {
    this.store.setAnswers({ ...this.answers(), ...change });
  }

  protected isChosen(id: number): boolean {
    return this.answers().categoryIds.includes(id);
  }

  protected toggleCategory(id: number): void {
    const ids = this.answers().categoryIds;
    this.patch({ categoryIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  }

  protected goTo(step: number): void {
    if (step === this.step()) return;
    this.direction.set(step > this.step() ? 'forward' : 'back');
    this.step.set(step);
    this.maxStep.update((m) => Math.max(m, step));
    window.scrollTo({ top: 0 });
  }

  /** Učitaj kandidate po kategoriji (grad i slobodan datum filtrira backend), pa složi plan. */
  protected compose(): void {
    const { categoryIds, cityId, date } = this.answers();
    this.goTo(2);
    this.loading.set(true);
    this.open.set([]);
    forkJoin(
      categoryIds.map((categoryId) =>
        this.vendorApi
          .list({ categoryId, cityId, availableOn: date, pageSize: 50 })
          .pipe(map((r) => [categoryId, r.items] as const)),
      ),
    ).subscribe({
      next: (entries) => {
        this.candidates.set(new Map(entries));
        this.loading.set(false);
        // Prijedlog odmah postaje "Moj plan" (ručni izbori ostaju), da korisnik ništa ne izgubi.
        const plan = buildPlan(this.chosenCategories(), this.answers().budget, this.candidates(), this.picks());
        this.store.replaceItems(
          plan.lines
            .map((l) => (l.choice ? PlanStore.itemFrom(l.choice.vendor, l.category) : null))
            .filter((i): i is PlanItem => i !== null),
        );
      },
      error: () => {
        this.loading.set(false);
        this.goTo(1);
      },
    });
  }

  protected isOpen(categoryId: number): boolean {
    return this.open().includes(categoryId);
  }

  protected toggleOpen(categoryId: number): void {
    this.open.update((list) => (list.includes(categoryId) ? list.filter((x) => x !== categoryId) : [...list, categoryId]));
  }

  protected choose(categoryId: number, option: PlanOption): void {
    const category = this.lookups.categories().find((c) => c.id === categoryId);
    const item = category ? PlanStore.itemFrom(option.vendor, category) : null;
    if (item) this.store.put(item);
    this.open.update((list) => list.filter((x) => x !== categoryId));
  }

  protected diff(value: number): string {
    if (value === 0) return 'ista cijena';
    return `${value > 0 ? '+' : '−'}${formatPrice(Math.abs(value))}`;
  }

  protected cover(v: Vendor): string | null {
    return (v.images.find((i) => i.isCover) ?? v.images[0])?.url ?? null;
  }

  protected async savePlan(): Promise<void> {
    const result = await this.store.save();
    if (result === 'server') this.toasts.success('Plan je sačuvan u vašem profilu.');
    else if (result === 'offline') this.toasts.info('Plan je sačuvan na ovom uređaju. Na server će otići kad bude dostupan.');
    else this.toasts.info('Plan je sačuvan u ovom pregledniku. Napravite profil da ga ne izgubite.');
  }

  protected saveAll(): void {
    const vendors = this.chosenVendors();
    vendors.forEach((v) => this.favorites.add(v));
    this.toasts.success(`${vendors.length} ${plural(vendors.length, 'ponuđač je dodan', 'ponuđača su dodana', 'ponuđača je dodano')} u Sačuvano.`);
  }

  protected restart(): void {
    this.store.clear();
    this.defaultsApplied = false;
    this.maxStep.set(0);
    this.goTo(0);
    const categories = this.lookups.categories();
    if (categories.length) {
      this.defaultsApplied = true;
      this.patch({ categoryIds: categories.filter((c) => DEFAULT_SLUGS.includes(c.slug)).map((c) => c.id) });
    }
  }
}
