import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth';
import { ChatStore } from '../../core/chat-store';
import { formatPrice, formatPriceRange, plural } from '../../core/format';
import { LookupStore } from '../../core/lookups';
import { PlanItem, PlanStore } from '../../core/plan-store';
import { FadeInImage } from '../motion/fade-in-image';
import { Icon, categoryIcon } from './icon';
import { Sheet } from './sheet';
import { ToastService } from './toast';
import { BookingStatus } from './booking-status';

/**
 * "Moj plan": dugme koje prati korisnika u donjem desnom uglu i otvara pregled svega isplaniranog.
 * Plan se čuva sam pri svakoj promjeni; "Sačuvaj" ga dodatno šalje u profil na serveru.
 */
@Component({
  selector: 'app-plan-cart',
  imports: [RouterLink, FadeInImage, Icon, Sheet, BookingStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <button type="button" class="fab plan-fab" [class.on-vendor]="onVendor()" [class.above-chat]="chat.enabled()" [class.behind-chat]="chat.expanded()"
        [class.has-items]="store.count()" [class.bump]="bump()" (animationend)="bump.set(false)"
        (click)="open.set(true)" aria-haspopup="dialog">
        <span class="fab-icon">
          <app-icon name="rings" [strokeWidth]="1.8" />
          @if (store.count()) { <span class="count">{{ store.count() }}</span> }
        </span>
        <span class="fab-text">
          <span class="fab-title">Moj plan</span>
          <span class="fab-sub">{{ store.count() ? 'od ' + price(store.totalFrom()) : 'Počnite planirati' }}</span>
          <span class="sr-only">, {{ store.count() }} {{ plural(store.count(), 'stavka', 'stavke', 'stavki') }}</span>
        </span>
      </button>
    }

    @if (open()) {
      <app-sheet title="Moj plan" (closed)="open.set(false)">
        <div class="stack">
          @if (store.count()) {
            <section class="summary">
              <div class="row-between">
                <div>
                  <p class="t-caption muted">Procjena ukupno</p>
                  <p class="total">{{ range(store.totalFrom(), store.totalTo()) }}</p>
                </div>
                @if (store.overBy() > 0) {
                  <span class="badge badge-warning">+{{ price(store.overBy()) }} iznad budžeta</span>
                } @else if (store.totalTo() > store.budget()) {
                  <span class="badge badge-gold">Početne cijene staju u budžet</span>
                } @else {
                  <span class="badge badge-success">U okviru budžeta</span>
                }
              </div>
              <div class="meter" aria-hidden="true">
                <span [class.over]="store.overBy() > 0" [style.transform]="'scaleX(' + meter() + ')'"></span>
              </div>
              <p class="t-footnote muted">Budžet {{ price(store.budget()) }} · {{ status() }}</p>
            </section>

            <ul class="items">
              @for (item of store.items(); track item.categoryId) {
                <li class="item">
                  <a class="thumb" [routerLink]="['/ponudjaci', item.vendorId + '-' + item.vendorSlug]" (click)="close()" tabindex="-1">
                    @if (item.cover) { <img appFadeIn [src]="item.cover" alt="" loading="lazy" /> } @else { <app-icon [name]="icon(item.categorySlug)" /> }
                  </a>
                  <div class="info">
                    <span class="t-caption muted">{{ item.categoryName }}</span>
                    <a class="name" [routerLink]="['/ponudjaci', item.vendorId + '-' + item.vendorSlug]" (click)="close()">{{ item.vendorName }}</a>
                    <span class="t-footnote muted">{{ range(item.priceFrom, item.priceTo) }}</span>
                    <app-booking-status class="item-status" [vendorId]="item.vendorId" [bookingEnabled]="item.bookingEnabled"
                      [link]="['/ponudjaci', item.vendorId + '-' + item.vendorSlug]" (navigated)="close()" />
                  </div>
                  <button type="button" class="icon-btn remove" (click)="remove(item)" [attr.aria-label]="'Ukloni ' + item.vendorName">
                    <app-icon name="close" />
                  </button>
                </li>
              }
              @for (c of missing(); track c.id) {
                <li class="item missing">
                  <span class="thumb"><app-icon [name]="icon(c.slug)" /></span>
                  <div class="info">
                    <span class="t-caption muted">{{ c.name }}</span>
                    <span class="name subtle">Još nije izabrano</span>
                  </div>
                  <a class="btn btn-tinted btn-sm" routerLink="/istrazi" [queryParams]="{ kategorija: c.id }" (click)="close()">Pronađi</a>
                </li>
              }
            </ul>

            <div class="actions">
              <a class="btn" routerLink="/planiranje" (click)="close()"><app-icon name="edit" /> Uredi u planeru</a>
              <button type="button" class="btn btn-primary" (click)="save()" [disabled]="store.sync() === 'saving' || !store.dirty()">
                @if (store.sync() === 'saving') { <span class="spinner"></span> } @else { <app-icon name="check" /> Sačuvaj plan }
              </button>
            </div>
          } @else {
            <div class="empty">
              <span class="empty-icon"><app-icon name="rings" [strokeWidth]="1.5" /></span>
              <h3 class="t-title-3">Vaš plan je još prazan</h3>
              <p class="muted">Neka planer složi paket po vašem budžetu, ili dodajte ponuđače sa njihove stranice dugmetom „Dodaj u plan“.</p>
              <a class="btn btn-magic" routerLink="/planiranje" (click)="close()"><app-icon name="sparkles" /> Složi mi paket</a>
              <a class="btn btn-plain" routerLink="/istrazi" (click)="close()">Istražite ponudu</a>
            </div>
          }
        </div>
      </app-sheet>
    }
  `,
  styles: `
    // Plutajuće dugme: iznad donje trake na telefonu, u uglu na desktopu.
    .fab {
      position: fixed;
      right: max(var(--space-4), env(safe-area-inset-right));
      bottom: calc(5rem + var(--safe-bottom));
      z-index: 60;
      display: inline-flex;
      align-items: center;
      gap: var(--space-3);
      padding: 0.375rem;
      border: 1px solid var(--separator);
      border-radius: var(--radius-full);
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-regular);
      backdrop-filter: var(--blur-regular);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
      color: var(--text);
      cursor: pointer;
      touch-action: manipulation;
      animation: fab-in 420ms var(--ease-out) both;
      transition: transform var(--dur-press) ease-out, box-shadow var(--dur-base) var(--ease-out);
    }

    .fab:hover {
      box-shadow: var(--shadow-lg), 0 0 0 4px var(--accent-soft), inset 0 1px 0 var(--material-edge);
    }

    .fab:active {
      transform: scale(0.95);
    }

    // Kad se nešto doda u plan, dugme kratko "primi" stavku.
    .fab.bump .fab-icon {
      animation: bump 420ms var(--ease-out);
    }

    .fab-icon {
      position: relative;
      display: grid;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: var(--accent);
      color: var(--text-on-accent);
    }

    .fab-icon app-icon {
      width: 1.375rem;
      height: 1.375rem;
    }

    .count {
      position: absolute;
      top: -0.25rem;
      right: -0.25rem;
      display: grid;
      place-items: center;
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0 0.3rem;
      border-radius: var(--radius-full);
      background: var(--gold);
      color: #fff;
      font-size: 0.6875rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 0 0 2px var(--bg-elevated);
    }

    // Na telefonu se tekst ne vidi (samo ikona), ali ga čitač ekrana i dalje čita kao natpis dugmeta.
    .fab-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      padding-right: var(--space-3);
      text-align: left;
    }

    .fab-title {
      display: block;
      font-weight: 650;
      font-size: 0.9375rem;
      line-height: 1.2;
    }

    .fab-sub {
      display: block;
      font-size: 0.75rem;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    @keyframes fab-in {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.9);
      }
    }

    // Na telefonu i tabletu stranica ponuđača ima plutajuću traku "Rezerviši" (vidi vendor-detail).
    @media (max-width: 59.99rem) {
      .fab.on-vendor {
        display: none;
      }
    }

    @keyframes bump {
      35% {
        transform: scale(1.18);
      }
    }

    @media (min-width: 48rem) {
      .fab {
        right: max(var(--space-6), env(safe-area-inset-right));
        bottom: calc(var(--space-6) + var(--safe-bottom));
        transition:
          transform var(--dur-press) ease-out,
          box-shadow var(--dur-base) var(--ease-out),
          opacity var(--dur-base) var(--ease-out),
          visibility var(--dur-base);
      }

      // Traka "Poruke" je u uglu (vidi chat-dock), pa dugme stoji iznad nje, a dok je razgovor otvoren, sklanja se.
      .fab.above-chat {
        bottom: calc(3rem + var(--space-4) + var(--safe-bottom));
      }

      .fab.behind-chat {
        opacity: 0;
        visibility: hidden;
        transform: translateY(0.75rem);
      }

      .fab-text {
        position: static;
        width: auto;
        height: auto;
        overflow: visible;
        clip-path: none;
        display: block;
      }
    }

    // Sadržaj sheeta
    .summary {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--bg-sunken);
    }

    .row-between {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .total {
      font-family: var(--font-display);
      font-size: 1.625rem;
      font-weight: 580;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .meter {
      height: 0.375rem;
      border-radius: var(--radius-full);
      background: var(--fill-strong);
      overflow: hidden;
    }

    .meter span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--success);
      transform-origin: left;
      transition: transform 500ms var(--ease-out);
    }

    .meter span.over {
      background: var(--warning);
    }

    .items {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2);
      border-radius: var(--radius-md);
      transition: background-color var(--dur-fast) ease;
    }

    .item:hover {
      background: var(--fill);
    }

    .item.missing {
      border: 1px dashed var(--separator);
    }

    .thumb {
      display: grid;
      place-items: center;
      flex: none;
      width: 3.25rem;
      height: 3.25rem;
      overflow: hidden;
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      color: var(--accent);
    }

    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .info {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    .name {
      overflow: hidden;
      color: var(--text);
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .item-status {
      justify-self: start;
      margin-top: var(--space-1);
    }

    .remove {
      width: 2.25rem;
      height: 2.25rem;
      background: transparent;
      color: var(--text-tertiary);
    }

    .remove:hover {
      color: var(--danger);
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }

    .empty {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      padding: var(--space-4) 0;
      text-align: center;
    }

    .empty-icon {
      display: grid;
      place-items: center;
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
    }

    .empty-icon app-icon {
      width: 2rem;
      height: 2rem;
    }

    @media (prefers-reduced-motion: reduce) {
      .fab,
      .fab.bump .fab-icon {
        animation: none;
      }

      .meter span {
        transition: none;
      }
    }
  `,
})
export class PlanCart {
  protected readonly store = inject(PlanStore);
  protected readonly chat = inject(ChatStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly lookups = inject(LookupStore);
  private readonly toasts = inject(ToastService);
  private readonly sheet = viewChild(Sheet);

  protected readonly open = signal(false);
  protected readonly bump = signal(false);
  protected readonly price = formatPrice;
  protected readonly range = formatPriceRange;
  protected readonly plural = plural;
  protected readonly icon = categoryIcon;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Za mladence i goste; ne na samom planeru (tamo je plan već na ekranu) ni u porukama (prekrivalo bi polje za pisanje). */
  protected readonly visible = computed(() => {
    const role = this.auth.role();
    const url = this.url();
    return (role === null || role === 'Couple') && !url.startsWith('/planiranje') && !url.startsWith('/poruke');
  });

  /** Stranica ponuđača ima svoju traku "Rezerviši" i dugme "Dodaj u plan", pa se dugme ne slaže preko njih. */
  protected readonly onVendor = computed(() => this.url().startsWith('/ponudjaci/'));

  protected readonly meter = computed(() => {
    const budget = this.store.budget();
    return budget > 0 ? Math.min(1, this.store.totalFrom() / budget) : 0;
  });

  protected readonly missing = computed(() => {
    const ids = this.store.answers().categoryIds.filter((id) => !this.store.itemFor(id));
    return this.lookups.categories().filter((c) => ids.includes(c.id));
  });

  protected readonly status = computed(() => {
    switch (this.store.sync()) {
      case 'server':
        return 'sačuvano u profilu';
      case 'saving':
        return 'čuvanje…';
      case 'offline':
        return 'sačuvano na ovom uređaju';
      default:
        return this.store.state().updatedAt ? 'automatski sačuvano' : 'nije sačuvano';
    }
  });

  constructor() {
    this.lookups.ensureLoaded(false, true);
    let previous = this.store.count();
    effect(() => {
      const count = this.store.count();
      untracked(() => {
        if (count > previous) this.bump.set(true);
        previous = count;
      });
    });
  }

  protected close(): void {
    this.sheet()?.close();
  }

  protected remove(item: PlanItem): void {
    this.store.remove(item.categoryId);
    this.toasts.info(`${item.vendorName} je uklonjen iz plana.`, { label: 'Poništi', run: () => this.store.put(item) });
  }

  protected async save(): Promise<void> {
    const result = await this.store.save();
    if (result === null) return; // nema izmjena od zadnjeg čuvanja
    if (result === 'server') this.toasts.success('Plan je sačuvan u vašem profilu.');
    else if (result === 'offline') this.toasts.info('Plan je sačuvan na ovom uređaju.');
    else this.toasts.info('Plan je sačuvan u ovom pregledniku. Napravite profil da ga ne izgubite.');
  }
}
