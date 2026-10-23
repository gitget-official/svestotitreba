import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { OfferingApi, VendorApi, VendorImageApi, WorkingHourApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { DAYS, formatPriceRange, formatTime, toTimeOnly } from '../../core/format';
import { LookupStore } from '../../core/lookups';
import { DayOfWeek, Offering, Vendor, VendorImage } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { TimeField } from '../../shared/ui/date-time-fields';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

type Tab = 'stranica' | 'usluge' | 'galerija' | 'radno-vrijeme';

interface HourRow {
  day: DayOfWeek;
  label: string;
  id: number | null;
  isClosed: boolean;
  open: string;
  close: string;
}

/**
 * Uređivanje salona (FR-10 – FR-12, FR-19): koristi ga vlasnik (/salon/:id) i administrator (/admin/ponudjaci/:id).
 */
@Component({
  selector: 'app-vendor-manage',
  imports: [RouterLink, ReactiveFormsModule, FormsModule, Icon, Sheet, TimeField, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <a class="btn btn-plain back" [routerLink]="backLink()"><app-icon name="chevron-left" /> {{ backLabel() }}</a>

      @if (vendor(); as v) {
        <header class="page-header">
          <div>
            <h1 class="t-title-1">{{ v.name }}</h1>
            <p class="muted row-wrap">
              <span>{{ v.cityName }}</span>
              @if (!v.isActive) { <span class="badge badge-danger">Neaktivan</span> }
              @if (v.isFeatured) { <span class="badge badge-gold">Istaknut · {{ v.subscriptionPlanName }}</span> }
            </p>
          </div>
          <a class="btn" [routerLink]="['/ponudjaci', v.id]"><app-icon name="globe" /> Javna stranica</a>
        </header>

        <div class="segmented tabs" role="tablist">
          @for (t of tabs; track t.key) {
            <button type="button" role="tab" [class.is-active]="tab() === t.key" [attr.aria-selected]="tab() === t.key"
              (click)="tab.set(t.key)">{{ t.label }}</button>
          }
        </div>

        @switch (tab()) {
          @case ('stranica') {
            <form class="stack enter" [formGroup]="form" (ngSubmit)="saveProfile()">
              <section class="card card-pad stack">
                <h2 class="t-title-3">Osnovno</h2>
                <div class="form-grid">
                  <div class="field span-all">
                    <label for="name">Naziv</label>
                    <input id="name" class="input" formControlName="name" />
<app-field-error [control]="form.controls.name" />
                  </div>
                  <div class="field span-all">
                    <label for="description">Opis</label>
                    <textarea id="description" class="textarea" rows="5" formControlName="description"></textarea>
<app-field-error [control]="form.controls.description" />
                  </div>
                  <div class="field">
                    <label for="logo">Logo (URL)</label>
                    <input id="logo" class="input" formControlName="logoUrl" placeholder="https://" />
<app-field-error [control]="form.controls.logoUrl" />
                  </div>
                </div>
              </section>

              <section class="card card-pad stack">
                <h2 class="t-title-3">Lokacija</h2>
                <div class="form-grid">
                  <div class="field">
                    <label for="city">Grad</label>
                    <select id="city" class="select" formControlName="cityId">
                      @for (c of lookups.cities(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
                    </select>
                  </div>
                  <div class="field">
                    <label for="address">Adresa</label>
                    <input id="address" class="input" formControlName="address" />
<app-field-error [control]="form.controls.address" />
                  </div>
                  <div class="field">
                    <label for="lat">Geografska širina</label>
                    <input id="lat" class="input" type="number" step="any" formControlName="latitude" />
<app-field-error [control]="form.controls.latitude" />
                  </div>
                  <div class="field">
                    <label for="lng">Geografska dužina</label>
                    <input id="lng" class="input" type="number" step="any" formControlName="longitude" />
<app-field-error [control]="form.controls.longitude" />
                  </div>
                </div>
              </section>

              <section class="card card-pad stack">
                <h2 class="t-title-3">Kontakt i društvene mreže</h2>
                <div class="form-grid">
                  <div class="field"><label for="phone">Telefon</label><input id="phone" class="input" type="tel" formControlName="phoneNumber" />
<app-field-error [control]="form.controls.phoneNumber" /></div>
                  <div class="field"><label for="email">E-mail</label><input id="email" class="input" type="email" formControlName="email" />
<app-field-error [control]="form.controls.email" /></div>
                  <div class="field"><label for="web">Web stranica</label><input id="web" class="input" formControlName="website" placeholder="https://" />
<app-field-error [control]="form.controls.website" /></div>
                  <div class="field"><label for="ig">Instagram</label><input id="ig" class="input" formControlName="instagramUrl" placeholder="https://instagram.com/..." />
<app-field-error [control]="form.controls.instagramUrl" /></div>
                  <div class="field"><label for="fb">Facebook</label><input id="fb" class="input" formControlName="facebookUrl" placeholder="https://facebook.com/..." />
<app-field-error [control]="form.controls.facebookUrl" /></div>
                  <div class="field"><label for="tt">TikTok</label><input id="tt" class="input" formControlName="tikTokUrl" placeholder="https://tiktok.com/@..." />
<app-field-error [control]="form.controls.tikTokUrl" /></div>
                </div>
              </section>

              <section class="card card-pad stack">
                <h2 class="t-title-3">Rezervacije</h2>
                <div class="list-group">
                  <label class="list-row toggle">
                    <span class="grow">
                      <strong>Online rezervacije</strong>
                      <span class="t-footnote muted">Mladenci mogu zatražiti termin kroz platformu.</span>
                    </span>
                    <input type="checkbox" class="switch" formControlName="bookingEnabled" />
                  </label>
                  @if (form.controls.bookingEnabled.value) {
                    <label class="list-row toggle">
                      <span class="grow">
                        <strong>Automatska potvrda</strong>
                        <span class="t-footnote muted">Ako je isključeno, svaki zahtjev potvrđujete ručno.</span>
                      </span>
                      <input type="checkbox" class="switch" formControlName="autoConfirmBookings" />
                    </label>
                  }
                  <label class="list-row toggle">
                    <span class="grow">
                      <strong>Tražim avans</strong>
                      <span class="t-footnote muted">Uslove avansa vide mladenci prije rezervacije.</span>
                    </span>
                    <input type="checkbox" class="switch" formControlName="requiresDeposit" />
                  </label>
                </div>
                @if (form.controls.requiresDeposit.value) {
                  <div class="field">
                    <label for="deposit">Uslovi avansa</label>
                    <input id="deposit" class="input" formControlName="depositNote" placeholder="Npr. avans 20% pri potvrdi" />
<app-field-error [control]="form.controls.depositNote" />
                  </div>
                }
              </section>

              <div class="save-bar material">
                <span class="t-footnote muted">{{ form.dirty ? 'Imate nesačuvane promjene' : 'Sve je sačuvano' }}</span>
                <button type="submit" class="btn btn-primary" [disabled]="form.invalid || form.pristine || busy()">Sačuvaj</button>
              </div>
            </form>
          }

          @case ('usluge') {
            <section class="stack enter">
              <div class="section-head">
                <p class="muted">Svaka usluga ima kategoriju i raspon cijene od–do.</p>
                <button type="button" class="btn btn-primary btn-sm" (click)="editOffering(null)"><app-icon name="plus" /> Nova usluga</button>
              </div>
              <div class="list-group">
                @for (o of offerings(); track o.id) {
                  <div class="list-row">
                    <div class="grow">
                      <p class="t-footnote muted">{{ o.serviceCategoryName }}</p>
                      <strong>{{ o.title }}</strong>
                      <span class="t-footnote">{{ price(o.priceFrom, o.priceTo) }}</span>
                    </div>
                    @if (!o.isActive) { <span class="badge">Skriveno</span> }
                    <button type="button" class="icon-btn" (click)="editOffering(o)" aria-label="Uredi"><app-icon name="edit" /></button>
                    <button type="button" class="icon-btn" (click)="removeOffering(o)" aria-label="Obriši"><app-icon name="trash" /></button>
                  </div>
                } @empty {
                  <div class="list-row muted">Još nema usluga. Dodajte prvu.</div>
                }
              </div>
            </section>
          }

          @case ('galerija') {
            <section class="stack enter">
              <div class="section-head">
                <p class="muted">Naslovna slika se prikazuje u rezultatima pretrage.</p>
                <button type="button" class="btn btn-primary btn-sm" (click)="imageOpen.set(true)"><app-icon name="plus" /> Dodaj sliku</button>
              </div>
              <div class="images">
                @for (img of images(); track img.id) {
                  <figure class="image card">
                    <img [src]="img.url" [alt]="img.caption || 'Slika'" loading="lazy" />
                    @if (img.isCover) { <span class="badge badge-accent cover">Naslovna</span> }
                    <figcaption class="row">
                      <span class="t-footnote muted grow">{{ img.caption || 'Bez opisa' }}</span>
                      @if (!img.isCover) {
                        <button type="button" class="btn btn-plain btn-sm" (click)="setCover(img)">Naslovna</button>
                      }
                      <button type="button" class="icon-btn" (click)="removeImage(img)" aria-label="Obriši sliku"><app-icon name="trash" /></button>
                    </figcaption>
                  </figure>
                } @empty {
                  <div class="empty-state"><app-icon name="image" /><p>Još nema slika.</p></div>
                }
              </div>
            </section>
          }

          @case ('radno-vrijeme') {
            <section class="stack enter">
              <div class="list-group">
                @for (row of hours(); track row.day) {
                  <div class="list-row hour">
                    <strong class="day">{{ row.label }}</strong>
                    <label class="checkbox"><input type="checkbox" [(ngModel)]="row.isClosed" /> Zatvoreno</label>
                    @if (!row.isClosed) {
                      <app-time-field class="time" min="05:00" max="23:30" [(ngModel)]="row.open" [inputId]="'h-open-' + row.day" [ariaLabel]="row.label + ' od'" />
                      <span class="muted">–</span>
                      <app-time-field class="time" min="05:00" max="23:59" [(ngModel)]="row.close" [inputId]="'h-close-' + row.day" [ariaLabel]="row.label + ' do'" />
                    }
                  </div>
                }
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-primary" (click)="saveHours()" [disabled]="busy()">Sačuvaj radno vrijeme</button>
              </div>
            </section>
          }
        }
      } @else if (loading()) {
        <div class="skeleton block"></div>
      }
    </div>

    @if (offeringOpen()) {
      <app-sheet #offeringSheet [title]="editingOffering() ? 'Uredi uslugu' : 'Nova usluga'" (closed)="offeringOpen.set(false)">
        <form class="stack" [formGroup]="offeringForm" (ngSubmit)="saveOffering()">
          <div class="field">
            <label for="o-cat">Kategorija</label>
            <select id="o-cat" class="select" formControlName="serviceCategoryId">
              @for (c of lookups.categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="o-title">Naziv usluge</label>
            <input id="o-title" class="input" formControlName="title" />
<app-field-error [control]="offeringForm.controls.title" />
          </div>
          <div class="field">
            <label for="o-desc">Opis</label>
            <textarea id="o-desc" class="textarea" formControlName="description"></textarea>
<app-field-error [control]="offeringForm.controls.description" />
          </div>
          <div class="form-grid">
            <div class="field"><label for="o-from">Cijena od (KM)</label><input id="o-from" class="input" type="number" min="0" formControlName="priceFrom" />
<app-field-error [control]="offeringForm.controls.priceFrom" /></div>
            <div class="field"><label for="o-to">Cijena do (KM)</label><input id="o-to" class="input" type="number" min="0" formControlName="priceTo" />
<app-field-error [control]="offeringForm.controls.priceTo" /></div>
          </div>
          @if (priceError()) { <p class="error t-footnote">Cijena „od“ ne može biti veća od cijene „do“.</p> }
          @if (editingOffering()) {
            <label class="list-group list-row toggle">
              <span class="grow">Prikazana na stranici</span>
              <input type="checkbox" class="switch" formControlName="isActive" />
            </label>
          }
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="offeringForm.invalid || priceError() || busy()">Sačuvaj</button>
          </div>
        </form>
      </app-sheet>
    }

    @if (imageOpen()) {
      <app-sheet #imageSheet title="Nova slika" (closed)="imageOpen.set(false)">
        <form class="stack" [formGroup]="imageForm" (ngSubmit)="addImage()">
          <div class="field">
            <label for="i-url">Adresa slike (URL)</label>
            <input id="i-url" class="input" formControlName="url" placeholder="https://" />
<app-field-error [control]="imageForm.controls.url" />
            <span class="hint">Upload fajlova dolazi uskoro; za sada zalijepite link do slike.</span>
          </div>
          @if (imageForm.controls.url.valid && imageForm.controls.url.value) {
            <img class="preview" [src]="imageForm.controls.url.value" alt="Pregled" />
          }
          <div class="field">
            <label for="i-caption">Opis</label>
            <input id="i-caption" class="input" formControlName="caption" />
<app-field-error [control]="imageForm.controls.caption" />
          </div>
          <label class="checkbox"><input type="checkbox" formControlName="isCover" /> Postavi kao naslovnu</label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="imageForm.invalid || busy()">Dodaj</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .back { margin: 0 0 var(--space-3) calc(-1 * var(--space-2)); }
    .tabs { margin-bottom: var(--space-5); }
    .section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .grow { flex: 1; display: grid; gap: 0.125rem; min-width: 0; }
    .toggle { cursor: pointer; }
    .save-bar {
      position: sticky; bottom: calc(5rem + var(--safe-bottom)); z-index: 5;
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
      border-radius: var(--radius-full); box-shadow: var(--shadow-md), inset 0 1px 0 var(--material-edge);
    }
    @media (min-width: 48rem) { .save-bar { bottom: var(--space-4); } }
    .images { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); }
    .image { position: relative; margin: 0; overflow: hidden; }
    .image img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
    .image figcaption { padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); }
    .cover { position: absolute; top: var(--space-2); left: var(--space-2); }
    .preview { width: 100%; max-height: 14rem; object-fit: cover; border-radius: var(--radius-md); }
    .hour { flex-wrap: wrap; }
    .day { width: 7.5rem; }
    .time { width: 8.75rem; }
    .error { color: var(--danger); }
    .block { height: 20rem; border-radius: var(--radius-lg); }
  `,
})
export class VendorManage implements OnInit {
  readonly id = input.required<string>();

  protected readonly lookups = inject(LookupStore);
  private readonly auth = inject(AuthService);
  private readonly vendorApi = inject(VendorApi);
  private readonly offeringApi = inject(OfferingApi);
  private readonly imageApi = inject(VendorImageApi);
  private readonly hourApi = inject(WorkingHourApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly tabs: { key: Tab; label: string }[] = [
    { key: 'stranica', label: 'Stranica' },
    { key: 'usluge', label: 'Usluge' },
    { key: 'galerija', label: 'Galerija' },
    { key: 'radno-vrijeme', label: 'Radno vrijeme' },
  ];

  /** `?kartica=galerija` otvara tačnu karticu (npr. iz kontrolne liste na pregledu salona). */
  readonly kartica = input<string>();

  protected readonly tab = signal<Tab>('stranica');
  protected readonly vendor = signal<Vendor | null>(null);
  protected readonly offerings = signal<Offering[]>([]);
  protected readonly images = signal<VendorImage[]>([]);
  protected readonly hours = signal<HourRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly offeringOpen = signal(false);
  protected readonly editingOffering = signal<Offering | null>(null);
  protected readonly imageOpen = signal(false);

  private readonly offeringSheet = viewChild<Sheet>('offeringSheet');
  private readonly imageSheet = viewChild<Sheet>('imageSheet');

  protected readonly price = formatPriceRange;
  protected readonly isAdmin = computed(() => this.auth.hasRole('Admin'));
  protected readonly backLink = computed(() => (this.isAdmin() ? '/admin/ponudjaci' : '/salon'));
  protected readonly backLabel = computed(() => (this.isAdmin() ? 'Ponuđači' : 'Moji saloni'));

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, ...V.businessName]),
    description: this.fb.control<string | null>(null, V.text(2000)),
    cityId: this.fb.nonNullable.control(0, Validators.required),
    address: this.fb.control<string | null>(null, V.text(200)),
    latitude: this.fb.control<number | null>(null, V.latitude),
    longitude: this.fb.control<number | null>(null, V.longitude),
    phoneNumber: this.fb.control<string | null>(null, V.phone),
    email: this.fb.control<string | null>(null, V.email),
    website: this.fb.control<string | null>(null, V.url),
    instagramUrl: this.fb.control<string | null>(null, V.social('instagram.com')),
    facebookUrl: this.fb.control<string | null>(null, V.social('facebook.com')),
    tikTokUrl: this.fb.control<string | null>(null, V.social('tiktok.com')),
    logoUrl: this.fb.control<string | null>(null, V.url),
    bookingEnabled: this.fb.nonNullable.control(false),
    autoConfirmBookings: this.fb.nonNullable.control(false),
    requiresDeposit: this.fb.nonNullable.control(false),
    depositNote: this.fb.control<string | null>(null, V.text(300)),
  });

  protected readonly offeringForm = this.fb.group(
    {
      serviceCategoryId: this.fb.nonNullable.control(0, Validators.min(1)),
      title: this.fb.nonNullable.control('', [Validators.required, ...V.businessName]),
      description: this.fb.control<string | null>(null, V.text(1000)),
      priceFrom: this.fb.nonNullable.control(0, V.price),
      priceTo: this.fb.nonNullable.control(0, V.price),
      isActive: this.fb.nonNullable.control(true),
    },
    { validators: V.range('priceFrom', 'priceTo') },
  );

  protected readonly imageForm = this.fb.group({
    url: this.fb.nonNullable.control('', [Validators.required, ...V.url]),
    caption: this.fb.control<string | null>(null, V.text(150)),
    isCover: this.fb.nonNullable.control(false),
  });

  protected priceError(): boolean {
    const { priceFrom, priceTo } = this.offeringForm.getRawValue();
    return priceFrom > priceTo;
  }

  ngOnInit(): void {
    const requested = this.kartica();
    if (requested && this.tabs.some((t) => t.key === requested)) this.tab.set(requested as Tab);
    this.lookups.ensureLoaded();
    this.loadAll();
  }

  protected saveProfile(): void {
    const v = this.vendor();
    if (!v) return;
    this.busy.set(true);
    const raw = this.form.getRawValue();
    const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);
    this.vendorApi
      .update(v.id, {
        ...raw,
        description: blank(raw.description),
        address: blank(raw.address),
        phoneNumber: blank(raw.phoneNumber),
        email: blank(raw.email),
        website: blank(raw.website),
        instagramUrl: blank(raw.instagramUrl),
        facebookUrl: blank(raw.facebookUrl),
        tikTokUrl: blank(raw.tikTokUrl),
        logoUrl: blank(raw.logoUrl),
        depositNote: blank(raw.depositNote),
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.applyVendor(updated);
          this.toasts.success('Stranica je sačuvana.');
        },
        error: () => this.busy.set(false),
      });
  }

  protected editOffering(offering: Offering | null): void {
    this.editingOffering.set(offering);
    this.offeringForm.reset({
      serviceCategoryId: offering?.serviceCategoryId ?? this.lookups.categories()[0]?.id ?? 0,
      title: offering?.title ?? '',
      description: offering?.description ?? null,
      priceFrom: offering?.priceFrom ?? 0,
      priceTo: offering?.priceTo ?? 0,
      isActive: offering?.isActive ?? true,
    });
    this.offeringOpen.set(true);
  }

  protected saveOffering(): void {
    const v = this.vendor();
    if (!v) return;
    const value = this.offeringForm.getRawValue();
    const editing = this.editingOffering();
    this.busy.set(true);
    const request$ = editing
      ? this.offeringApi.update(editing.id, { ...value, description: value.description || null })
      : this.offeringApi.create({
          vendorId: v.id,
          serviceCategoryId: value.serviceCategoryId,
          title: value.title,
          description: value.description || null,
          priceFrom: value.priceFrom,
          priceTo: value.priceTo,
        });
    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success(editing ? 'Usluga je sačuvana.' : 'Usluga je dodana.');
        this.offeringSheet()?.close();
        this.loadOfferings(v.id);
      },
      error: () => this.busy.set(false),
    });
  }

  protected async removeOffering(offering: Offering): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Obrisati uslugu?', message: `„${offering.title}“ biće trajno obrisana.` });
    if (!ok) return;
    this.offeringApi.remove(offering.id).subscribe(() => {
      this.toasts.success('Usluga je obrisana.');
      this.loadOfferings(offering.vendorId);
    });
  }

  protected addImage(): void {
    const v = this.vendor();
    if (!v) return;
    const value = this.imageForm.getRawValue();
    this.busy.set(true);
    this.imageApi
      .create({
        vendorId: v.id,
        url: value.url,
        caption: value.caption || null,
        isCover: value.isCover || this.images().length === 0,
        sortOrder: this.images().length + 1,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.imageForm.reset({ url: '', caption: null, isCover: false });
          this.imageSheet()?.close();
          this.loadImages(v.id);
        },
        error: () => this.busy.set(false),
      });
  }

  protected setCover(image: VendorImage): void {
    this.imageApi
      .update(image.id, { url: image.url, caption: image.caption, sortOrder: image.sortOrder, isCover: true })
      .subscribe(() => this.loadImages(image.vendorId));
  }

  protected async removeImage(image: VendorImage): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Obrisati sliku?', message: 'Slika će biti uklonjena iz galerije.' });
    if (!ok) return;
    this.imageApi.remove(image.id).subscribe(() => this.loadImages(image.vendorId));
  }

  protected saveHours(): void {
    const v = this.vendor();
    if (!v) return;
    const invalid = this.hours().find((h) => !h.isClosed && (!h.open || !h.close || h.open >= h.close));
    if (invalid) {
      this.toasts.error(`${invalid.label}: vrijeme otvaranja mora biti prije zatvaranja.`);
      return;
    }
    this.busy.set(true);
    const requests = this.hours().map((h) => {
      const body = {
        isClosed: h.isClosed,
        openTime: h.isClosed ? null : toTimeOnly(h.open),
        closeTime: h.isClosed ? null : toTimeOnly(h.close),
      };
      return h.id ? this.hourApi.update(h.id, body) : this.hourApi.create({ ...body, vendorId: v.id, dayOfWeek: h.day });
    });
    forkJoin(requests).subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success('Radno vrijeme je sačuvano.');
        this.loadHours(v.id);
      },
      error: () => this.busy.set(false),
    });
  }

  private loadAll(): void {
    const id = Number(this.id());
    this.vendorApi.get(id).subscribe({
      next: (v) => {
        this.applyVendor(v);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.backLink());
      },
    });
    this.loadOfferings(id);
    this.loadImages(id);
    this.loadHours(id);
  }

  private applyVendor(v: Vendor): void {
    this.vendor.set(v);
    this.form.reset({
      name: v.name,
      description: v.description,
      cityId: v.cityId,
      address: v.address,
      latitude: v.latitude,
      longitude: v.longitude,
      phoneNumber: v.phoneNumber,
      email: v.email,
      website: v.website,
      instagramUrl: v.instagramUrl,
      facebookUrl: v.facebookUrl,
      tikTokUrl: v.tikTokUrl,
      logoUrl: v.logoUrl,
      bookingEnabled: v.bookingEnabled,
      autoConfirmBookings: v.autoConfirmBookings,
      requiresDeposit: v.requiresDeposit,
      depositNote: v.depositNote,
    });
  }

  private loadOfferings(vendorId: number): void {
    this.offeringApi.list({ vendorId, pageSize: 100 }).subscribe((r) => this.offerings.set(r.items));
  }

  private loadImages(vendorId: number): void {
    this.imageApi.list({ vendorId, pageSize: 100 }).subscribe((r) => this.images.set(r.items));
  }

  private loadHours(vendorId: number): void {
    this.hourApi.list({ vendorId, pageSize: 20 }).subscribe((r) => {
      this.hours.set(
        DAYS.map((d) => {
          const h = r.items.find((x) => x.dayOfWeek === d.key);
          return {
            day: d.key,
            label: d.label,
            id: h?.id ?? null,
            isClosed: h?.isClosed ?? false,
            open: formatTime(h?.openTime) || '09:00',
            close: formatTime(h?.closeTime) || '17:00',
          };
        }),
      );
    });
  }
}
