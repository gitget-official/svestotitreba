import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth';
import { CHAT_HUB_FACTORY, ChatHub, ChatStore } from './chat-store';
import { ChatMessage, Conversation, ConversationList, UserRole } from './models';

const conversation = (id: number, patch: Partial<Conversation> = {}): Conversation => ({
  id,
  vendorId: 100 + id,
  vendorName: `Salon ${id}`,
  vendorSlug: `salon-${id}`,
  vendorLogoUrl: null,
  coupleUserId: 5,
  coupleFirstName: 'Lejla',
  coupleLastName: 'Begić',
  coupleAvatarUrl: null,
  createdAt: '2026-11-10T10:00:00Z',
  lastMessageAt: `2026-11-1${id % 10}T10:00:00Z`,
  lastMessagePreview: 'Pozdrav',
  lastMessageFromVendor: false,
  unreadCount: 0,
  otherLastReadMessageId: 0,
  canReply: true,
  ...patch,
});

const list = (items: Conversation[], unreadTotal = 0): ConversationList => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 50,
  unreadTotal,
});

const message = (id: number, conversationId: number, body = 'Poruka'): ChatMessage => ({
  id,
  conversationId,
  fromVendor: false,
  body,
  createdAt: '2026-11-12T10:00:00Z',
});

class FakeHub implements ChatHub {
  readonly handlers: Record<string, (payload: never) => void> = {};
  started = 0;
  stopped = 0;
  on(event: string, handler: (payload: never) => void): void {
    this.handlers[event] = handler;
  }
  onreconnected(): void {}
  start(): Promise<void> {
    this.started++;
    return Promise.resolve();
  }
  stop(): Promise<void> {
    this.stopped++;
    return Promise.resolve();
  }
}

function setup() {
  const user = signal<{ id: number; role: UserRole } | null>(null);
  const hub = new FakeHub();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: CHAT_HUB_FACTORY, useValue: () => hub },
      {
        provide: AuthService,
        useValue: { user, role: computed(() => user()?.role ?? null), token: computed(() => (user() ? 'token' : null)) },
      },
    ],
  });
  const store = TestBed.inject(ChatStore);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  const login = (id = 5, role: UserRole = 'Couple') => {
    user.set({ id, role });
    TestBed.tick();
  };
  return { store, http, hub, user, login };
}

const listUrl = (r: { url: string }) => r.url === '/api/conversations';

