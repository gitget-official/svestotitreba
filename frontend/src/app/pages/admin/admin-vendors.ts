import { ChangeDetectionStrategy, Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { SubscriptionPlanApi, UserApi, VendorApi } from '../../core/api';
import { formatDate } from '../../core/format';
import { LookupStore } from '../../core/lookups';
import { SubscriptionPlan, User, Vendor } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { DateField } from '../../shared/ui/date-time-fields';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

/** Administrator: dodavanje ponuđača i dodjela naloga (FR-29), aktivnost i pretplata (FR-33). */
@Component({
  selector: 'app-admin-vendors',
  imports: [RouterLink, FormsModule, ReactiveFormsModule, Icon, Sheet, DateField, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Ponuđači</h1>
          <p class="muted">{{ total() }} ukupno, uključujući neaktivne.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="createOpen.set(true)"><app-icon name="plus" /> Novi ponuđač</button>
      </header>

      <div class="toolbar">
        <input class="input" type="search" placeholder="Pretraga po nazivu" [ngModel]="fts"
          (ngModelChange)="search$.next($event)" aria-label="Pretraga" />
        <select class="select" [ngModel]="cityId" (ngModelChange)="cityId = $event; load()" aria-label="Grad">
          <option [ngValue]="null">Svi gradovi</option>
          @for (c of lookups.cities(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
        </select>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Naziv</th>
              <th>Grad</th>
              <th>Kategorije</th>
              <th>Vlasnik</th>
              <th>Status</th>
              <th class="actions"><span class="sr-only">Akcije</span></th>
            </tr>
          </thead>
          <tbody>
            @for (v of vendors(); track v.id) {
              <tr>
                <td><a class="name" [routerLink]="['/admin/ponudjaci', v.id]">{{ v.name }}</a></td>
                <td>{{ v.cityName }}</td>
                <td class="t-footnote muted">{{ v.categories.join(', ') || '—' }}</td>
                <td>{{ v.ownerFullName || '—' }}</td>
                <td>
                  <div class="row-wrap status">
                    <span class="badge" [class.badge-success]="v.isActive">{{ v.isActive ? 'Aktivan' : 'Neaktivan' }}</span>
                    @if (v.isFeatured) { <span class="badge badge-gold">{{ v.subscriptionPlanName }}</span> }
                  </div>
                </td>
                <td class="actions">
                  <button type="button" class="btn btn-plain btn-sm" (click)="openSettings(v)">Postavke</button>
                  <a class="icon-btn" [routerLink]="['/admin/ponudjaci', v.id]" aria-label="Uredi stranicu"><app-icon name="edit" /></a>
                  <button type="button" class="icon-btn" (click)="remove(v)" aria-label="Obriši"><app-icon name="trash" /></button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="muted">Nema ponuđača.</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (vendors().length < total()) {
        <div class="more"><button type="button" class="btn" (click)="loadMore()">Prikaži još</button></div>
      }
    </div>

    @if (createOpen()) {
      <app-sheet #createSheet title="Novi ponuđač" (closed)="createOpen.set(false)">
        <form class="stack" [formGroup]="createForm" (ngSubmit)="create()">
          <div class="field"><label for="c-name">Naziv</label><input id="c-name" class="input" formControlName="name" />
<app-field-error [control]="createForm.controls.name" /></div>
          <div class="field">
            <label for="c-city">Grad</label>
            <select id="c-city" class="select" formControlName="cityId">
              @for (c of lookups.cities(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
            </select>
          </div>
          <div class="field"><label for="c-desc">Opis</label><textarea id="c-desc" class="textarea" formControlName="description"></textarea>
<app-field-error [control]="createForm.controls.description" /></div>
          <div class="form-grid">
            <div class="field"><label for="c-phone">Telefon</label><input id="c-phone" class="input" formControlName="phoneNumber" />
<app-field-error [control]="createForm.controls.phoneNumber" /></div>
            <div class="field"><label for="c-email">E-mail</label><input id="c-email" class="input" type="email" formControlName="email" />
<app-field-error [control]="createForm.controls.email" /></div>
          </div>
          <div class="field">
            <label for="c-owner">Vlasnik naloga</label>
            <select id="c-owner" class="select" formControlName="ownerUserId">
              <option [ngValue]="null">Dodijeliti kasnije</option>
              @for (u of vendorUsers(); track u.id) { <option [ngValue]="u.id">{{ u.firstName }} {{ u.lastName }} ({{ u.username }})</option> }
            </select>
            <span class="hint">Nalog sa ulogom „Salon“ pravite u Korisnicima.</span>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="createForm.invalid || busy()">Dodaj ponuđača</button>
          </div>
        </form>
      </app-sheet>
    }

    @if (settingsFor(); as v) {
      <app-sheet #settingsSheet [title]="v.name" (closed)="settingsFor.set(null)">
        <form class="stack" [formGroup]="settingsForm" (ngSubmit)="saveSettings(v)">
          <label class="list-group list-row toggle">
            <span class="grow"><strong>Aktivan</strong><span class="t-footnote muted">Neaktivni ponuđači nisu vidljivi mladencima.</span></span>
            <input type="checkbox" class="switch" formControlName="isActive" />
          </label>
          <div class="field">
            <label for="s-owner">Vlasnik naloga</label>
            <select id="s-owner" class="select" formControlName="ownerUserId">
              <option [ngValue]="null">Bez vlasnika</option>
              @for (u of vendorUsers(); track u.id) { <option [ngValue]="u.id">{{ u.firstName }} {{ u.lastName }} ({{ u.username }})</option> }
            </select>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="s-plan">Pretplata</label>
              <select id="s-plan" class="select" formControlName="subscriptionPlanId">
                <option [ngValue]="null">Bez pretplate</option>
                @for (p of plans(); track p.id) { <option [ngValue]="p.id">{{ p.name }} · {{ p.price }} KM</option> }
              </select>
            </div>
            <div class="field">
              <label for="s-exp">Ističe</label>
              <app-date-field inputId="s-exp" formControlName="subscriptionExpiresAt" />
            </div>
          </div>
          @if (v.subscriptionExpiresAt) { <p class="t-footnote muted">Trenutna pretplata ističe {{ date(v.subscriptionExpiresAt) }}.</p> }
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">Sačuvaj</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    // Status i paket u jednom redu, da svi redovi tabele budu iste visine.
    .status {
      flex-wrap: nowrap;
      white-space: nowrap;
    }

    .toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    .toolbar .input { flex: 1 1 16rem; }
    .toolbar .select { flex: 0 1 14rem; }
    .name { color: var(--text); font-weight: 600; }
    .actions .icon-btn { width: 2.125rem; height: 2.125rem; }
    .more { display: flex; justify-content: center; margin-top: var(--space-5); }
    .toggle { cursor: pointer; }
    .grow { flex: 1; display: grid; }
  `,
})
export class AdminVendors implements OnInit {
  protected readonly lookups = inject(LookupStore);
  private readonly api = inject(VendorApi);
  private readonly userApi = inject(UserApi);
  private readonly planApi = inject(SubscriptionPlanApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly vendors = signal<Vendor[]>([]);
  protected readonly total = signal(0);
  protected readonly vendorUsers = signal<User[]>([]);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly busy = signal(false);
  protected readonly createOpen = signal(false);
  protected readonly settingsFor = signal<Vendor | null>(null);

  private readonly createSheet = viewChild<Sheet>('createSheet');
  private readonly settingsSheet = viewChild<Sheet>('settingsSheet');

  protected readonly search$ = new Subject<string>();
  protected fts = '';
  protected cityId: number | null = null;
  private page = 1;
  protected readonly date = (v: string) => formatDate(v);

  protected readonly createForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, ...V.businessName]),
    cityId: this.fb.nonNullable.control(0, Validators.min(1)),
    description: this.fb.control<string | null>(null, V.text(2000)),
    phoneNumber: this.fb.control<string | null>(null, V.phone),
    email: this.fb.control<string | null>(null, V.email),
    ownerUserId: this.fb.control<number | null>(null),
  });

  protected readonly settingsForm = this.fb.group({
    isActive: this.fb.nonNullable.control(true),
    ownerUserId: this.fb.control<number | null>(null),
    subscriptionPlanId: this.fb.control<number | null>(null),
    subscriptionExpiresAt: this.fb.control<string | null>(null),
  });

  ngOnInit(): void {
    this.lookups.ensureLoaded();
    this.search$.pipe(debounceTime(250)).subscribe((value) => {
      this.fts = value;
      this.load();
    });
    this.userApi.list({ role: 'Vendor', pageSize: 100 }).subscribe((r) => this.vendorUsers.set(r.items));
    this.planApi.list({ pageSize: 50 }).subscribe((r) => this.plans.set(r.items));
    this.load();
  }

  protected load(): void {
    this.page = 1;
    this.fetch(false);
  }

  protected loadMore(): void {
    this.page++;
    this.fetch(true);
  }

  protected create(): void {
    const value = this.createForm.getRawValue();
    this.busy.set(true);
    this.api
      .create({
        name: value.name,
        cityId: value.cityId,
        description: value.description || null,
        phoneNumber: value.phoneNumber || null,
        email: value.email || null,
        ownerUserId: value.ownerUserId,
        address: null,
        latitude: null,
        longitude: null,
        website: null,
        instagramUrl: null,
        facebookUrl: null,
        tikTokUrl: null,
        logoUrl: null,
        bookingEnabled: false,
        autoConfirmBookings: false,
        requiresDeposit: false,
        depositNote: null,
      })
      .subscribe({
        next: (vendor) => {
          this.busy.set(false);
          this.toasts.success('Ponuđač je dodan. Dodajte usluge i slike.');
          this.createSheet()?.close();
          void this.router.navigate(['/admin/ponudjaci', vendor.id]);
        },
        error: () => this.busy.set(false),
      });
  }

  protected openSettings(vendor: Vendor): void {
    this.settingsForm.reset({
      isActive: vendor.isActive,
      ownerUserId: vendor.ownerUserId,
      subscriptionPlanId: vendor.subscriptionPlanId,
      subscriptionExpiresAt: vendor.subscriptionExpiresAt?.slice(0, 10) ?? null,
    });
    this.settingsFor.set(vendor);
  }

  protected saveSettings(vendor: Vendor): void {
    const value = this.settingsForm.getRawValue();
    if (value.subscriptionPlanId && !value.subscriptionExpiresAt) {
      this.toasts.error('Za pretplatu unesite datum isteka.');
      return;
    }
    this.busy.set(true);
    this.api
      .adminUpdate(vendor.id, {
        ...value,
        subscriptionExpiresAt: value.subscriptionExpiresAt ? `${value.subscriptionExpiresAt}T23:59:59Z` : null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toasts.success('Postavke su sačuvane.');
          this.settingsSheet()?.close();
          this.load();
        },
        error: () => this.busy.set(false),
      });
  }

  protected async remove(vendor: Vendor): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Obrisati „${vendor.name}“?`,
      message: 'Brišu se i usluge, slike, radno vrijeme i recenzije. Ako ponuđač ima rezervacije, umjesto brisanja ga deaktivirajte.',
    });
    if (!ok) return;
    this.api.remove(vendor.id).subscribe(() => {
      this.toasts.success('Ponuđač je obrisan.');
      this.load();
    });
  }

  private fetch(append: boolean): void {
    this.api
      .list({ page: this.page, pageSize: 25, fts: this.fts || null, cityId: this.cityId, includeInactive: true })
      .subscribe((r) => {
        this.vendors.update((list) => (append ? [...list, ...r.items] : r.items));
        this.total.set(r.totalCount);
      });
  }
}
