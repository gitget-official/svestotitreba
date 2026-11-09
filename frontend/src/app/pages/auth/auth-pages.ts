import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { apiErrorMessage } from '../../core/api';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast';
import { AvatarPicker } from '../../shared/ui/avatar-picker';
import { LoveLine } from '../../shared/motion/love-line';
import { Petals } from '../../shared/motion/petals';
import { toSignal } from '@angular/core/rxjs-interop';
import { GoogleButton } from '../../shared/ui/google-button';
import { LookupStore } from '../../core/lookups';
import { AuthResponse } from '../../core/models';

/** Poslije Google prijave: novi nalog ide na dovršavanje profila, postojeći tamo odakle je došao. */
function afterGoogle(router: Router, auth: AuthService, r: AuthResponse, povratak?: string): void {
  if (r.isNew) void router.navigate(['/dobrodosli'], { queryParams: { povratak: povratak || null } });
  else void router.navigateByUrl(povratak || auth.homeUrl());
}

const AUTH_STYLES = `
  // isolation: latice i linija (z-index −1) ostaju iznad pozadine stranice, a ispod kartice.
  :host {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    min-height: 100dvh;
    padding: var(--space-6) var(--space-4);
    background:
      radial-gradient(50rem 26rem at 90% -10%, var(--accent-soft), transparent 70%),
      radial-gradient(36rem 22rem at -10% 110%, var(--sage-soft), transparent 70%),
      var(--bg);
  }

  .panel {
    width: min(100%, 26rem);
    display: grid;
    gap: var(--space-5);
  }

  .panel.wide {
    width: min(100%, 34rem);
  }

  .brand {
    justify-self: center;
    color: var(--text);
  }

  .card {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-5);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
  }

  // Dijelovi kartice ulaze redom (naslov, slika, polja), blago podignuti, kao na ostatku stranice.
  .card > * {
    animation: rise 560ms var(--ease-out) both;
    animation-delay: calc(80ms + var(--n, 0) * 45ms);
  }

  .card > :nth-child(2) { --n: 1; }
  .card > :nth-child(3) { --n: 2; }
  .card > :nth-child(4) { --n: 3; }
  .card > :nth-child(5) { --n: 4; }
  .card > :nth-child(6) { --n: 5; }
  .card > :nth-child(7) { --n: 6; }
  .card > :nth-child(n + 8) { --n: 7; }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .section-label::before,
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--separator);
  }

  @media (prefers-reduced-motion: reduce) {
    .card > * {
      animation: fade var(--dur-fast) ease both;
      animation-delay: 0ms;
    }
  }

  .heading {
    display: grid;
    gap: var(--space-1);
    text-align: center;
  }

  .password {
    position: relative;
  }

  .password .input {
    padding-right: 3rem;
  }

  .reveal {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.5rem;
    cursor: pointer;
  }

  .footer {
    text-align: center;
  }

  .google {
    display: grid;
    gap: var(--space-3);
  }

  .or {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--separator);
  }

  details.staff summary {
    cursor: pointer;
    text-align: center;
    list-style: none;
    color: var(--text-secondary, inherit);
  }

  details.staff summary::-webkit-details-marker {
    display: none;
  }

  details.staff[open] summary {
    margin-bottom: var(--space-4);
  }

  details.staff .staff-form {
    display: grid;
    gap: var(--space-4);
  }

  .legal {
    text-align: center;
  }
`;

