import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { Observable, map, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { ChatApi, SKIP_AUTH_REDIRECT, SKIP_ERROR_TOAST, apiErrorMessage } from './api';
import { AuthService } from './auth';
import { ChatMessage, ChatSendResult, Conversation } from './models';

/** Salon kojem mladenci pišu prvi put (razgovor još ne postoji). */
export interface ChatVendorRef {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/** Šta prozor ili stranica prikazuje: postojeći razgovor ili prvu poruku salonu. */
export type ChatTarget = { conversationId: number } | { vendor: ChatVendorRef };

/** Poruka u prikazu; `pending` dok se šalje, `error` kad slanje nije uspjelo. */
export interface ThreadMessage extends ChatMessage {
  pending?: boolean;
  error?: string;
}

export interface Thread {
  messages: ThreadMessage[];
  hasMore: boolean;
  /** loading: prva stranica još nije stigla (prikaz je neutralan, ne "napišite prvu poruku"). */
  state: 'loading' | 'ready' | 'error';
  loadingOlder: boolean;
}

/** Prozor razgovora na desktopu (kao na Facebooku). */
export interface ChatWindow {
  /** Stalan za cijeli život prozora; `key` se mijenja kad prozor salona dobije razgovor. */
  id: number;
  key: string;
  target: ChatTarget;
  minimized: boolean;
}

/** Veza uživo; u testovima se zamjenjuje lažnom. */
export interface ChatHub {
  on(event: 'message', handler: (payload: ChatSendResult) => void): void;
  on(event: 'conversation', handler: (payload: Conversation) => void): void;
  onreconnected(handler: () => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const CHAT_HUB_FACTORY = new InjectionToken<(token: () => string) => ChatHub>('CHAT_HUB_FACTORY', {
  providedIn: 'root',
  factory: () => (token) =>
    new HubConnectionBuilder()
      // Token ide u adresu samo za WebSocket (preglednik ne može poslati zaglavlje); bez kolačića, pa ni CORS kredencijala.
      .withUrl(`${environment.apiUrl}/hubs/chat`, { accessTokenFactory: token, withCredentials: false })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build(),
});

const PAGE = 50;
const HINT_PREFIX = 'planiraj.chat.';
const HINT_MAX = 20;
const RETRY_MS = 30_000;

/** Snimak liste u pregledniku: samo nagovještaj za prvo iscrtavanje, server uvijek ima zadnju riječ. */
interface Hint {
  v: 1;
  unreadTotal: number;
  complete: boolean;
  conversations: Conversation[];
}

/**
 * Poruke prijavljenih mladenaca i salona: lista razgovora, poruke po razgovoru, veza uživo i prozori na desktopu.
 *
 * Bez treptanja pogrešnog prikaza (skill no-ui-flash):
 * - Prijava se čita iz preglednika prije prvog iscrtavanja, pa je odmah poznato ima li korisnik poruke uopšte.
 * - Lista i značka nepročitanih se iscrtavaju odmah iz nagovještaja (`planiraj.chat.{id}`), a odgovor servera ih
 *   zamjenjuje. Nagovještaj se briše pri odjavi, brisanju profila i isteku sesije.
 * - Bez nagovještaja stanje je `unknown`: prikaz je neutralan, a "nemate poruka" se pokazuje tek kad server to potvrdi.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(ChatApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly hubFactory = inject(CHAT_HUB_FACTORY);
  private readonly quiet = new HttpContext().set(SKIP_AUTH_REDIRECT, true).set(SKIP_ERROR_TOAST, true);

  /** Poruke imaju mladenci i saloni; gost i administrator ne. */
  readonly enabled = computed(() => {
    const role = this.auth.role();
    return role === 'Couple' || role === 'Vendor';
  });
  readonly isVendor = computed(() => this.auth.role() === 'Vendor');
  readonly inboxUrl = computed(() => (this.isVendor() ? '/salon/poruke' : '/poruke'));

  readonly conversations = signal<Conversation[]>([]);
  readonly unreadTotal = signal(0);
  /**
   * unknown: još ništa ne znamo; hinted: lista iz preglednika dok server ne odgovori;
   * ready: odgovor servera; error: server nije odgovorio, a nagovještaja nema.
   */
  readonly listState = signal<'unknown' | 'hinted' | 'ready' | 'error'>('unknown');
  /** Lista ima sve razgovore, pa se pretraga i provjera "već ste pisali" rade bez servera. */
  readonly complete = signal(false);

  private readonly threadMap = signal<Record<number, Thread>>({});
  readonly threads = this.threadMap.asReadonly();
  /** Razgovori koje server ne poznaje (obrisani ili tuđi link). */
  readonly missing = signal<ReadonlySet<number>>(new Set());
  /** Poruke se označavaju kao pročitane samo dok je kartica vidljiva. */
  readonly pageVisible = signal(typeof document === 'undefined' || document.visibilityState === 'visible');

  private hub: ChatHub | null = null;
  private userId: number | null = null;
  private nextTempId = -1;
  private nextWindowId = 1;
  private readonly marking = new Set<number>();

  constructor() {
    effect(() => {
      const id = this.enabled() ? (this.auth.user()?.id ?? null) : null;
      untracked(() => this.switchUser(id));
    });

    // Povratak na karticu: osvježi listu (ako je veza uživo pukla, ništa se ne propušta).
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const visible = document.visibilityState === 'visible';
        this.pageVisible.set(visible);
        if (visible && this.userId !== null) this.refresh();
      });
    }
  }

  // ---------------- Lista razgovora ----------------

  refresh(): void {
    const id = this.userId;
    if (id === null) return;
    this.api.list({ pageSize: PAGE }, this.quiet).subscribe({
      next: (r) => {
        if (id !== this.userId) return;
        this.conversations.set(sortByLatest(r.items));
        this.unreadTotal.set(r.unreadTotal);
        this.complete.set(r.totalCount <= r.items.length);
        this.listState.set('ready');
        this.writeHint();
      },
      error: () => {
        if (id === this.userId && this.listState() === 'unknown') this.listState.set('error');
      },
    });
  }

  conversation(id: number): Conversation | undefined {
    return this.conversations().find((c) => c.id === id);
  }

  /** Razgovor otvoren linkom (npr. iz e-maila) koji nije na prvoj stranici liste. */
  ensure(id: number): void {
    if (this.conversation(id) || this.missing().has(id)) return;
    this.api.get(id, this.quiet).subscribe({
      next: (c) => this.upsert(c),
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 404) this.missing.update((s) => new Set(s).add(id));
      },
    });
  }

  /**
   * Razgovor sa salonom ako postoji, null ako ne postoji, bez poziva servera kad lista sigurno ima sve razgovore.
   * Dok se ovo ne razriješi, prikaz ne smije tvrditi ni jedno ni drugo.
   */
  findForVendor(vendorId: number): Observable<Conversation | null> {
    const local = this.conversations().find((c) => c.vendorId === vendorId);
    if (local) return of(local);
    if (this.listState() === 'ready' && this.complete()) return of(null);
    return this.api.withVendor(vendorId, this.quiet).pipe(
      map((c) => c ?? null),
      tap((c) => c && this.upsert(c)),
    );
  }

  // ---------------- Poruke ----------------

  /** Učitava zadnje poruke razgovora (jednom; dalje stižu uživo). `force` dopunjava već učitan razgovor. */
  loadThread(id: number, force = false): void {
    const existing = this.threadMap()[id];
    if (existing && existing.state !== 'error' && !force) return;
    if (!existing || existing.state === 'error') this.setThread(id, { messages: [], hasMore: false, state: 'loading', loadingOlder: false });

    this.api.messages(id, null, 30, this.quiet).subscribe({
      next: (page) => {
        const current = this.threadMap()[id];
        // Već učitane starije poruke ostaju; nove sa servera se dodaju, a poruke u slanju ostaju na kraju.
        const kept = current?.state === 'ready' ? current.messages.filter((m) => m.id > 0) : [];
        const sent = [...kept, ...page.items.filter((m) => !kept.some((k) => k.id === m.id))].sort((a, b) => a.id - b.id);
        const pending = (current?.messages ?? []).filter((m) => m.id < 0);
        const hasMore = current?.state === 'ready' && kept.length ? current.hasMore : page.hasMore;
        this.setThread(id, { messages: [...sent, ...pending], hasMore, state: 'ready', loadingOlder: false });
      },
      error: () => this.patchThread(id, (t) => (t.state === 'loading' ? { ...t, state: 'error' } : t)),
    });
  }

  loadOlder(id: number): void {
    const thread = this.threadMap()[id];
    if (!thread || !thread.hasMore || thread.loadingOlder || thread.state !== 'ready') return;
    const oldest = thread.messages.find((m) => m.id > 0);
    this.patchThread(id, (t) => ({ ...t, loadingOlder: true }));
    this.api.messages(id, oldest?.id ?? null, 30, this.quiet).subscribe({
      next: (page) =>
        this.patchThread(id, (t) => ({
          ...t,
          messages: [...page.items.filter((m) => !t.messages.some((x) => x.id === m.id)), ...t.messages],
          hasMore: page.hasMore,
          loadingOlder: false,
        })),
      error: () => this.patchThread(id, (t) => ({ ...t, loadingOlder: false })),
    });
  }

  /** Šalje poruku u postojeći razgovor; poruka se odmah prikazuje, a pri grešci ostaje sa opcijom ponovnog slanja. */
  send(conversationId: number, body: string): void {
    const temp: ThreadMessage = {
      id: this.nextTempId--,
      conversationId,
      fromVendor: this.isVendor(),
      body,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    this.patchThread(conversationId, (t) => ({ ...t, messages: [...t.messages, temp] }));
    this.api.send(conversationId, body, this.quiet).subscribe({
      next: (r) => {
        this.replaceTemp(conversationId, temp.id, r.message);
        this.upsert(r.conversation);
      },
      error: (e) =>
        this.patchThread(conversationId, (t) => ({
          ...t,
          messages: t.messages.map((m) => (m.id === temp.id ? { ...m, pending: false, error: apiErrorMessage(e) } : m)),
        })),
    });
  }

  /** Ponovno slanje poruke koja nije prošla. */
  retry(conversationId: number, tempId: number): void {
    const message = this.threadMap()[conversationId]?.messages.find((m) => m.id === tempId);
    if (!message) return;
    this.discard(conversationId, tempId);
    this.send(conversationId, message.body);
  }

  discard(conversationId: number, tempId: number): void {
    this.patchThread(conversationId, (t) => ({ ...t, messages: t.messages.filter((m) => m.id !== tempId) }));
  }

  /**
   * Prva poruka salonu. Razgovor dobija poruku odmah, pa nema praznog trenutka dok se prozor prebacuje na razgovor.
   * Ako je razgovor već postojao (lista nije bila potpuna), starije poruke se učitavaju skrolanjem.
   */
  start(vendorId: number, body: string): Observable<ChatSendResult> {
    const knownNew = this.listState() === 'ready' && this.complete() && !this.conversations().some((c) => c.vendorId === vendorId);
    return this.api.start(vendorId, body, this.quiet).pipe(
      tap((r) => {
        this.upsert(r.conversation);
        if (!this.threadMap()[r.conversation.id])
          this.setThread(r.conversation.id, { messages: [r.message], hasMore: !knownNew, state: 'ready', loadingOlder: false });
        else this.appendMessage(r.message);
      }),
    );
  }

  markRead(id: number): void {
    const c = this.conversation(id);
    if (!c || c.unreadCount === 0 || this.marking.has(id)) return;
    this.marking.add(id);
    this.upsert({ ...c, unreadCount: 0 });
    this.api.markRead(id, this.quiet).subscribe({
      next: (fresh) => this.upsert(fresh),
      error: () => this.marking.delete(id),
      complete: () => this.marking.delete(id),
    });
  }

  // ---------------- Prozori na desktopu ----------------

  readonly dockOpen = signal(false);
  readonly windows = signal<ChatWindow[]>([]);
  /** Ima li otvoren prozor ili lista (tada se "Moj plan" sklanja da ne prekriva razgovor). */
  readonly expanded = computed(() => this.dockOpen() || this.windows().some((w) => !w.minimized));

  /** Otvara razgovor: na desktopu u prozoru, na telefonu na stranici sandučeta. */
  open(target: ChatTarget): void {
    const resolved = this.normalize(target);
    if (!isDesktop()) {
      void this.router.navigateByUrl(
        'conversationId' in resolved ? `${this.inboxUrl()}/${resolved.conversationId}` : `/poruke/salon/${resolved.vendor.id}`,
      );
      return;
    }
    const key = targetKey(resolved);
    this.dockOpen.set(false);
    this.windows.update((list) => {
      const existing = list.find((w) => w.key === key);
      if (existing) return [{ ...existing, minimized: false }, ...list.filter((w) => w !== existing)];
      return [{ id: this.nextWindowId++, key, target: resolved, minimized: false }, ...list].slice(0, maxWindows());
    });
  }

  /** Prozor novog razgovora je dobio razgovor (prva poruka ili postojeći razgovor sa salonom). */
  bindWindow(key: string, conversation: Conversation): void {
    const target = { conversationId: conversation.id };
    const newKey = targetKey(target);
    this.windows.update((list) => {
      const others = list.filter((w) => w.key !== key && w.key !== newKey);
      const current = list.find((w) => w.key === key);
      return current ? [{ ...current, key: newKey, target }, ...others] : list;
    });
  }

  closeWindow(key: string): void {
    this.windows.update((list) => list.filter((w) => w.key !== key));
  }

  toggleWindow(key: string): void {
    this.windows.update((list) => list.map((w) => (w.key === key ? { ...w, minimized: !w.minimized } : w)));
  }

  // ---------------- Interno ----------------

  private normalize(target: ChatTarget): ChatTarget {
    if ('conversationId' in target) return target;
    const existing = this.conversations().find((c) => c.vendorId === target.vendor.id);
    return existing ? { conversationId: existing.id } : target;
  }

  private switchUser(id: number | null): void {
    if (id === this.userId) return;
    this.disconnect();
    this.userId = id;
    this.threadMap.set({});
    this.missing.set(new Set());
    this.windows.set([]);
    this.dockOpen.set(false);
    this.marking.clear();
    clearHints(id);

    const hint = id === null ? null : readHint(id);
    this.conversations.set(hint?.conversations ?? []);
    this.unreadTotal.set(hint?.unreadTotal ?? 0);
    this.complete.set(hint?.complete ?? false);
    this.listState.set(hint ? 'hinted' : 'unknown');

    if (id !== null) {
      this.refresh();
      this.connect(id);
    }
  }

  private connect(id: number): void {
    const hub = this.hubFactory(() => this.auth.token() ?? '');
    hub.on('message', (r) => this.receive(r));
    hub.on('conversation', (c) => this.upsert(c));
    // Poslije prekida: ono što je stiglo u međuvremenu dolazi sa servera.
    hub.onreconnected(() => this.resync());
    this.hub = hub;

    const start = () =>
      hub.start().catch(() => {
        // Server nedostupan: pokušaj kasnije; do tada se lista osvježava pri povratku na karticu.
        setTimeout(() => {
          if (this.hub === hub && this.userId === id) void start();
        }, RETRY_MS);
      });
    void start();
  }

  private disconnect(): void {
    const hub = this.hub;
    this.hub = null;
    if (hub) void hub.stop().catch(() => undefined);
  }

  private resync(): void {
    this.refresh();
    for (const id of Object.keys(this.threadMap())) this.loadThread(Number(id), true);
  }

  private receive({ conversation, message }: ChatSendResult): void {
    this.upsert(conversation);
    this.appendMessage(message);
  }

  private upsert(c: Conversation): void {
    const list = this.conversations();
    const old = list.find((x) => x.id === c.id);
    this.unreadTotal.update((total) => Math.max(0, total - (old?.unreadCount ?? 0) + c.unreadCount));
    this.conversations.set(sortByLatest([c, ...list.filter((x) => x.id !== c.id)]));
    this.writeHint();
  }

  /** Nova poruka sa servera (odgovor na slanje ili događaj uživo); ista poruka se ne dodaje dvaput. */
  private appendMessage(message: ChatMessage): void {
    this.patchThread(message.conversationId, (t) => {
      if (t.messages.some((m) => m.id === message.id)) return t;
      const sent = t.messages.filter((m) => m.id > 0);
      const pending = t.messages.filter((m) => m.id < 0);
      return { ...t, messages: [...sent, message].sort((a, b) => a.id - b.id).concat(pending) };
    });
  }

  private replaceTemp(conversationId: number, tempId: number, message: ChatMessage): void {
    this.patchThread(conversationId, (t) => ({ ...t, messages: t.messages.filter((m) => m.id !== tempId) }));
    this.appendMessage(message);
  }

  private setThread(id: number, thread: Thread): void {
    this.threadMap.update((map) => ({ ...map, [id]: thread }));
  }

  /** Mijenja učitan razgovor; razgovor koji nije otvaran ostaje neučitan (poruke se dohvate kad se otvori). */
  private patchThread(id: number, change: (t: Thread) => Thread): void {
    const thread = this.threadMap()[id];
    if (thread) this.setThread(id, change(thread));
  }

  /** Nagovještaj se piše samo iz potvrđenog stanja (odgovor ili događaj servera). */
  private writeHint(): void {
    if (this.userId === null || this.listState() !== 'ready') return;
    const conversations = this.conversations();
    const hint: Hint = {
      v: 1,
      unreadTotal: this.unreadTotal(),
      complete: this.complete() && conversations.length <= HINT_MAX,
      conversations: conversations.slice(0, HINT_MAX),
    };
    try {
      localStorage.setItem(HINT_PREFIX + this.userId, JSON.stringify(hint));
    } catch {
      /* storage nedostupan: prikaz čeka server */
    }
  }
}

