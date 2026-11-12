import { HttpContext } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { ChatApi, SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST, VendorApi } from '../../core/api';
import { ChatStore, ChatTarget, ChatVendorRef } from '../../core/chat-store';
import { formatChatTime } from '../../core/format';
import { Conversation } from '../../core/models';
import { Icon } from '../ui/icon';
import { ChatPeerAvatar, peerOf, vendorPeer } from './chat-peer';

/** Salon iz pretrage kojem korisnik još nije pisao. */
interface NewVendor {
  ref: ChatVendorRef;
  detail: string;
}

/** Rezultat pretrage za jedan pojam: prvo razgovori, a tek kad ih nema, novi saloni (samo za mladence). */
interface SearchResult {
  term: string;
  history: Conversation[];
  fresh: NewVendor[];
}

/** "Šešir" i "sesir" se nalaze isto: mala slova i bez kvačica. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Lista razgovora sa pretragom (prozor "Poruke" i sanduče). Ne bira sama šta se otvara: javlja `select`,
 * a roditelj otvara prozor (desktop) ili stranicu.
 *
 * Bez treptanja: dok lista nije poznata, prikaz je neutralan (ni redovi ni "nemate poruka"); dok se novi pojam
 * traži, ostaju rezultati prethodnog; "Novi saloni" se pojavljuju tek kad je sigurno da u razgovorima nema pogotka.
 */
