import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { VendorApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { LookupStore } from '../../core/lookups';
import { AppValidators as V } from '../../core/validators';
import { FieldError } from '../../shared/ui/field-error';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast';

/**
 * Postavljanje salona poslije registracije preko Googlea: osnovni podaci (naziv, grad, kontakt, opis).
 * Salon se odmah objavljuje, a usluge, cijene, slike i radno vrijeme dodaje na stranici za uređivanje.
 */
@Component({
  selector: 'app-vendor-setup',
  imports: [ReactiveFormsModule, RouterLink, FieldError, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page narrow enter">
      <header class="page-header">
        <div>
          <p class="t-eyebrow">Korak 1 od 2</p>
          <h1 class="t-title-1">Postavite svoj salon</h1>
          <p class="muted">
            Osnovni podaci o salonu. Usluge, cijene i fotografije dodajete u sljedećem koraku.
          </p>
        </div>
      </header>

      @if (checking()) {
        <div class="skeleton form-skeleton"></div>
      } @else {
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <section class="card card-pad stack">
            <h2 class="t-title-3">Salon</h2>
            <div class="form-grid">
              <div class="field span-all">
                <label for="s-name">Naziv salona</label>
                <input
                  id="s-name"
                  class="input"
                  formControlName="name"
                  placeholder="npr. Sala Panorama"
                />
                <app-field-error [control]="form.controls.name" />
              </div>
              <div class="field">
                <label for="s-city">Grad</label>
                <select id="s-city" class="select" formControlName="cityId">
                  <option [ngValue]="0" disabled>Izaberite grad</option>
                  @for (c of lookups.cities(); track c.id) {
                    <option [ngValue]="c.id">{{ c.name }}</option>
                  }
                </select>
                <app-field-error [control]="form.controls.cityId" />
              </div>
              <div class="field">
                <label for="s-address">Adresa</label>
                <input
                  id="s-address"
                  class="input"
                  formControlName="address"
                  autocomplete="street-address"
                />
                <app-field-error [control]="form.controls.address" />
              </div>
              <div class="field span-all">
                <label for="s-description">Opis</label>
                <textarea
                  id="s-description"
                  class="textarea"
                  rows="5"
                  formControlName="description"
                  placeholder="Šta nudite, za koliko gostiju, šta vas izdvaja…"
                ></textarea>
                <app-field-error [control]="form.controls.description" />
                <span class="hint"
                  >Mladenci ovo čitaju prvo. Dva-tri konkretna pasusa su dovoljna.</span
                >
              </div>
            </div>
          </section>

          <section class="card card-pad stack">
            <h2 class="t-title-3">Kontakt</h2>
            <div class="form-grid">
              <div class="field">
                <label for="s-phone">Telefon</label>
                <input
                  id="s-phone"
                  class="input"
                  type="tel"
                  formControlName="phoneNumber"
                  autocomplete="tel"
                />
                <app-field-error [control]="form.controls.phoneNumber" />
              </div>
              <div class="field">
                <label for="s-email">E-mail</label>
                <input
                  id="s-email"
                  class="input"
                  type="email"
                  formControlName="email"
                  autocomplete="email"
                />
                <app-field-error [control]="form.controls.email" />
              </div>
              <div class="field">
                <label for="s-web">Web stranica</label>
                <input id="s-web" class="input" formControlName="website" placeholder="https://" />
                <app-field-error [control]="form.controls.website" />
              </div>
              <div class="field">
                <label for="s-ig">Instagram</label>
                <input
                  id="s-ig"
                  class="input"
                  formControlName="instagramUrl"
                  placeholder="https://instagram.com/…"
                />
                <app-field-error [control]="form.controls.instagramUrl" />
              </div>
            </div>
          </section>

          <div class="form-actions">
            <button class="btn btn-primary btn-lg" type="submit" [disabled]="busy()">
              @if (busy()) {
                <span class="spinner"></span>
              }
              Napravi salon <app-icon name="chevron-right" />
            </button>
          </div>
          <p class="t-footnote muted">
            Salon se odmah prikazuje mladencima. Sve možete promijeniti kasnije. Nastavkom
            prihvatate
            <a routerLink="/uslovi">uslove korištenja</a>.
          </p>
        </form>
      }
    </div>
  `,
  styles: `
    .narrow {
      max-width: 48rem;
    }
    .form-skeleton {
      height: 24rem;
      border-radius: var(--radius-lg);
    }
  `,
})
export class VendorSetup implements OnInit {
  protected readonly lookups = inject(LookupStore);
  private readonly auth = inject(AuthService);
  private readonly api = inject(VendorApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly checking = signal(true);
  protected readonly busy = signal(false);

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, ...V.businessName]),
    cityId: this.fb.nonNullable.control(0, Validators.min(1)),
    address: this.fb.control<string | null>(null, V.text(200)),
    description: this.fb.control<string | null>(null, V.text(2000)),
    phoneNumber: this.fb.control<string | null>(null, V.phone),
    email: this.fb.control<string | null>(this.auth.user()?.email ?? null, V.email),
    website: this.fb.control<string | null>(null, V.url),
    instagramUrl: this.fb.control<string | null>(null, V.social('instagram.com')),
  });

  ngOnInit(): void {
    this.lookups.ensureLoaded();
    // Salon već postoji (npr. ponovni klik na link): idi na njegovo uređivanje.
    const userId = this.auth.user()?.id;
    this.api.list({ ownerUserId: userId, pageSize: 1 }).subscribe({
      next: (r) => {
        if (r.items.length)
          void this.router.navigate(['/salon', r.items[0].id], { replaceUrl: true });
        else this.checking.set(false);
      },
      error: () => this.checking.set(false),
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);
    this.busy.set(true);
    this.api
      .create({
        name: v.name.trim(),
        cityId: v.cityId,
        address: blank(v.address),
        description: blank(v.description),
        phoneNumber: blank(v.phoneNumber),
        email: blank(v.email),
        website: blank(v.website),
        instagramUrl: blank(v.instagramUrl),
        facebookUrl: null,
        tikTokUrl: null,
        logoUrl: null,
        latitude: null,
        longitude: null,
        bookingEnabled: false,
        autoConfirmBookings: false,
        requiresDeposit: false,
        depositNote: null,
        ownerUserId: null,
      })
      .subscribe({
        next: (vendor) => {
          this.toasts.success('Salon je napravljen. Sada dodajte usluge i fotografije.');
          void this.router.navigate(['/salon', vendor.id], {
            queryParams: { kartica: 'usluge' },
            replaceUrl: true,
          });
        },
        error: () => this.busy.set(false),
      });
  }
}