function sortByLatest(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt) || b.id - a.id);
}

function targetKey(target: ChatTarget): string {
  return 'conversationId' in target ? `c${target.conversationId}` : `v${target.vendor.id}`;
}

function isDesktop(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(min-width: 48rem)').matches;
}

/**
 * Koliko prozora stane lijevo od trake "Poruke" (kao na Facebooku: najstariji se zatvara), najviše 3.
 * Mjere su iz chat-dock: traka 20rem, prozor 21rem, razmak 0.75rem, desna margina 2rem. Širina je bez trake za skrolanje.
 */
function maxWindows(): number {
  if (typeof document === 'undefined') return 1;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const free = document.documentElement.clientWidth - (2 + 20) * rem;
  return Math.max(1, Math.min(3, Math.floor(free / ((21 + 0.75) * rem))));
}

/** Briše nagovještaje svih drugih korisnika (i sve, kad niko nije prijavljen). */
function clearHints(keep: number | null): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(HINT_PREFIX) && key !== HINT_PREFIX + keep) localStorage.removeItem(key);
    }
  } catch {
    /* storage nedostupan */
  }
}

/** Nagovještaj samo ako je ispravnog oblika; sve ostalo se tretira kao da ga nema (i briše). */
function readHint(userId: number): Hint | null {
  const key = HINT_PREFIX + userId;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const hint = JSON.parse(raw) as Partial<Hint>;
    const valid =
      hint?.v === 1 &&
      typeof hint.unreadTotal === 'number' &&
      typeof hint.complete === 'boolean' &&
      Array.isArray(hint.conversations) &&
      hint.conversations.every(
        (c) =>
          typeof c?.id === 'number' &&
          typeof c.vendorId === 'number' &&
          typeof c.vendorName === 'string' &&
          typeof c.lastMessageAt === 'string' &&
          typeof c.lastMessagePreview === 'string' &&
          typeof c.unreadCount === 'number',
      );
    if (valid) return hint as Hint;
    localStorage.removeItem(key);
  } catch {
    /* neispravan JSON ili storage nedostupan */
  }
  return null;
}
