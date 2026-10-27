import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from './icon';

type Slot = { kind: 'page'; page: number } | { kind: 'gap'; key: string };

/**
 * Paginacija: prethodna / brojevi stranica sa "…" / sljedeća, i "Prikazano 13–24 od 40".
 * Na telefonu ostaju samo susjedne stranice, da sve stane u jedan red i da su mete dovoljno velike.
 */
@Component({
  selector: 'app-pagination',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pages() > 1) {
      <nav class="pager" aria-label="Stranice rezultata">
        <button type="button" class="step" (click)="go(page() - 1)" [disabled]="page() === 1" aria-label="Nazad na prethodnu stranicu">
          <app-icon name="chevron-left" />
          <span class="step-label">Nazad</span>
        </button>

        <ol class="numbers">
          @for (slot of slots(); track slot.kind === 'page' ? slot.page : slot.key) {
            <li [class.far]="slot.kind === 'page' && isFar(slot.page)">
              @if (slot.kind === 'page') {
                <button type="button" class="num" [class.active]="slot.page === page()"
                  [attr.aria-current]="slot.page === page() ? 'page' : null" [attr.aria-label]="'Stranica ' + slot.page"
                  (click)="go(slot.page)">{{ slot.page }}</button>
              } @else {
                <span class="gap" aria-hidden="true">…</span>
              }
            </li>
          }
        </ol>

        <button type="button" class="step" (click)="go(page() + 1)" [disabled]="page() === pages()" aria-label="Dalje na sljedeću stranicu">
          <span class="step-label">Dalje</span>
          <app-icon name="chevron-right" />
        </button>
      </nav>
    }
    <p class="summary t-footnote muted" aria-live="polite">
      @if (total()) { Prikazano {{ from() }}–{{ to() }} od {{ total() }} }
    </p>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
    }

    .pager {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 0.3125rem;
      border-radius: var(--radius-full);
      background: var(--bg-elevated);
      border: 1px solid var(--separator);
      box-shadow: var(--shadow-sm);
    }

    .numbers {
      display: flex;
      align-items: center;
      gap: 0.125rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .num,
    .step {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-width: 2.5rem;
      height: 2.5rem;
      padding: 0 0.75rem;
      border: 0;
      border-radius: var(--radius-full);
      background: transparent;
      color: var(--text);
      font-size: 0.9375rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition:
        background-color var(--dur-fast) ease,
        color var(--dur-fast) ease,
        transform var(--dur-press) ease-out,
        box-shadow var(--dur-base) var(--ease-out);
    }

    .num:hover,
    .step:hover:not(:disabled) {
      background: var(--fill);
    }

    .num:active,
    .step:active:not(:disabled) {
      transform: scale(0.92);
    }

    .num.active {
      background: var(--accent);
      color: var(--text-on-accent);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent);
    }

    .step {
      color: var(--accent);
    }

    .step:disabled {
      color: var(--text-tertiary);
      cursor: default;
      opacity: 0.6;
    }

    .step app-icon {
      width: 1.1rem;
      height: 1.1rem;
    }

    .gap {
      display: inline-grid;
      place-items: center;
      width: 1.5rem;
      color: var(--text-tertiary);
    }

    .summary {
      min-height: 1.2rem;
    }

    @media (max-width: 39.99rem) {
      .step-label,
      .far {
        display: none;
      }

      .step {
        padding: 0;
      }
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => Math.min(this.total(), (this.page() - 1) * this.pageSize() + 1));
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));

  /** 1 … 4 5 [6] 7 8 … 20 */
  protected readonly slots = computed<Slot[]>(() => {
    const total = this.pages();
    const current = this.page();
    const wanted = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2]);
    const pages = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const slots: Slot[] = [];
    pages.forEach((p, i) => {
      if (i > 0 && p - pages[i - 1] > 1) slots.push({ kind: 'gap', key: `gap-${p}` });
      slots.push({ kind: 'page', page: p });
    });
    return slots;
  });

  /** Na telefonu se kriju stranice dalje od ±1 (osim prve i zadnje). */
  protected isFar(p: number): boolean {
    return Math.abs(p - this.page()) > 1 && p !== 1 && p !== this.pages();
  }

  protected go(p: number): void {
    if (p < 1 || p > this.pages() || p === this.page()) return;
    this.pageChange.emit(p);
  }
}
