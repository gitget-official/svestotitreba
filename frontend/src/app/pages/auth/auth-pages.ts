import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast';
import { AvatarPicker } from '../../shared/ui/avatar-picker';
import { LoveLine } from '../../shared/motion/love-line';
import { Petals } from '../../shared/motion/petals';
import { toSignal } from '@angular/core/rxjs-interop';

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
`;

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Icon, BrandMark, Petals, LoveLine],
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

  protected submit(): void {
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

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, BrandMark, FieldError, AvatarPicker, Petals, LoveLine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-petals [count]="10" [seed]="11" />
    <app-love-line mode="draw" [contentWidth]="640" />

    <div class="panel wide enter">
      <a class="brand" routerLink="/"><app-brand-mark /></a>

      <form class="card" [formGroup]="form" (ngSubmit)="submit()">
        <div class="heading">
          <h1 class="t-title-2 serif">Napravite profil</h1>
          <p class="t-callout muted">Za mladence. Saloni dobijaju nalog od nas.</p>
        </div>

        <app-avatar-picker [(value)]="avatar" [firstName]="firstName()" [lastName]="lastName()" />

        <p class="section-label t-caption muted">Vaši podaci</p>

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

        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="email" />
<app-field-error [control]="form.controls.email" />
        </div>

        <div class="field">
          <label for="username">Korisničko ime</label>
          <input id="username" class="input" formControlName="username" autocomplete="username" autocapitalize="none" />
<app-field-error [control]="form.controls.username" />
        </div>

        <div class="field">
          <label for="phone">Telefon <span class="subtle">(opciono)</span></label>
          <input id="phone" class="input" type="tel" formControlName="phoneNumber" autocomplete="tel" />
<app-field-error [control]="form.controls.phoneNumber" />
        </div>

        <div class="field">
          <label for="password">Lozinka</label>
          <div class="password">
            <input id="password" class="input" [type]="showPassword() ? 'text' : 'password'" formControlName="password"
              autocomplete="new-password" />
            <button type="button" class="reveal" (click)="showPassword.set(!showPassword())">
              {{ showPassword() ? 'Sakrij' : 'Prikaži' }}
            </button>
          </div>
<app-field-error [control]="form.controls.password" />
          <span class="hint">Najmanje 8 znakova, barem jedno slovo i jedan broj.</span>
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">
          @if (busy()) { <span class="spinner"></span> } @else { Napravi profil }
        </button>
      </form>

      <p class="footer t-callout muted">Već imate profil? <a routerLink="/prijava" [queryParams]="{ povratak: povratak() || null }">Prijavite se</a></p>
    </div>
  `,
  styles: AUTH_STYLES,
})
export class Register {
  /** Povratak na stranicu sa koje je gost došao (npr. ponuđač kojeg je htio rezervisati). */
  readonly povratak = input<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    firstName: ['', [Validators.required, ...V.personName]],
    lastName: ['', [Validators.required, ...V.personName]],
    email: ['', [Validators.required, ...V.email]],
    username: ['', [Validators.required, ...V.username]],
    phoneNumber: ['', V.phone],
    password: ['', [Validators.required, ...V.password]],
  });
  protected readonly busy = signal(false);
  protected readonly showPassword = signal(false);
  /** Profilna slika iz pregleda: lik, fotografija ili null (inicijali). */
  protected readonly avatar = signal<string | null>(null);
  protected readonly firstName = toSignal(this.form.controls.firstName.valueChanges, { initialValue: '' });
  protected readonly lastName = toSignal(this.form.controls.lastName.valueChanges, { initialValue: '' });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    const value = this.form.getRawValue();
    this.auth.register({ ...value, phoneNumber: value.phoneNumber || null, avatarUrl: this.avatar() }).subscribe({
      next: (r) => {
        this.toasts.success(`Dobro došli, ${r.user.firstName}!`);
        void this.router.navigateByUrl(this.povratak() || '/istrazi');
      },
      error: () => this.busy.set(false),
    });
  }
}

/** FR-3: obavezna promjena lozinke nakon prve prijave (nalog kreirao administrator). */
@Component({
  selector: 'app-change-password',
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
