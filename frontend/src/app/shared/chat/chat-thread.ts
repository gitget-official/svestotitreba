import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { apiErrorMessage } from '../../core/api';
import { ChatStore, ChatTarget, ThreadMessage } from '../../core/chat-store';
import { formatChatDay, formatClock } from '../../core/format';
import { Conversation } from '../../core/models';
import { Icon } from '../ui/icon';
import { ToastService } from '../ui/toast';
import { ChatPeerAvatar, vendorPeer } from './chat-peer';

/** Poruke iste strane u razmaku do 5 minuta su jedna grupa (vrijeme se piše ispod zadnje). */
const GROUP_MS = 5 * 60 * 1000;
const MAX_LENGTH = 2000;

interface Item {
  m: ThreadMessage;
  mine: boolean;
  day: string | null;
  time: string | null;
}

/**
 * Poruke jednog razgovora i polje za pisanje (prozor na desktopu i sanduče). Zaglavlje crta roditelj.
 *
 * Bez treptanja: dok se ne zna postoji li razgovor sa salonom, ili dok prve poruke nisu stigle, prikaz je neutralan.
 * "Napišite prvu poruku" se pokazuje samo kad je sigurno da razgovor ne postoji.
 */
@Component({
  selector: 'app-chat-thread',
  imports: [Icon, ChatPeerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scroller" #scroller (scroll)="onScroll()" aria-live="polite">
      @switch (view()) {
        @case ('missing') {
          <div class="center"><p>Razgovor nije pronađen.</p></div>
        }
        @case ('error') {
          <div class="center">
            <p>Poruke se trenutno ne mogu učitati.</p>
            <button type="button" class="btn btn-tinted btn-sm" (click)="reload()">Pokušaj ponovo</button>
          </div>
        }
        @case ('new') {
          <div class="intro">
            @if (newPeer(); as p) { <app-chat-peer-avatar class="intro-avatar" [peer]="p" /> }
            <p class="intro-title">Pišete salonu „{{ newPeer()?.name }}“</p>
            <p class="intro-text">Pitajte za termin, cijene ili detalje. Salon odgovara ovdje, a obavijest dobijate i na e-mail.</p>
          </div>
          @if (firstMessage(); as body) {
            <div class="msg mine"><div class="bubble pending">{{ body }}</div></div>
          }
        }
        @case ('ready') {
          @if (thread()?.loadingOlder) {
            <div class="older"><span class="spinner" aria-label="Učitavanje starijih poruka"></span></div>
          } @else if (thread()?.hasMore) {
            <div class="older"><button type="button" class="btn btn-plain btn-sm" (click)="loadOlder()">Starije poruke</button></div>
          }
          @for (item of items(); track item.m.id) {
            @if (item.day) { <p class="day">{{ item.day }}</p> }
            <div class="msg" [class.mine]="item.mine" [class.grouped]="!item.time">
              <div class="bubble" [class.pending]="item.m.pending" [class.failed]="item.m.error" [attr.title]="clock(item.m.createdAt)">{{ item.m.body }}</div>
              @if (item.m.error) {
                <p class="meta failed-meta">
                  <app-icon name="alert" /> {{ item.m.error }}
                  <button type="button" class="link" (click)="retry(item.m)">Pošalji ponovo</button>
                  <button type="button" class="link" (click)="discard(item.m)">Obriši</button>
                </p>
              } @else if (item.time) {
                <p class="meta"><time [attr.datetime]="item.m.createdAt">{{ item.time }}</time></p>
              }
            </div>
          }
          @if (seen()) { <p class="seen">Viđeno</p> }
        }
        @default {
          <div class="center" aria-busy="true" aria-label="Učitavanje poruka"><span class="spinner"></span></div>
        }
      }
    </div>

    @if (canReply()) {
      <form class="composer" (submit)="submit($event)">
        <textarea
          #box
          rows="1"
          class="box"
          placeholder="Napišite poruku…"
          aria-label="Poruka"
          [attr.maxlength]="maxLength"
          [value]="draft()"
          (input)="onInput(box)"
          (keydown.enter)="onEnter($event)"
        ></textarea>
        <button type="submit" class="send" [disabled]="!draft().trim() || firstMessage() !== null" aria-label="Pošalji">
          <app-icon name="send" />
        </button>
      </form>
      @if (draft().length > maxLength - 200) {
        <p class="limit">{{ draft().length }} / {{ maxLength }}</p>
      }
    } @else {
      <p class="closed">
        @if (store.isVendor()) {
          Mladenci više nisu na platformi, pa im ne možete odgovoriti.
        } @else {
          Salon trenutno ne prima poruke preko platforme. Kontakt podatke ima na svojoj stranici.
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--bg-elevated);
    }

    .scroller {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
    }

    .center {
      display: grid;
      place-items: center;
      gap: var(--space-2);
      flex: 1;
      color: var(--text-tertiary);
      text-align: center;
    }

    .center p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .intro {
      display: grid;
      justify-items: center;
      gap: var(--space-1);
      margin: auto 0;
      padding: var(--space-4) var(--space-2);
      text-align: center;
    }

    .intro-avatar {
      width: 3.5rem;
      height: 3.5rem;
      margin-bottom: var(--space-2);
    }

    .intro-title {
      margin: 0;
      font-weight: 650;
    }

    .intro-text {
      margin: 0;
      max-width: 22rem;
      color: var(--text-secondary);
      font-size: 0.8125rem;
      line-height: 1.45;
    }

    .older {
      display: grid;
      place-items: center;
      min-height: 2.5rem;
      color: var(--text-tertiary);
    }

    .day {
      align-self: center;
      margin: var(--space-3) 0 var(--space-2);
      color: var(--text-tertiary);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .msg {
      display: grid;
      justify-items: start;
      margin-top: var(--space-2);
    }

    .msg.grouped + .msg,
    .msg.grouped {
      margin-top: 0.125rem;
    }

    .msg.mine {
      justify-items: end;
    }

    .bubble {
      max-width: min(85%, 26rem);
      padding: 0.5rem 0.8rem;
      border-radius: 1.125rem;
      background: var(--fill-strong);
      color: var(--text);
      font-size: 0.9375rem;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .msg.mine .bubble {
      background: var(--accent);
      color: var(--text-on-accent);
    }

    .bubble.pending {
      opacity: 0.6;
    }

    .msg.mine .bubble.failed {
      background: var(--danger-soft);
      color: var(--text);
      box-shadow: inset 0 0 0 1px var(--danger);
    }

    .meta {
      margin: 0.2rem 0.4rem 0;
      color: var(--text-tertiary);
      font-size: 0.6875rem;
      font-variant-numeric: tabular-nums;
    }

    .failed-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.25rem 0.5rem;
      color: var(--danger);
    }

    .failed-meta app-icon {
      width: 0.875rem;
      height: 0.875rem;
    }

    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent);
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }

    .seen {
      align-self: flex-end;
      margin: 0.2rem 0.4rem 0;
      color: var(--text-tertiary);
      font-size: 0.6875rem;
    }

    .composer {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3) var(--space-3);
      border-top: 1px solid var(--separator);
    }

    .box {
      flex: 1;
      min-height: 2.5rem;
      max-height: 8rem;
      padding: 0.55rem 0.9rem;
      border: 1px solid transparent;
      border-radius: 1.25rem;
      background: var(--fill);
      color: var(--text);
      font: inherit;
      font-size: 1rem;
      line-height: 1.35;
      resize: none;
      overflow-y: auto;
    }

    .box:focus {
      outline: none;
      background: var(--bg-elevated);
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .send {
      display: grid;
      place-items: center;
      flex: none;
      width: 2.5rem;
      height: 2.5rem;
      border: 0;
      border-radius: 50%;
      background: var(--accent);
      color: var(--text-on-accent);
      cursor: pointer;
      transition: transform var(--dur-press) ease-out, opacity var(--dur-fast) ease;
    }

    .send:active:not(:disabled) {
      transform: scale(0.9);
    }

    .send:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .limit {
      margin: -0.5rem var(--space-4) var(--space-2);
      color: var(--text-tertiary);
      font-size: 0.6875rem;
      text-align: right;
    }

    .closed {
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--separator);
      color: var(--text-secondary);
      font-size: 0.8125rem;
      text-align: center;
    }
  `,
})
export class ChatThread {
  protected readonly store = inject(ChatStore);
  private readonly toasts = inject(ToastService);

  readonly target = input.required<ChatTarget>();
  /** Razgovor je vidljiv korisniku (nije umanjen): tada se nove poruke odmah označavaju kao pročitane. */
  readonly active = input(true);
  readonly autofocus = input(false);
  /** Prozor sa salonom je dobio razgovor (postojeći ili napravljen prvom porukom). */
  readonly bound = output<Conversation>();

  protected readonly maxLength = MAX_LENGTH;
  protected readonly draft = signal('');
  /** Prva poruka salonu dok se šalje (razgovor još ne postoji). */
  protected readonly firstMessage = signal<string | null>(null);
  /** Za razgovor sa salonom: dok se ne zna postoji li razgovor, ili je sigurno da ne postoji. */
  private readonly vendorState = signal<'resolving' | 'none' | null>(null);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  protected readonly conversationId = computed(() => {
    const t = this.target();
    return 'conversationId' in t ? t.conversationId : null;
  });
  protected readonly conversation = computed(() => {
    const id = this.conversationId();
    return id === null ? undefined : this.store.conversations().find((c) => c.id === id);
  });
  protected readonly thread = computed(() => {
    const id = this.conversationId();
    return id === null ? undefined : this.store.threads()[id];
  });

  protected readonly view = computed<'missing' | 'error' | 'new' | 'ready' | 'loading'>(() => {
    const id = this.conversationId();
    if (id === null) return this.vendorState() === 'none' ? 'new' : 'loading';
    if (this.store.missing().has(id)) return 'missing';
    const state = this.thread()?.state;
    return state === 'ready' ? 'ready' : state === 'error' ? 'error' : 'loading';
  });

  protected readonly newPeer = computed(() => {
    const t = this.target();
    return 'vendor' in t ? vendorPeer(t.vendor) : null;
  });

  protected readonly canReply = computed(() => {
    if (this.view() === 'missing') return false;
    return this.conversation()?.canReply ?? true;
  });

  protected readonly items = computed<Item[]>(() => {
    const messages = this.thread()?.messages ?? [];
    const isVendor = this.store.isVendor();
    const now = new Date();
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const mine = m.fromVendor === isVendor;
      const day = formatChatDay(m.createdAt, now);
      const nextGrouped =
        next && next.fromVendor === m.fromVendor && Date.parse(next.createdAt) - Date.parse(m.createdAt) < GROUP_MS &&
        formatChatDay(next.createdAt, now) === day;
      return {
        m,
        mine,
        day: !prev || formatChatDay(prev.createdAt, now) !== day ? day : null,
        time: nextGrouped || m.pending ? null : formatClock(m.createdAt),
      };
    });
  });

  /** "Viđeno" ispod zadnje poruke kad je ona moja i druga strana ju je vidjela. */
  protected readonly seen = computed(() => {
    const c = this.conversation();
    const last = this.thread()?.messages.at(-1);
    return !!c && !!last && last.id > 0 && last.fromVendor === this.store.isVendor() && c.otherLastReadMessageId >= last.id;
  });

  /** Udaljenost od dna prije učitavanja starijih poruka, da sadržaj ne skoči. */
  private anchor: number | null = null;
  private lastSeenId: number | null = null;
  private stickToBottom = true;
  private lastTarget: ChatTarget | null = null;

  constructor() {
    effect(() => {
      const t = this.target();
      untracked(() => this.resolve(t));
    });

    // Vidljiv razgovor sa nepročitanim porukama: označi ih kao pročitane.
    effect(() => {
      const c = this.conversation();
      if (c && c.unreadCount > 0 && this.active() && this.store.pageVisible() && this.view() === 'ready')
        untracked(() => this.store.markRead(c.id));
    });

    afterRenderEffect(() => {
      const messages = this.thread()?.messages ?? [];
      const view = this.view();
      const el = this.scroller().nativeElement;
      if (view !== 'ready') {
        this.lastSeenId = null;
        return;
      }
      const lastId = messages.at(-1)?.id ?? null;
      if (this.anchor !== null) {
        // Starije poruke su dodane iznad: zadrži isti prikaz.
        el.scrollTop = el.scrollHeight - this.anchor;
        this.anchor = null;
      } else if (lastId !== this.lastSeenId && (this.stickToBottom || messages.at(-1)?.fromVendor === this.store.isVendor())) {
        el.scrollTop = el.scrollHeight;
      }
      this.lastSeenId = lastId;
      // Kratak razgovor bez skrolanja: starije poruke se dohvate same.
      if (el.scrollHeight <= el.clientHeight && this.thread()?.hasMore) untracked(() => this.loadOlder());
    });

    afterNextRender(() => {
      if (this.autofocus()) this.box()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected clock(value: string): string {
    return formatClock(value);
  }

  protected onScroll(): void {
    const el = this.scroller().nativeElement;
    this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 64) this.loadOlder();
  }

  protected loadOlder(): void {
    const id = this.conversationId();
    const thread = this.thread();
    if (id === null || !thread?.hasMore || thread.loadingOlder) return;
    const el = this.scroller().nativeElement;
    this.anchor = el.scrollHeight - el.scrollTop;
    this.store.loadOlder(id);
  }

  protected reload(): void {
    const id = this.conversationId();
    if (id !== null) this.store.loadThread(id);
  }

  protected onInput(box: HTMLTextAreaElement): void {
    this.draft.set(box.value);
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }

  /** Enter šalje, Shift+Enter prelazi u novi red (i ne ometa unos dijakritika preko IME-a). */
  protected onEnter(event: Event): void {
    const e = event as KeyboardEvent;
    if (e.shiftKey || e.isComposing) return;
    e.preventDefault();
    this.submit();
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    const body = this.draft().trim();
    if (!body || this.firstMessage() !== null) return;

    const id = this.conversationId();
    if (id !== null) {
      this.store.send(id, body);
      this.clearDraft();
      this.stickToBottom = true;
      return;
    }

    const t = this.target();
    if (!('vendor' in t)) return;
    this.firstMessage.set(body);
    this.clearDraft();
    this.store.start(t.vendor.id, body).subscribe({
      next: (r) => {
        this.firstMessage.set(null);
        this.bound.emit(r.conversation);
      },
      error: (e) => {
        // Poruka se vraća u polje, da se ne izgubi.
        this.firstMessage.set(null);
        this.draft.set(body);
        this.toasts.error(apiErrorMessage(e));
      },
    });
  }

  protected retry(m: ThreadMessage): void {
    this.store.retry(m.conversationId, m.id);
  }

  protected discard(m: ThreadMessage): void {
    this.store.discard(m.conversationId, m.id);
  }

  private clearDraft(): void {
    this.draft.set('');
    const box = this.box()?.nativeElement;
    if (box) {
      box.value = '';
      box.style.height = 'auto';
      box.focus({ preventScroll: true });
    }
  }

  private resolve(target: ChatTarget): void {
    // Salon je dobio svoj razgovor (isti prozor): započeta poruka ostaje. Drugi razgovor počinje sa praznim poljem.
    const binding = this.lastTarget !== null && 'vendor' in this.lastTarget && 'conversationId' in target;
    this.lastTarget = target;
    this.anchor = null;
    this.stickToBottom = true;
    if (!binding && this.firstMessage() === null) this.draft.set('');
    if ('conversationId' in target) {
      this.vendorState.set(null);
      this.store.ensure(target.conversationId);
      this.store.loadThread(target.conversationId);
      return;
    }
    this.vendorState.set('resolving');
    this.store.findForVendor(target.vendor.id).subscribe({
      next: (c) => (c ? this.bound.emit(c) : this.vendorState.set('none')),
      // Ako provjera ne uspije, prva poruka svejedno ide u postojeći razgovor (server ga nastavlja).
      error: () => this.vendorState.set('none'),
    });
  }
}
