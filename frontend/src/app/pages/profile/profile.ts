import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { AuthService } from '../../core/auth';
import { ROLE_LABEL, initials } from '../../core/format';
import { LookupStore } from '../../core/lookups';
import { ThemePreference, ThemeService } from '../../core/theme';
import { ToastService } from '../../shared/ui/toast';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page enter narrow">
      @if (auth.user(); as user) {
        <header class="hero">
          <span class="avatar">{{ initials(user.firstName, user.lastName) }}</span>
          <div>
            <h1 class="t-title-1">{{ user.firstName }} {{ user.lastName }}</h1>
            <p class="muted">{{ roleLabel[user.role] }} · {{ user.email }}</p>
          </div>
        </header>
      }

      <section class="stack">
        <h2 class="t-title-3">Lični podaci</h2>
        <form class="card card-pad stack" [formGroup]="profile" (ngSubmit)="saveProfile()">
          <div class="form-grid">
            <div class="field">
              <label for="firstName">Ime</label>
              <input id="firstName" class="input" formControlName="firstName" />
<app-field-error [control]="profile.controls.firstName" />
            </div>
            <div class="field">
              <label for="lastName">Prezime</label>
              <input id="lastName" class="input" formControlName="lastName" />
<app-field-error [control]="profile.controls.lastName" />
            </div>
            <div class="field">
              <label for="phone">Telefon</label>
              <input id="phone" class="input" type="tel" formControlName="phoneNumber" />
<app-field-error [control]="profile.controls.phoneNumber" />
            </div>
            <div class="field">
              <label for="city">Grad</label>
              <select id="city" class="select" formControlName="cityId">
                <option [ngValue]="null">Nije odabrano</option>
                @for (city of lookups.cities(); track city.id) {
                  <option [ngValue]="city.id">{{ city.name }}</option>
                }
              </select>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" [disabled]="profile.invalid || profile.pristine || savingProfile()">
              Sačuvaj promjene
            </button>
          </div>
        </form>
      </section>

      <section class="stack">
        <h2 class="t-title-3">Lozinka</h2>
        <form class="card card-pad stack" [formGroup]="password" (ngSubmit)="savePassword()">
          <div class="form-grid">
            <div class="field">
              <label for="current">Trenutna lozinka</label>
              <input id="current" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="new">Nova lozinka</label>
              <input id="new" class="input" type="password" formControlName="newPassword" autocomplete="new-password" />
<app-field-error [control]="password.controls.newPassword" />
              <span class="hint">Najmanje 8 znakova.</span>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn" type="submit" [disabled]="password.invalid || savingPassword()">Promijeni lozinku</button>
          </div>
        </form>
      </section>

      <section class="stack">
        <h2 class="t-title-3">Izgled</h2>
        <div class="card card-pad row-wrap between">
          <span>Tema</span>
          <div class="segmented" role="radiogroup" aria-label="Tema">
            @for (option of themes; track option.value) {
              <button type="button" role="radio" [attr.aria-checked]="theme.preference() === option.value"
                [class.is-active]="theme.preference() === option.value" (click)="theme.set(option.value)">
                {{ option.label }}
              </button>
            }
          </div>
        </div>
      </section>

      <button class="btn btn-danger btn-block logout" type="button" (click)="auth.logout()">Odjava</button>
    </div>
  `,
  styles: `
    .narrow {
      max-width: 44rem;
      display: grid;
      gap: var(--space-6);
    }

    .hero {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }

    .avatar {
      display: grid;
      place-items: center;
      flex: none;
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 1.375rem;
      font-weight: 700;
    }

    .between {
      justify-content: space-between;
    }

    .logout {
      max-width: 20rem;
      justify-self: center;
    }
  `,
})
export class Profile implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly lookups = inject(LookupStore);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly initials = initials;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'Sistemska' },
    { value: 'light', label: 'Svijetla' },
    { value: 'dark', label: 'Tamna' },
  ];

  protected readonly profile = this.fb.group({
    firstName: this.fb.nonNullable.control('', [Validators.required, ...V.personName]),
    lastName: this.fb.nonNullable.control('', [Validators.required, ...V.personName]),
    phoneNumber: this.fb.control<string | null>(null, V.phone),
    cityId: this.fb.control<number | null>(null),
  });

  protected readonly password = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, ...V.password]],
  });

  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);

  ngOnInit(): void {
    this.lookups.ensureLoaded();
    const user = this.auth.user();
    if (user) {
      this.profile.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        cityId: user.cityId,
      });
    }
  }

  protected saveProfile(): void {
    this.savingProfile.set(true);
    const value = this.profile.getRawValue();
    this.auth.updateProfile({ ...value, phoneNumber: value.phoneNumber || null }).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.profile.markAsPristine();
        this.toasts.success('Profil je sačuvan.');
      },
      error: () => this.savingProfile.set(false),
    });
  }

  protected savePassword(): void {
    this.savingPassword.set(true);
    this.auth.changePassword(this.password.getRawValue()).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.password.reset();
        this.toasts.success('Lozinka je promijenjena.');
      },
      error: () => this.savingPassword.set(false),
    });
  }
}
