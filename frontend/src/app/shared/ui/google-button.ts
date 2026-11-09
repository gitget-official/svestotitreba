import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth';

/** Minimalni tipovi za Google Identity Services (https://accounts.google.com/gsi/client). */
interface GoogleId {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; context?: string; itp_support?: boolean }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiLoading: Promise<void> | null = null;

/** Učitava Googleovu skriptu jednom za cijelu aplikaciju. */
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsiLoading = null;
      reject(new Error('Google skripta se nije učitala.'));
    };
    document.head.appendChild(s);
  });
  return gsiLoading;
}

/**
 * Googleovo dugme "Nastavi sa Googleom". Kad korisnik izabere nalog, emituje ID token (credential)
 * koji ide na backend. Ako Google prijava nije podešena na backendu, dugme se ne prikazuje.
 */
@Component({
  selector: 'app-google-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (clientId()) {
      <div class="gbtn" #host [attr.aria-busy]="!ready()"></div>
      @if (failed()) {
        <p class="t-footnote muted fail">Google prijava se nije učitala. Provjerite internet ili blokator reklama.</p>
      }
    } @else if (configLoaded() && showMissing()) {
      <p class="t-footnote muted fail">Prijava preko Googlea još nije podešena.</p>
    }
  `,
  styles: `
    :host { display: grid; justify-items: center; min-height: 44px; }
    .gbtn { min-height: 44px; display: flex; justify-content: center; width: 100%; }
    .fail { text-align: center; margin: 0; }
  `,
})
export class GoogleButton implements OnDestroy {
  /** 'signin_with' (Prijava sa Googleom), 'signup_with' (Registracija sa Googleom) ili 'continue_with'. */
  readonly text = input<'signin_with' | 'signup_with' | 'continue_with'>('continue_with');
  /** Prikaži napomenu kad Google prijava nije podešena (korisno u razvoju). */
  readonly showMissing = input(false);
  readonly credential = output<string>();

  private readonly auth = inject(AuthService);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  private readonly config = toSignal(this.auth.config());
  protected readonly clientId = () => this.config()?.googleClientId ?? null;
  protected readonly configLoaded = () => this.config() !== undefined;
  protected readonly ready = signal(false);
  protected readonly failed = signal(false);
  private observer?: ResizeObserver;

  constructor() {
    effect(() => {
      const el = this.host()?.nativeElement, id = this.clientId();
      if (!el || !id) return;
      loadGsi().then(() => this.render(el, id)).catch(() => this.failed.set(true));
    });
  }

  private render(el: HTMLElement, clientId: string): void {
    const gid = window.google!.accounts.id;
    gid.initialize({
      client_id: clientId,
      callback: (r) => this.credential.emit(r.credential),
      ux_mode: 'popup',
      context: this.text() === 'signup_with' ? 'signup' : 'signin',
      itp_support: true,
    });
    const draw = () => {
      el.innerHTML = '';
      const t = document.documentElement.dataset['theme'];
      const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      gid.renderButton(el, {
        type: 'standard',
        theme: dark ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: this.text(),
        logo_alignment: 'center',
        locale: 'bs',
        // Google dozvoljava širinu od 200 do 400 px
        width: Math.max(200, Math.min(400, Math.floor(el.clientWidth || 320))),
      });
      this.ready.set(true);
    };
    draw();
    // ponovo nacrtaj kad se promijeni širina (okretanje telefona)
    let last = el.clientWidth;
    this.observer = new ResizeObserver(() => { if (Math.abs(el.clientWidth - last) > 24) { last = el.clientWidth; draw(); } });
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