@Component({
  selector: 'app-chat-list',
  imports: [ChatPeerAvatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search">
      <app-icon name="search" />
      <input
        #q
        type="search"
        class="input"
        [placeholder]="store.isVendor() ? 'Pretražite mladence' : 'Pretražite salone'"
        [attr.aria-label]="store.isVendor() ? 'Pretraga razgovora po imenu mladenaca' : 'Pretraga salona'"
        [value]="query()"
        (input)="query.set(q.value)"
        autocomplete="off"
      />
      @if (searching()) {
        <span class="spinner" aria-hidden="true"></span>
      }
    </div>

    <div class="scroll">
      @if (!term()) {
        @if (rows().length && store.listState() !== 'unknown') {
          <ul class="rows" aria-label="Razgovori">
            @for (r of rows(); track r.c.id) {
              <li>
                <button type="button" class="row" [class.unread]="r.c.unreadCount" [class.selected]="r.c.id === selectedId()"
                  (click)="select.emit({ conversationId: r.c.id })">
                  <app-chat-peer-avatar [peer]="r.peer" [dot]="r.c.unreadCount > 0" />
                  <span class="text">
                    <span class="top">
                      <span class="name">{{ r.peer.name }}</span>
                      <time class="time" [attr.datetime]="r.c.lastMessageAt">{{ r.time }}</time>
                    </span>
                    <span class="preview">
                      @if (r.mine) { <span class="you">Vi:</span> }
                      {{ r.c.lastMessagePreview }}
                    </span>
                    @if (multiVendor()) { <span class="salon">{{ r.c.vendorName }}</span> }
                  </span>
                  @if (r.c.unreadCount) {
                    <span class="count">{{ r.c.unreadCount }}<span class="sr-only"> nepročitanih</span></span>
                  }
                </button>
              </li>
            }
          </ul>
        } @else if (store.listState() === 'ready') {
          <div class="empty">
            <app-icon name="chat" [strokeWidth]="1.5" />
            @if (store.isVendor()) {
              <h3>Još nemate poruka</h3>
              <p>Kad vam mladenci pišu, razgovori će biti ovdje.</p>
            } @else {
              <h3>Još niste pisali salonima</h3>
              <p>Potražite salon iznad ili mu pišite sa njegove stranice.</p>
            }
          </div>
        } @else if (store.listState() === 'error') {
          <div class="empty">
            <p>Poruke se trenutno ne mogu učitati.</p>
            <button type="button" class="btn btn-tinted btn-sm" (click)="store.refresh()">Pokušaj ponovo</button>
          </div>
        } @else {
          <div class="neutral" aria-busy="true" aria-label="Učitavanje razgovora"><span class="spinner"></span></div>
        }
      } @else if (results(); as r) {
        @if (r.history.length) {
          <ul class="rows" aria-label="Pronađeni razgovori">
            @for (c of r.history; track c.id) {
              <li>
                <button type="button" class="row" [class.unread]="c.unreadCount" (click)="select.emit({ conversationId: c.id })">
                  <app-chat-peer-avatar [peer]="peer(c)" [dot]="c.unreadCount > 0" />
                  <span class="text">
                    <span class="top">
                      <span class="name">{{ peer(c).name }}</span>
                      <time class="time" [attr.datetime]="c.lastMessageAt">{{ time(c.lastMessageAt) }}</time>
                    </span>
                    <span class="preview">{{ c.lastMessagePreview }}</span>
                  </span>
                </button>
              </li>
            }
          </ul>
        } @else if (r.fresh.length) {
          <div class="fresh-head">
            <p class="section">Novi saloni</p>
            <p class="note"><app-icon name="info" /> Ovim salonima još niste pisali. Izaberite salon da započnete razgovor.</p>
          </div>
          <ul class="rows" aria-label="Novi saloni">
            @for (v of r.fresh; track v.ref.id) {
              <li>
                <button type="button" class="row" (click)="select.emit({ vendor: v.ref })">
                  <app-chat-peer-avatar [peer]="vendorPeer(v.ref)" />
                  <span class="text">
                    <span class="top"><span class="name">{{ v.ref.name }}</span></span>
                    <span class="preview">{{ v.detail }}</span>
                  </span>
                  <span class="new-tag">Novo</span>
                </button>
              </li>
            }
          </ul>
        } @else {
          <div class="empty">
            <p>Nema rezultata za „{{ r.term }}“.</p>
            @if (!store.isVendor()) { <p class="small">Saloni koji ne primaju poruke imaju telefon i e-mail na svojoj stranici.</p> }
          </div>
        }
      } @else {
        <div class="neutral" aria-busy="true" aria-label="Pretraga"><span class="spinner"></span></div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .search {
      position: relative;
      display: flex;
      align-items: center;
      padding: var(--space-2) var(--space-3);
    }

    .search app-icon {
      position: absolute;
      left: calc(var(--space-3) + 0.75rem);
      color: var(--text-tertiary);
      pointer-events: none;
    }

    .search .input {
      min-height: 2.5rem;
      padding-left: 2.5rem;
      padding-right: 2.25rem;
      border-radius: var(--radius-full);
    }

    .search .spinner {
      position: absolute;
      right: calc(var(--space-3) + 0.75rem);
      color: var(--text-tertiary);
    }

    .scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 var(--space-2) var(--space-2);
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: 0.55rem var(--space-2);
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text);
      text-align: left;
      cursor: pointer;
      transition: background-color var(--dur-fast) ease;
    }

    .row:hover {
      background: var(--fill);
    }

    .row.selected {
      background: var(--accent-soft);
    }

    .text {
      display: grid;
      flex: 1;
      min-width: 0;
      gap: 0.0625rem;
    }

    .top {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 550;
    }

    .time {
      flex: none;
      color: var(--text-tertiary);
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }

    .preview,
    .salon {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .salon {
      color: var(--text-tertiary);
      font-size: 0.75rem;
    }

    .you {
      color: var(--text-tertiary);
    }

    .row.unread .name,
    .row.unread .preview {
      color: var(--text);
      font-weight: 650;
    }

    .row.unread .time {
      color: var(--accent);
      font-weight: 600;
    }

    .count {
      display: inline-grid;
      place-items: center;
      flex: none;
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

    .fresh-head {
      padding: var(--space-2) var(--space-2) var(--space-1);
    }

    .section {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .note {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      margin: var(--space-1) 0 0;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--gold-soft);
      color: var(--text);
      font-size: 0.8125rem;
      line-height: 1.4;
    }

    .note app-icon {
      flex: none;
      width: 1rem;
      height: 1rem;
      margin-top: 0.1rem;
      color: var(--gold);
    }

    .new-tag {
      flex: none;
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-full);
      background: var(--gold-soft);
      color: var(--gold);
      font-size: 0.6875rem;
      font-weight: 700;
    }

    .empty {
      display: grid;
      justify-items: center;
      gap: var(--space-2);
      padding: var(--space-6) var(--space-4);
      color: var(--text-secondary);
      text-align: center;
    }

    .empty h3 {
      margin: 0;
      color: var(--text);
      font-size: 1rem;
    }

    .empty p {
      margin: 0;
      font-size: 0.875rem;
    }

    .empty .small {
      font-size: 0.8125rem;
      color: var(--text-tertiary);
    }

    .empty app-icon {
      width: 2.25rem;
      height: 2.25rem;
      color: var(--text-tertiary);
    }

    // Neutralno čekanje: ne obećava ni razgovore ni praznu listu.
    .neutral {
      display: grid;
      place-items: center;
      min-height: 8rem;
      color: var(--text-tertiary);
    }
  `,
})
export class ChatList {
  protected readonly store = inject(ChatStore);
  private readonly api = inject(ChatApi);
  private readonly vendors = inject(VendorApi);
  private readonly quiet = new HttpContext().set(SKIP_AUTH_REDIRECT, true).set(SKIP_ERROR_TOAST, true);

  /** Označeni razgovor (sanduče). */
  readonly selectedId = input<number | null>(null);
  readonly select = output<ChatTarget>();

  protected readonly query = signal('');
  protected readonly term = computed(() => this.query().trim());
  protected readonly results = signal<SearchResult | null>(null);
  protected readonly searching = signal(false);

  protected readonly rows = computed(() => {
    const isVendor = this.store.isVendor();
    const now = new Date();
    return this.store.conversations().map((c) => ({
      c,
      peer: peerOf(c, isVendor),
      mine: c.lastMessageFromVendor === isVendor,
      time: formatChatTime(c.lastMessageAt, now),
    }));
  });

  /** Vlasnik više salona vidi uz razgovor i kojem salonu je pisano. */
  protected readonly multiVendor = computed(
    () => this.store.isVendor() && new Set(this.store.conversations().map((c) => c.vendorId)).size > 1,
  );

  protected readonly vendorPeer = vendorPeer;

  constructor() {
    toObservable(this.term)
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        tap((term) => {
          this.searching.set(!!term);
          if (!term) this.results.set(null);
        }),
        switchMap((term) => (term ? this.search(term) : of(null))),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) this.results.set(result);
        this.searching.set(false);
      });
  }

  protected peer(c: Conversation) {
    return peerOf(c, this.store.isVendor());
  }

  protected time(value: string): string {
    return formatChatTime(value);
  }

  private search(term: string): Observable<SearchResult> {
    return this.searchHistory(term).pipe(
      switchMap((history) =>
        history.length || this.store.isVendor()
          ? of({ term, history, fresh: [] })
          : this.searchVendors(term).pipe(map((fresh) => ({ term, history, fresh }))),
      ),
    );
  }

  /** Razgovori: lokalno kad je lista sigurno potpuna, inače na serveru. */
  private searchHistory(term: string): Observable<Conversation[]> {
    if (this.store.listState() === 'ready' && this.store.complete()) {
      const needle = fold(term);
      return of(this.store.conversations().filter((c) => fold(this.peer(c).name).includes(needle)));
    }
    return this.api.list({ fts: term, pageSize: 20 }, this.quiet).pipe(
      map((r) => r.items),
      catchError(() => of([])),
    );
  }

  /** Saloni koji primaju poruke, a kojima korisnik još nije pisao. */
  private searchVendors(term: string): Observable<NewVendor[]> {
    return this.vendors.list({ fts: term, acceptsMessages: true, pageSize: 8 }, this.quiet).pipe(
      map((r) =>
        r.items
          .filter((v) => !this.store.conversations().some((c) => c.vendorId === v.id))
          .map((v) => ({
            ref: { id: v.id, name: v.name, slug: v.slug, logoUrl: v.logoUrl },
            detail: [v.cityName, v.categories.join(', ')].filter(Boolean).join(' · '),
          })),
      ),
      catchError(() => of([])),
    );
  }
}
