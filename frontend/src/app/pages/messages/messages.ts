import { HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST, VendorApi } from '../../core/api';
import { ChatStore, ChatTarget } from '../../core/chat-store';
import { Conversation } from '../../core/models';
import { ChatList } from '../../shared/chat/chat-list';
import { ChatPeer, ChatPeerAvatar, peerOf, vendorPeer } from '../../shared/chat/chat-peer';
import { ChatThread } from '../../shared/chat/chat-thread';
import { Icon } from '../../shared/ui/icon';

/**
 * Sanduče: /poruke (mladenci) i /salon/poruke (salon). Desktop: lista i razgovor jedno pored drugog.
 * Telefon: lista, pa razgovor preko cijelog ekrana. /poruke/salon/:vendorId je prva poruka salonu.
 */
@Component({
  selector: 'app-messages',
  imports: [RouterLink, Icon, ChatList, ChatThread, ChatPeerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Odjava usred razgovora: dok traje prelaz na prijavu, prazno, a ne "učitavanje" razgovora kojeg više nema. -->
    @if (store.enabled()) {
      <div class="container wrap">
        <div class="inbox card" [class.has-selection]="selected()">
          <aside class="list-pane">
            <header class="pane-head">
              <h1 class="t-title-3">Poruke</h1>
            </header>
            <app-chat-list class="list" [selectedId]="selectedId()" (select)="onSelect($event)" />
          </aside>

          <section class="thread-pane" [attr.aria-label]="peer()?.name ?? 'Razgovor'">
            @if (selected()) {
              <header class="pane-head thread-head">
                <a class="icon-btn back" [routerLink]="store.inboxUrl()" aria-label="Nazad na poruke">
                  <app-icon name="arrow-left" />
                </a>
                @if (peer(); as p) {
                  <app-chat-peer-avatar class="who-avatar" [peer]="p" />
                  <div class="who">
                    <strong>{{ p.name }}</strong>
                    @if (p.link) { <a class="t-footnote" [routerLink]="p.link">Stranica salona</a> }
                  </div>
                }
              </header>
              @if (target(); as t) {
                <app-chat-thread class="thread" [target]="t" [active]="true" [autofocus]="desktop" (bound)="onBound($event)" />
              } @else if (problem(); as text) {
                <div class="placeholder"><p>{{ text }}</p></div>
              } @else {
                <div class="placeholder" aria-busy="true"><span class="spinner"></span></div>
              }
            } @else {
              <div class="placeholder">
                <app-icon name="chat" [strokeWidth]="1.5" />
                <p>Izaberite razgovor</p>
              </div>
            }
          </section>
        </div>
      </div>
    }
  `,
  styles: `
    .wrap {
      padding-top: var(--space-4);
    }

    // Visina ekrana bez gornje i donje trake (na telefonu je i donja traka sa karticama).
    .inbox {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      height: calc(100dvh - var(--nav-height) - 5rem - var(--safe-bottom));
      min-height: 24rem;
      padding: 0;
      overflow: hidden;
    }

    .list-pane,
    .thread-pane {
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
    }

    .inbox.has-selection .list-pane,
    .inbox:not(.has-selection) .thread-pane {
      display: none;
    }

    .pane-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex: none;
      min-height: 3.5rem;
      padding: var(--space-2) var(--space-4);
      border-bottom: 1px solid var(--separator);
    }

    .pane-head h1 {
      margin: 0;
    }

    .list,
    .thread {
      flex: 1;
      min-height: 0;
    }

    .back {
      flex: none;
      width: 2.25rem;
      height: 2.25rem;
      margin-left: calc(var(--space-2) * -1);
      background: transparent;
    }

    .who-avatar {
      width: 2.25rem;
      height: 2.25rem;
    }

    .who {
      display: grid;
      min-width: 0;
    }

    .who strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .placeholder {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: var(--space-2);
      flex: 1;
      padding: var(--space-6);
      color: var(--text-tertiary);
      text-align: center;
    }

    .placeholder app-icon {
      width: 2.5rem;
      height: 2.5rem;
    }

    .placeholder p {
      margin: 0;
      color: var(--text-secondary);
    }

    @media (min-width: 48rem) {
      .inbox {
        grid-template-columns: 19rem minmax(0, 1fr);
        height: calc(100dvh - var(--nav-height) - var(--space-6) * 2);
      }

      .inbox.has-selection .list-pane,
      .inbox:not(.has-selection) .thread-pane {
        display: flex;
      }

      .list-pane {
        border-right: 1px solid var(--separator);
      }

      .back {
        display: none;
      }
    }

    @media (min-width: 64rem) {
      .inbox {
        grid-template-columns: 22rem minmax(0, 1fr);
      }
    }
  `,
})
export class Messages {
  /** /poruke/:id i /salon/poruke/:id */
  readonly id = input<string>();
  /** /poruke/salon/:vendorId: prva poruka salonu. */
  readonly vendorId = input<string>();

  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly vendors = inject(VendorApi);
  private readonly quiet = new HttpContext().set(SKIP_AUTH_REDIRECT, true).set(SKIP_ERROR_TOAST, true);

  protected readonly desktop = typeof matchMedia === 'function' && matchMedia('(min-width: 48rem)').matches;
  protected readonly target = signal<ChatTarget | null>(null);
  /** Salon ne postoji ili ne prima poruke. */
  protected readonly problem = signal<string | null>(null);

  protected readonly selected = computed(() => !!this.id() || !!this.vendorId());
  protected readonly selectedId = computed(() => (this.id() ? Number(this.id()) : null));

  protected readonly peer = computed<ChatPeer | null>(() => {
    const t = this.target();
    if (!t) return null;
    if ('vendor' in t) return vendorPeer(t.vendor);
    const c = this.store.conversation(t.conversationId);
    return c ? peerOf(c, this.store.isVendor()) : null;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      const vendorId = this.vendorId();
      untracked(() => this.resolve(id, vendorId));
    });
  }

  protected onSelect(target: ChatTarget): void {
    if ('conversationId' in target) void this.router.navigate([this.store.inboxUrl(), target.conversationId]);
    else void this.router.navigate(['/poruke/salon', target.vendor.id]);
  }

  /** Prva poruka je napravila razgovor (ili je razgovor sa salonom već postojao). */
  protected onBound(c: Conversation): void {
    void this.router.navigate([this.store.inboxUrl(), c.id], { replaceUrl: true });
  }

  private resolve(id: string | undefined, vendorId: string | undefined): void {
    this.problem.set(null);
    if (id) {
      this.target.set({ conversationId: Number(id) });
      return;
    }
    if (!vendorId) {
      this.target.set(null);
      return;
    }

    const existing = this.store.conversations().find((c) => c.vendorId === Number(vendorId));
    if (existing) {
      this.onBound(existing);
      return;
    }
    this.target.set(null);
    this.vendors.get(Number(vendorId), this.quiet).subscribe({
      next: (v) => {
        if (v.acceptsMessages) this.target.set({ vendor: { id: v.id, name: v.name, slug: v.slug, logoUrl: v.logoUrl } });
        else this.problem.set(`„${v.name}“ još ne prima poruke preko platforme. Kontakt podatke ima na svojoj stranici.`);
      },
      error: () => this.problem.set('Salon nije pronađen.'),
    });
  }
}