describe('ChatStore', () => {
  beforeEach(() => localStorage.clear());

  it('bez nagovještaja: dok server ne odgovori, stanje je nepoznato (ni lista ni "nemate poruka")', () => {
    const { store, http, login } = setup();
    login();

    const req = http.expectOne(listUrl);
    expect(store.listState()).toBe('unknown');
    expect(store.unreadTotal()).toBe(0);

    req.flush(list([]));
    expect(store.listState()).toBe('ready');
    expect(store.conversations()).toEqual([]);
  });

  it('nagovještaj iscrta listu i značku prije odgovora, a server ima zadnju riječ', () => {
    localStorage.setItem(
      'planiraj.chat.5',
      JSON.stringify({ v: 1, unreadTotal: 2, complete: true, conversations: [conversation(1, { unreadCount: 2 })] }),
    );
    const { store, http, login } = setup();
    login();

    // Zahtjev još traje: prikaz je već tačan.
    const req = http.expectOne(listUrl);
    expect(store.listState()).toBe('hinted');
    expect(store.unreadTotal()).toBe(2);
    expect(store.conversations().map((c) => c.id)).toEqual([1]);

    req.flush(list([conversation(2), conversation(1)], 0));
    expect(store.listState()).toBe('ready');
    expect(store.unreadTotal()).toBe(0);
    expect(store.conversations().map((c) => c.id)).toEqual([2, 1]);
    expect(JSON.parse(localStorage.getItem('planiraj.chat.5')!).conversations).toHaveLength(2);
  });

  it('neispravan nagovještaj se tretira kao da ga nema i briše se', () => {
    localStorage.setItem('planiraj.chat.5', JSON.stringify({ v: 1, unreadTotal: 'x', conversations: 'nije lista' }));
    const { store, http, login } = setup();
    login();

    expect(store.listState()).toBe('unknown');
    expect(localStorage.getItem('planiraj.chat.5')).toBeNull();
    http.expectOne(listUrl).flush(list([]));
  });

  it('odjava briše nagovještaj, stanje i vezu uživo', () => {
    const { store, http, hub, user, login } = setup();
    login();
    http.expectOne(listUrl).flush(list([conversation(1, { unreadCount: 1 })], 1));
    expect(localStorage.getItem('planiraj.chat.5')).not.toBeNull();
    expect(hub.started).toBe(1);

    user.set(null);
    TestBed.tick();
    expect(localStorage.getItem('planiraj.chat.5')).toBeNull();
    expect(store.conversations()).toEqual([]);
    expect(store.unreadTotal()).toBe(0);
    expect(store.listState()).toBe('unknown');
    expect(hub.stopped).toBe(1);
  });

  it('nagovještaj drugog korisnika na istom pregledniku se briše', () => {
    localStorage.setItem('planiraj.chat.9', JSON.stringify({ v: 1, unreadTotal: 0, complete: true, conversations: [] }));
    const { http, login } = setup();
    login(5);
    expect(localStorage.getItem('planiraj.chat.9')).toBeNull();
    http.expectOne(listUrl).flush(list([]));
  });

  it('administrator nema poruke: nema zahtjeva ni veze', () => {
    const { store, http, hub, login } = setup();
    login(1, 'Admin');
    expect(store.enabled()).toBe(false);
    http.expectNone(listUrl);
    expect(hub.started).toBe(0);
  });

  it('poslana poruka se prikazuje odmah i ne duplira kad stigne i uživo i kao odgovor', () => {
    const { store, http, hub, login } = setup();
    login();
    http.expectOne(listUrl).flush(list([conversation(1)]));
    store.loadThread(1);
    http.expectOne((r) => r.url === '/api/conversations/1/messages').flush({ items: [message(10, 1, 'Prva')], hasMore: false });

    store.send(1, 'Druga');
    expect(store.threads()[1].messages.map((m) => [m.body, !!m.pending])).toEqual([
      ['Prva', false],
      ['Druga', true],
    ]);

    // Događaj uživo stigne prije odgovora na slanje.
    const sent = message(11, 1, 'Druga');
    hub.handlers['message']({ conversation: conversation(1, { lastMessagePreview: 'Druga' }), message: sent } as never);
    http.expectOne('/api/conversations/1/messages').flush({ conversation: conversation(1), message: sent });

    expect(store.threads()[1].messages.map((m) => m.id)).toEqual([10, 11]);
  });

  it('neuspjelo slanje ostaje u razgovoru sa porukom greške', () => {
    const { store, http, login } = setup();
    login();
    http.expectOne(listUrl).flush(list([conversation(1)]));
    store.loadThread(1);
    http.expectOne((r) => r.url === '/api/conversations/1/messages').flush({ items: [], hasMore: false });

    store.send(1, 'Ne prolazi');
    http.expectOne('/api/conversations/1/messages').flush({ status: 400, message: 'Salon ne prima poruke.' }, { status: 400, statusText: 'Bad Request' });

    const [failed] = store.threads()[1].messages;
    expect(failed.body).toBe('Ne prolazi');
    expect(failed.error).toBe('Salon ne prima poruke.');
  });

  it('potpuna lista: "već ste pisali ovom salonu" se zna bez servera', () => {
    const { store, http, login } = setup();
    login();
    http.expectOne(listUrl).flush(list([conversation(1)]));

    let result: Conversation | null | undefined;
    store.findForVendor(999).subscribe((c) => (result = c));
    expect(result).toBeNull();
    store.findForVendor(101).subscribe((c) => (result = c));
    expect(result?.id).toBe(1);
    http.expectNone((r) => r.url.startsWith('/api/conversations/vendor'));
  });

  it('dok lista nije potvrđena, postojanje razgovora se pita server', () => {
    localStorage.setItem('planiraj.chat.5', JSON.stringify({ v: 1, unreadTotal: 0, complete: true, conversations: [] }));
    const { store, http, login } = setup();
    login();

    let result: Conversation | null | undefined;
    store.findForVendor(101).subscribe((c) => (result = c));
    // Nagovještaj kaže "nema razgovora", ali to nije potvrđeno: odgovor čeka server.
    expect(result).toBeUndefined();
    http.expectOne('/api/conversations/vendor/101').flush(conversation(1));
    expect(result?.id).toBe(1);
    http.expectOne(listUrl).flush(list([conversation(1)]));
  });

  it('nepročitano: događaj uživo povećava, a čitanje smanjuje ukupan broj', () => {
    const { store, http, hub, login } = setup();
    login();
    http.expectOne(listUrl).flush(list([conversation(1)]));

    hub.handlers['message']({ conversation: conversation(1, { unreadCount: 1 }), message: message(20, 1) } as never);
    expect(store.unreadTotal()).toBe(1);

    store.markRead(1);
    expect(store.unreadTotal()).toBe(0);
    http.expectOne('/api/conversations/1/read').flush(conversation(1));
    expect(store.unreadTotal()).toBe(0);
  });
});