@Component({
  selector: 'app-login',
  // stranice prijave nisu u okviru aplikacije (shell), pa same nose glavni orijentir
  host: { role: 'main' },
  imports: [ReactiveFormsModule, RouterLink, Icon, BrandMark, Petals, LoveLine, GoogleButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-petals [count]="8" />
    <app-love-line mode="draw" [contentWidth]="520" />

    <div class="panel enter">
      <a class="brand" routerLink="/"><app-brand-mark /></a>

      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="heading">
          <h1 class="t-title-2 serif">Dobro došli nazad</h1>
          <p class="t-callout muted">Prijavite se da nastavite planiranje.</p>
        </div>

        @if (error()) {
          <div class="alert" role="alert">{{ error() }}</div>
        }

        <div class="google">
          <app-google-button text="signin_with" [showMissing]="true" (credential)="google($event)" />
          @if (googleBusy()) { <p class="t-footnote muted legal"><span class="spinner"></span> Prijavljujemo vas…</p> }
        </div>

        <!-- Saloni i administratori: korisničko ime i lozinka. Mladenci se prijavljuju preko Googlea. -->
        <details class="staff" [open]="staffOpen()">
          <summary class="t-footnote muted">Prijava korisničkim imenom i lozinkom</summary>
          <div class="staff-form">
        <div class="field">
          <label for="login">Korisničko ime ili e-mail</label>
          <input id="login" class="input" formControlName="login" autocomplete="username" autocapitalize="none" />
        </div>

        <div class="field">
          <label for="password">Lozinka</label>
          <div class="password">
            <input id="password" class="input" [type]="showPassword() ? 'text' : 'password'" formControlName="password"
              autocomplete="current-password" />
            <button type="button" class="reveal" (click)="showPassword.set(!showPassword())">
              {{ showPassword() ? 'Sakrij' : 'Prikaži' }}
            </button>
          </div>
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
          @if (busy()) { <span class="spinner"></span> } @else { Prijava <app-icon name="arrow-right" /> }
        </button>
          </div>
        </details>
      </form>

      <p class="footer t-callout muted">
        Nemate profil? <a routerLink="/registracija" [queryParams]="{ povratak: povratak() || null }">Registrujte se</a>
      </p>
    </div>
  `,
  styles: AUTH_STYLES,
})
export class Login {
  /** Query parametar `?povratak=/ruta` nakon preusmjeravanja sa zaštićene stranice. */
  readonly povratak = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    login: ['', Validators.required],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly googleBusy = signal(false);
  /** Forma za lozinku je otvorena ako je korisnik već počeo da je koristi (npr. greška u lozinci). */
  protected readonly staffOpen = signal(false);

  protected google(credential: string): void {
    this.googleBusy.set(true);
    this.error.set(null);
    this.auth.loginWithGoogle(credential).subscribe({
      next: (r) => afterGoogle(this.router, this.auth, r, this.povratak()),
      error: (e) => {
        this.googleBusy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected submit(): void {
    this.staffOpen.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Unesite korisničko ime i lozinku.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl(this.povratak() || this.auth.homeUrl()),
      error: () => {
        this.busy.set(false);
        this.error.set('Pogrešno korisničko ime ili lozinka.');
      },
    });
  }
}

/** Registracija mladenaca: za sada samo preko Googlea (bez lozinke, bez potvrde e-maila). */
@Component({
  selector: 'app-register',
  host: { role: 'main' },
  imports: [RouterLink, BrandMark, Petals, LoveLine, GoogleButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-petals [count]="10" [seed]="11" />
    <app-love-line mode="draw" [contentWidth]="640" />

    <div class="panel enter">
      <a class="brand" routerLink="/"><app-brand-mark /></a>

      <div class="card">
        <div class="heading">
          <h1 class="t-title-2 serif">Napravite profil</h1>
          <p class="t-callout muted">Za mladence. Jednim klikom, bez nove lozinke. Saloni dobijaju nalog od nas.</p>
        </div>

        @if (error()) {
          <div class="alert" role="alert">{{ error() }}</div>
        }

        <div class="google">
          <app-google-button text="signup_with" [showMissing]="true" (credential)="google($event)" />
          @if (busy()) { <p class="t-footnote muted legal"><span class="spinner"></span> Pravimo vaš profil…</p> }
        </div>

        <ul class="perks t-callout">
          <li>Sačuvajte omiljene ponuđače i uporedite ih</li>
          <li>Napravite plan vjenčanja u okviru budžeta</li>
          <li>Rezervišite termine i pratite ih na jednom mjestu</li>
        </ul>

        <p class="t-footnote muted legal">Nastavkom prihvatate uslove korištenja. Od Googlea uzimamo samo ime i e-mail adresu.</p>
      </div>

      <p class="footer t-callout muted">Već imate profil? <a routerLink="/prijava" [queryParams]="{ povratak: povratak() || null }">Prijavite se</a></p>
    </div>
  `,
  styles: AUTH_STYLES + `
    .perks {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .perks li {
      position: relative;
      padding-left: 1.5rem;
    }

    .perks li::before {
      content: '';
      position: absolute;
      left: 0.25rem;
      top: 0.55em;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--accent);
    }
  `,
})
export class Register {
  /** Povratak na stranicu sa koje je gost došao (npr. ponuđač kojeg je htio rezervisati). */
  readonly povratak = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected google(credential: string): void {
    this.busy.set(true);
    this.error.set(null);
    this.auth.loginWithGoogle(credential).subscribe({
      next: (r) => {
        if (!r.isNew) this.toasts.info('Već imate profil, prijavljeni ste.');
        afterGoogle(this.router, this.auth, r, this.povratak());
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}

/** Dovršavanje profila poslije prve prijave preko Googlea: slika, ime, prezime, grad i telefon. */
@Component({
  selector: 'app-welcome',
  host: { role: 'main' },
  imports: [ReactiveFormsModule, BrandMark, FieldError, AvatarPicker, Petals],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-petals [count]="10" [seed]="5" />

    <div class="panel wide enter">
      <span class="brand"><app-brand-mark /></span>

      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="heading">
          <h1 class="t-title-2 serif">Dobro došli, {{ auth.user()?.firstName }}!</h1>
          <p class="t-callout muted">Još par detalja i spremni ste. Sve možete promijeniti kasnije u profilu.</p>
        </div>

        <app-avatar-picker [(value)]="avatar" [firstName]="firstName()" [lastName]="lastName()" />

        <div class="form-grid">
          <div class="field">
            <label for="firstName">Ime</label>
            <input id="firstName" class="input" formControlName="firstName" autocomplete="given-name" />
<app-field-error [control]="form.controls.firstName" />
          </div>
          <div class="field">
            <label for="lastName">Prezime</label>
            <input id="lastName" class="input" formControlName="lastName" autocomplete="family-name" />
<app-field-error [control]="form.controls.lastName" />
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="city">Grad vjenčanja <span class="subtle">(opciono)</span></label>
            <select id="city" class="select" formControlName="cityId">
              <option [ngValue]="null">Nije odabrano</option>
              @for (city of lookups.cities(); track city.id) {
                <option [ngValue]="city.id">{{ city.name }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="phone">Telefon <span class="subtle">(opciono)</span></label>
            <input id="phone" class="input" type="tel" formControlName="phoneNumber" autocomplete="tel" />
<app-field-error [control]="form.controls.phoneNumber" />
          </div>
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
          @if (busy()) { <span class="spinner"></span> } @else { Sačuvaj i nastavi }
        </button>
        <button class="btn btn-plain" type="button" (click)="skip()">Preskoči za sada</button>
      </form>
    </div>
  `,
  styles: AUTH_STYLES,
})
export class Welcome {
  readonly povratak = input<string>();

  protected readonly auth = inject(AuthService);
  protected readonly lookups = inject(LookupStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  private readonly user = this.auth.user();
  protected readonly form = inject(FormBuilder).group({
    firstName: [this.user?.firstName ?? '', [Validators.required, ...V.personName]],
    lastName: [this.user?.lastName ?? '', [Validators.required, ...V.personName]],
    cityId: [this.user?.cityId ?? null as number | null],
    phoneNumber: [this.user?.phoneNumber ?? '', V.phone],
  });
  protected readonly busy = signal(false);
  protected readonly avatar = signal<string | null>(this.user?.avatarUrl ?? null);
  protected readonly firstName = toSignal(this.form.controls.firstName.valueChanges, { initialValue: this.user?.firstName ?? '' });
  protected readonly lastName = toSignal(this.form.controls.lastName.valueChanges, { initialValue: this.user?.lastName ?? '' });

  constructor() {
    this.lookups.ensureLoaded(false, true);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.auth.updateProfile({
      firstName: (v.firstName ?? '').trim(),
      lastName: (v.lastName ?? '').trim(),
      cityId: v.cityId ?? null,
      phoneNumber: v.phoneNumber || null,
      avatarUrl: this.avatar(),
    }).subscribe({
      next: (u) => {
        this.toasts.success(`Sve je spremno, ${u.firstName}!`);
        this.go();
      },
      error: () => this.busy.set(false),
    });
  }

  protected skip(): void {
    this.go();
  }

  private go(): void {
    void this.router.navigateByUrl(this.povratak() || '/istrazi');
  }
}

/** FR-3: obavezna promjena lozinke nakon prve prijave (nalog kreirao administrator). */
@Component({
  selector: 'app-change-password',
  host: { role: 'main' },
  imports: [ReactiveFormsModule, BrandMark, FieldError, Petals],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-petals [count]="6" />

    <div class="panel enter">
      <span class="brand"><app-brand-mark /></span>
      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="heading">
          <h1 class="t-title-2 serif">Postavite svoju lozinku</h1>
          <p class="t-callout muted">Vaš nalog je napravio administrator. Prije nastavka odaberite novu lozinku.</p>
        </div>
        <div class="field">
          <label for="current">Privremena lozinka</label>
          <input id="current" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="new">Nova lozinka</label>
          <input id="new" class="input" type="password" formControlName="newPassword" autocomplete="new-password" />
<app-field-error [control]="form.controls.newPassword" />
          <span class="hint">Najmanje 8 znakova.</span>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy() || form.invalid">
          @if (busy()) { <span class="spinner"></span> } @else { Sačuvaj i nastavi }
        </button>
        <button class="btn btn-plain" type="button" (click)="auth.logout()">Odjava</button>
      </form>
    </div>
  `,
  styles: AUTH_STYLES,
})
export class ChangePassword {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, ...V.password]],
  });
  protected readonly busy = signal(false);

  protected submit(): void {
    this.busy.set(true);
    this.auth.changePassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.toasts.success('Lozinka je promijenjena.');
        void this.router.navigateByUrl(this.auth.homeUrl());
      },
      error: () => this.busy.set(false),
    });
  }
}
