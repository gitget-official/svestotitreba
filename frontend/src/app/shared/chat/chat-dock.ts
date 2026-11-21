import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { ChatStore } from '../../core/chat-store';
import { plural } from '../../core/format';
import { Icon } from '../ui/icon';
import { ChatList } from './chat-list';
import { ChatPeer, ChatPeerAvatar, peerOf, vendorPeer } from './chat-peer';
import { ChatThread } from './chat-thread';

/**
 * Poruke na desktopu i tabletu: plutajuće dugme "Poruke" (isti izgled kao "Moj plan", zajednički .fab) otvara panel
 * u svom uglu, sa listom razgovora ili jednim razgovorom; dok je panel otvoren, dugme je sklonjeno.
 * Na telefonu se ne prikazuje (tamo je sanduče /poruke).
 * Postoji samo za mladence i salone; uloga je poznata od prvog iscrtavanja, pa dugme nikad ne "iskoči".
 */
@Component({
  selector: 'app-chat-dock',
  imports: [RouterLink, Icon, ChatList, ChatThread, ChatPeerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <!-- Dok je panel otvoren, dugme se sklanja (panel zauzima njegov ugao), ali ostaje u DOM-u: fokus se vraća na njega. -->
      <button
        #fab
        type="button"
        class="fab chat-fab"
        [class.on-vendor]="onVendor()"
        [class.behind-panel]="store.panelOpen()"
        aria-haspopup="dialog"
        aria-controls="chat-panel"
        [attr.aria-expanded]="store.panelOpen()"
        (click)="openFromFab()"
      >
        <span class="fab-icon">
          <app-icon name="chat" [strokeWidth]="1.8" />
          @if (badge()) { <span class="fab-count">{{ badge() }}</span> }
        </span>
        <span class="fab-text">
          <span class="fab-title">Poruke</span>
          <span class="fab-sub">{{ sub() }}</span>
        </span>
      </button>

      @if (store.panelOpen()) {
        <section #panel id="chat-panel" class="chat-panel" [class.on-vendor]="onVendor()" role="dialog" tabindex="-1"
          [attr.aria-label]="label()" animate.enter="panel-in" animate.leave="panel-out">
          @if (store.active(); as target) {
            <div class="view" animate.enter="thread-in" animate.leave="thread-out">
              <header class="head">
                <button type="button" class="icon-btn small back" (click)="store.showList()" aria-label="Nazad" title="Nazad">
                  <app-icon name="arrow-left" />
                </button>
                @if (peer(); as p) {
                  <app-chat-peer-avatar class="mini" [peer]="p" />
                  <span class="title">{{ p.name }}</span>
                  @if (p.link) {
                    <a class="icon-btn small" [routerLink]="p.link" aria-label="Stranica salona" title="Stranica salona">
                      <app-icon name="store" />
                    </a>
                  }
                } @else {
                  <span class="title"></span>
                }
                <button type="button" class="icon-btn small" (click)="close()" aria-label="Zatvori poruke" title="Zatvori">
                  <app-icon name="close" />
                </button>
              </header>
              <app-chat-thread class="body" [target]="target" [active]="true" [autofocus]="true" (bound)="store.bindActive($event)" />
            </div>
          } @else {
            <div class="view" animate.enter="list-in" animate.leave="list-out">
              <header class="head">
                <h2 class="title">Poruke</h2>
                <a class="icon-btn small" [routerLink]="store.inboxUrl()" (click)="store.closePanel()" aria-label="Otvori sve poruke"
                  title="Otvori sve poruke">
                  <app-icon name="expand" />
                </a>
                <button type="button" class="icon-btn small" (click)="close()" aria-label="Zatvori poruke" title="Zatvori">
                  <app-icon name="close" />
                </button>
              </header>
              <app-chat-list class="body" (select)="store.open($event)" />
            </div>
          }
        </section>
      }
    }
  `,
  styles: `
    // Dugme: izgled je zajednički (.fab u styles/_components.scss). Na telefonu su poruke u gornjoj traci.
    .chat-fab {
      display: none;
    }

    // Panel: u uglu dugmeta, uz desnu ivicu; ista porodica kao padajući paneli i sheet na desktopu.
    .chat-panel {
      display: none;
    }

    @media (min-width: 48rem) {
      // Pomak pri sklanjanju je "translate" (ne "transform"), pa vraćanje traje kao i panel, a pritisak ostaje brz.
      // Vidljivost: pri vraćanju odmah (da fokus može na dugme), pri sklanjanju tek kad dugme izblijedi.
      .chat-fab {
        display: inline-flex;
        transition:
          transform var(--dur-press) ease-out,
          box-shadow var(--dur-base) var(--ease-out),
          opacity var(--dur-base) var(--ease-out),
          translate var(--dur-base) var(--ease-out),
          visibility 0s;
      }

      .chat-fab.behind-panel {
        opacity: 0;
        visibility: hidden;
        translate: 0 0.75rem;
        pointer-events: none;
        transition:
          transform var(--dur-press) ease-out,
          box-shadow var(--dur-base) var(--ease-out),
          opacity var(--dur-base) var(--ease-out),
          translate var(--dur-base) var(--ease-out),
          visibility 0s linear var(--dur-base);
      }

      // Panel zauzima ugao dugmeta: raste iz mjesta gdje je dugme bilo i tamo se vraća.
      .chat-panel {
        position: fixed;
        right: max(var(--space-6), env(safe-area-inset-right));
        bottom: calc(var(--space-6) + var(--safe-bottom));
        z-index: 60;
        display: block;
        width: min(22rem, calc(100vw - var(--space-6) * 2));
        height: min(34rem, calc(100dvh - var(--nav-height) - var(--space-6) * 2 - var(--safe-bottom)));
        overflow: hidden;
        border: 1px solid var(--separator);
        border-radius: var(--radius-xl);
        background: var(--bg-elevated);
        box-shadow: var(--shadow-lg);
        color: var(--text);
        transform-origin: bottom right;
      }
    }

    // Stranica ponuđača ispod 60rem ima traku "Rezerviši" sa dugmetom za poruku (isto pravilo kao "Moj plan"):
    // dugme se ne prikazuje, a panel (otvoren iz te trake) stoji iznad trake, ne preko nje.
    @media (min-width: 48rem) and (max-width: 59.99rem) {
      .chat-fab.on-vendor {
        display: none;
      }

      .chat-panel.on-vendor {
        bottom: calc(var(--space-6) + var(--fab-height) + var(--space-3) + var(--safe-bottom));
        height: min(
          34rem,
          calc(100dvh - var(--nav-height) - var(--space-6) * 2 - var(--fab-height) - var(--space-3) - var(--safe-bottom))
        );
      }
    }

    // Lista i razgovor su jedan iznad drugog, pa pri prelazu jedan izlazi dok drugi ulazi.
    .view {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
    }

    .head {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex: none;
      min-height: 3.25rem;
      padding: 0 var(--space-2) 0 var(--space-4);
      border-bottom: 1px solid var(--separator);
    }

    .head:has(.back) {
      padding-left: var(--space-2);
    }

    .title {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1rem;
      font-weight: 650;
    }

    .mini {
      width: 2rem;
      height: 2rem;
      margin-right: var(--space-1);
    }

    .icon-btn.small {
      flex: none;
      width: 2.25rem;
      height: 2.25rem;
      background: transparent;
      color: var(--text-secondary);
    }

    .icon-btn.small:hover {
      background: var(--fill);
      color: var(--text);
    }

    .icon-btn.small app-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .body {
      flex: 1;
      min-height: 0;
    }

    // Otvaranje raste iz dugmeta (donji desni ugao), zatvaranje se vraća u njega.
    .chat-panel.panel-in {
      animation: panel-in var(--dur-base) var(--ease-out) both;
    }

    .chat-panel.panel-out {
      animation: panel-out var(--dur-base) var(--ease-out) both;
      pointer-events: none;
    }

    // Lista je "lijevo", razgovor "desno": razgovor ulazi zdesna, a "Nazad" ga vraća udesno.
    .view.list-in {
      animation: list-in var(--dur-base) var(--ease-out) both;
    }

    .view.list-out {
      animation: list-out var(--dur-base) var(--ease-out) both;
    }

    .view.thread-in {
      animation: thread-in var(--dur-base) var(--ease-out) both;
    }

    .view.thread-out {
      animation: thread-out var(--dur-base) var(--ease-out) both;
    }

    // Dok se panel tek otvara, sadržaj se ne pomjera i unutar njega.
    .chat-panel.panel-in .view {
      animation: none;
    }

    @keyframes panel-in {
      from {
        opacity: 0;
        transform: translateY(0.75rem) scale(0.92);
      }
    }

    @keyframes panel-out {
      to {
        opacity: 0;
        transform: translateY(0.75rem) scale(0.92);
      }
    }

    @keyframes list-in {
      from {
        opacity: 0;
        transform: translateX(-1.5rem);
      }
    }

    @keyframes list-out {
      to {
        opacity: 0;
        transform: translateX(-1.5rem);
      }
    }

    @keyframes thread-in {
      from {
        opacity: 0;
        transform: translateX(1.5rem);
      }
    }

    @keyframes thread-out {
      to {
        opacity: 0;
        transform: translateX(1.5rem);
      }
    }

    // Bez animacija: Angular tada uklanja panel i prikaz odmah (nema animacije na koju bi čekao), a dugme se
    // sklanja i vraća bez prelaza.
    @media (prefers-reduced-motion: reduce) {
      .chat-panel.panel-in,
      .chat-panel.panel-out,
      .view.list-in,
      .view.list-out,
      .view.thread-in,
      .view.thread-out {
        animation: none;
      }

      .chat-fab,
      .chat-fab.behind-panel {
        translate: none;
        transition: none;
      }
    }
  `,
})
export class ChatDock {
  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly fab = viewChild<ElementRef<HTMLButtonElement>>('fab');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** U sandučetu su poruke već na cijelom ekranu, pa se dugme sklanja. */
  protected readonly visible = computed(() => {
    const url = this.url();
    return this.store.enabled() && !url.startsWith('/poruke') && !url.startsWith('/salon/poruke');
  });

  protected readonly onVendor = computed(() => this.url().startsWith('/ponudjaci/'));

  /** Značka tek kad je broj poznat (iz nagovještaja ili sa servera), nikad pogađanje. */
  protected readonly badge = computed(() => (this.store.listState() === 'unknown' ? 0 : this.store.unreadTotal()));

  protected readonly sub = computed(() => {
    const n = this.badge();
    return n ? `${n} ${plural(n, 'nepročitana', 'nepročitane', 'nepročitanih')}` : 'Vaši razgovori';
  });

  protected readonly peer = computed<ChatPeer | null>(() => {
    const target = this.store.active();
    if (!target) return null;
    if ('vendor' in target) return vendorPeer(target.vendor);
    const c = this.store.conversation(target.conversationId);
    return c ? peerOf(c, this.store.isVendor()) : null;
  });

  protected readonly label = computed(() => {
    const p = this.peer();
    return this.store.active() && p ? `Razgovor: ${p.name}` : 'Poruke';
  });

  /**
   * Dugme otvara listu razgovora. Dugme se tada sklanja (panel zauzima njegov ugao), pa fokus ide u panel,
   * inače bi pao na stranicu.
   */
  protected openFromFab(): void {
    if (!this.store.panelOpen()) this.store.togglePanel();
    afterNextRender(() => this.panel()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  /**
   * Zatvaranje vraća fokus na dugme, odakle je panel i otvoren. Tek poslije iscrtavanja: dok dugme ima
   * .behind-panel, skriveno je i ne može dobiti fokus.
   */
  protected close(): void {
    this.store.closePanel();
    afterNextRender(() => this.fab()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.store.panelOpen()) this.close();
  }
}
