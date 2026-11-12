import { ChangeDetectionStrategy, Component, HostListener, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { ChatStore, ChatWindow } from '../../core/chat-store';
import { Icon } from '../ui/icon';
import { ChatList } from './chat-list';
import { ChatPeer, ChatPeerAvatar, peerOf, vendorPeer } from './chat-peer';
import { ChatThread } from './chat-thread';

/**
 * Poruke na desktopu, kao na Facebooku: traka "Poruke" zakačena za donji desni ugao otvara listu razgovora,
 * a razgovori se otvaraju u prozorima lijevo od nje. Na telefonu se ne prikazuje (tamo je sanduče /poruke).
 * Postoji samo za mladence i salone; uloga je poznata od prvog iscrtavanja, pa traka nikad ne "iskoči".
 */
@Component({
  selector: 'app-chat-dock',
  imports: [RouterLink, Icon, ChatList, ChatThread, ChatPeerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="dock">
        <section class="launcher panel" [class.open]="store.dockOpen()" aria-label="Poruke">
          <header class="head">
            <button type="button" class="head-main" (click)="toggleList()" [attr.aria-expanded]="store.dockOpen()">
              <app-icon name="chat" />
              <span class="title">Poruke</span>
              @if (badge(); as n) {
                <span class="count">{{ n }}<span class="sr-only"> nepročitanih</span></span>
              }
            </button>
            @if (store.dockOpen()) {
              <a class="icon-btn small" [routerLink]="store.inboxUrl()" (click)="store.dockOpen.set(false)" aria-label="Otvori sve poruke"
                title="Otvori sve poruke">
                <app-icon name="expand" />
              </a>
            }
            <button type="button" class="icon-btn small chevron" (click)="toggleList()" [attr.aria-label]="store.dockOpen() ? 'Sakrij listu' : 'Prikaži listu'">
              <app-icon name="chevron-down" />
            </button>
          </header>
          @if (store.dockOpen()) {
            <app-chat-list class="body" animate.enter="body-in" animate.leave="body-out" (select)="store.open($event)" />
          }
        </section>

        <!-- Po id-u, ne po key-u: kad prozor salona dobije razgovor, ostaje isti prozor (bez zatvaranja i otvaranja). -->
        @for (w of store.windows(); track w.id) {
          <section class="window panel" animate.leave="window-out" [class.open]="!w.minimized" [class.unread]="unread(w)" role="dialog"
            [attr.aria-label]="'Razgovor: ' + (peer(w)?.name ?? '')">
            <header class="head">
              <button type="button" class="head-main" (click)="store.toggleWindow(w.key)" [attr.aria-expanded]="!w.minimized">
                @if (peer(w); as p) {
                  <app-chat-peer-avatar class="mini" [peer]="p" />
                  <span class="title">{{ p.name }}</span>
                } @else {
                  <span class="title"></span>
                }
                @if (unread(w); as n) { <span class="count">{{ n }}</span> }
              </button>
              @if (peer(w)?.link; as link) {
                <a class="icon-btn small" [routerLink]="link" aria-label="Stranica salona" title="Stranica salona">
                  <app-icon name="store" />
                </a>
              }
              <button type="button" class="icon-btn small" (click)="store.toggleWindow(w.key)" [attr.aria-label]="w.minimized ? 'Otvori' : 'Umanji'">
                <app-icon [name]="w.minimized ? 'chevron-down' : 'minus'" [class.up]="w.minimized" />
              </button>
              <button type="button" class="icon-btn small" (click)="store.closeWindow(w.key)" aria-label="Zatvori razgovor">
                <app-icon name="close" />
              </button>
            </header>
            @if (!w.minimized) {
              <app-chat-thread class="body" animate.enter="body-in" animate.leave="body-out" [target]="w.target" [active]="true"
                [autofocus]="true" (bound)="store.bindWindow(w.key, $event)" />
            }
          </section>
        }
      </div>
    }
  `,
  styles: `
    .dock {
      display: none;
    }

    @media (min-width: 48rem) {
      .dock {
        position: fixed;
        right: max(var(--space-6), env(safe-area-inset-right));
        bottom: 0;
        z-index: 60;
        display: flex;
        flex-direction: row-reverse;
        align-items: flex-end;
        gap: var(--space-3);
        pointer-events: none;
      }
    }

    // Visina je uvijek zadana (zatvoreno: traka 3rem + gornja ivica), pa se umanjivanje i otvaranje glatko animiraju.
    .panel {
      display: flex;
      flex-direction: column;
      width: 20rem;
      height: calc(3rem + 1px);
      overflow: hidden;
      border: 1px solid var(--separator);
      border-bottom: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-regular);
      backdrop-filter: var(--blur-regular);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
      color: var(--text);
      pointer-events: auto;
      animation: dock-in 320ms var(--ease-out) both;
      transition: height var(--dur-base) var(--ease-out);
    }

    .panel.open {
      height: min(32rem, calc(100dvh - var(--nav-height) - var(--space-6)));
      background: var(--bg-elevated);
    }

    .window {
      width: 21rem;
    }

    .head {
      display: flex;
      align-items: center;
      gap: 0.125rem;
      flex: none;
      height: 3rem;
      padding: 0 var(--space-2) 0 0;
    }

    .panel.open .head {
      border-bottom: 1px solid var(--separator);
    }

    .head-main {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex: 1;
      min-width: 0;
      height: 100%;
      padding: 0 var(--space-2) 0 var(--space-4);
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 650;
    }

    .window.unread:not(.open) .head {
      background: var(--accent-soft);
    }

    .mini {
      width: 1.875rem;
      height: 1.875rem;
      margin-left: calc(var(--space-2) * -1);
    }

    .count {
      display: inline-grid;
      place-items: center;
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0 0.35rem;
      border-radius: var(--radius-full);
      background: var(--accent);
      color: var(--text-on-accent);
      font-size: 0.6875rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .icon-btn.small {
      width: 2rem;
      height: 2rem;
      background: transparent;
      color: var(--text-secondary);
    }

    .icon-btn.small:hover {
      background: var(--fill);
      color: var(--text);
    }

    .icon-btn.small app-icon {
      width: 1.125rem;
      height: 1.125rem;
    }

    .chevron app-icon,
    app-icon.up {
      transition: transform var(--dur-base) var(--ease-out);
      transform: rotate(180deg);
    }

    .launcher.open .chevron app-icon {
      transform: none;
    }

    .body {
      flex: 1;
      min-height: 0;
    }

    // Sadržaj se pojavljuje dok panel raste, a pri umanjivanju ostaje vidljiv (odsječen) dok panel ne spadne na traku.
    .body.body-in {
      animation: fade-in var(--dur-base) var(--ease-out) both;
    }

    .body.body-out {
      animation: fade-out var(--dur-base) var(--ease-out) both;
    }

    // Zatvaranje: prozor prvo spadne i izblijedi, pa se suzi, da susjedni prozori kliznu na njegovo mjesto.
    .window.window-out {
      animation: window-out 320ms var(--ease-out) both;
      pointer-events: none;
    }

    @keyframes dock-in {
      from {
        transform: translateY(1.5rem);
        opacity: 0;
      }
    }

    @keyframes window-out {
      0% {
        width: 21rem;
        margin-left: 0;
        opacity: 1;
        transform: none;
      }
      55% {
        width: 21rem;
        margin-left: 0;
        border-inline-width: 1px;
        opacity: 0;
        transform: translateY(1.5rem);
      }
      // I bočne ivice, inače ostanu 2px i susjed na kraju poskoči.
      100% {
        width: 0;
        margin-left: calc(var(--space-3) * -1);
        border-inline-width: 0;
        opacity: 0;
        transform: translateY(1.5rem);
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }

    @keyframes fade-out {
      to {
        opacity: 0;
      }
    }

    // Bez animacija: Angular tada uklanja zatvoreni prozor i sadržaj odmah (nema animacije na koju bi čekao).
    @media (prefers-reduced-motion: reduce) {
      .panel,
      .body.body-in,
      .body.body-out,
      .window.window-out {
        animation: none;
        transition: none;
      }

      .chevron app-icon,
      app-icon.up {
        transition: none;
      }
    }
  `,
})
export class ChatDock {
  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** U sandučetu su poruke već na cijelom ekranu, pa se traka sklanja. */
  protected readonly visible = computed(() => {
    const url = this.url();
    return this.store.enabled() && !url.startsWith('/poruke') && !url.startsWith('/salon/poruke');
  });

  /** Značka tek kad je broj poznat (iz nagovještaja ili sa servera), nikad pogađanje. */
  protected readonly badge = computed(() => (this.store.listState() === 'unknown' ? 0 : this.store.unreadTotal()));

  private readonly peers = computed(() => {
    const isVendor = this.store.isVendor();
    const byId = new Map(this.store.conversations().map((c) => [c.id, c]));
    return new Map<string, ChatPeer | null>(
      this.store.windows().map((w) => {
        if ('vendor' in w.target) return [w.key, vendorPeer(w.target.vendor)];
        const c = byId.get(w.target.conversationId);
        return [w.key, c ? peerOf(c, isVendor) : null];
      }),
    );
  });

  protected peer(w: ChatWindow): ChatPeer | null {
    return this.peers().get(w.key) ?? null;
  }

  protected unread(w: ChatWindow): number {
    return 'conversationId' in w.target ? (this.store.conversation(w.target.conversationId)?.unreadCount ?? 0) : 0;
  }

  protected toggleList(): void {
    this.store.dockOpen.update((open) => !open);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.store.dockOpen.set(false);
  }
}
