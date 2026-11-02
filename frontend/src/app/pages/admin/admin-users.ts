import { ChangeDetectionStrategy, Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { Subject, debounceTime } from 'rxjs';
import { UserApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { ROLE_LABEL, formatDate } from '../../core/format';
import { LookupStore } from '../../core/lookups';
import { User, UserRole } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';
import { Select, SelectOption } from '../../shared/ui/select';

/** Korisnici: administrator kreira naloge za salone (FR-29) i upravlja postojećim nalozima. */
@Component({
  selector: 'app-admin-users',
  imports: [FormsModule, ReactiveFormsModule, Icon, Sheet, FieldError, Select, SelectOption],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Korisnici</h1>
          <p class="muted">Nalog za salon kreirate ovdje, a zatim ga dodijelite ponuđaču.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openEdit(null)"><app-icon name="plus" /> Novi korisnik</button>
      </header>

      <div class="toolbar">
        <input class="input" type="search" placeholder="Ime, e-mail ili korisničko ime" [ngModel]="fts"
          (ngModelChange)="search$.next($event)" aria-label="Pretraga" />
        <div class="segmented">
          @for (r of roleFilters; track r.label) {
            <button type="button" [class.is-active]="role() === r.value" (click)="role.set(r.value); load()">{{ r.label }}</button>
          }
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Ime</th><th>Korisničko ime</th><th>E-mail</th><th>Uloga</th><th>Status</th><th>Kreiran</th><th class="actions"><span class="sr-only">Akcije</span></th></tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr>
                <td><strong>{{ u.firstName }} {{ u.lastName }}</strong></td>
                <td>{{ u.username }}</td>
                <td>{{ u.email }}</td>
                <td><span class="badge" [class.badge-accent]="u.role === 'Vendor'">{{ roleLabel[u.role] }}</span></td>
                <td>
                  <span class="badge" [class.badge-success]="u.isActive">{{ u.isActive ? 'Aktivan' : 'Neaktivan' }}</span>
                  @if (u.mustChangePassword) { <span class="badge badge-warning">Nova lozinka</span> }
                </td>
                <td class="t-footnote muted">{{ date(u.createdAt) }}</td>
                <td class="actions">
                  <button type="button" class="icon-btn" (click)="openEdit(u)" aria-label="Uredi"><app-icon name="edit" /></button>
                  @if (u.id !== me()) {
                    <button type="button" class="icon-btn" (click)="remove(u)" aria-label="Obriši"><app-icon name="trash" /></button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="muted">Nema korisnika.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (editOpen()) {
      <app-sheet [title]="editing() ? 'Uredi korisnika' : 'Novi korisnik'" (closed)="editOpen.set(false)">
        <form class="stack" [formGroup]="form" (ngSubmit)="save()">
          <div class="form-grid">
            <div class="field"><label for="u-first">Ime</label><input id="u-first" class="input" formControlName="firstName" />
<app-field-error [control]="form.controls.firstName" /></div>
            <div class="field"><label for="u-last">Prezime</label><input id="u-last" class="input" formControlName="lastName" />
<app-field-error [control]="form.controls.lastName" /></div>
            <div class="field"><label for="u-email">E-mail</label><input id="u-email" class="input" type="email" formControlName="email" />
<app-field-error [control]="form.controls.email" /></div>
            @if (!editing()) {
              <div class="field"><label for="u-user">Korisničko ime</label><input id="u-user" class="input" formControlName="username" />
<app-field-error [control]="form.controls.username" /></div>
            }
            <div class="field"><label for="u-phone">Telefon</label><input id="u-phone" class="input" formControlName="phoneNumber" />
<app-field-error [control]="form.controls.phoneNumber" /></div>
            <div class="field">
              <label for="u-city">Grad</label>
              <app-select inputId="u-city" formControlName="cityId">
                <app-option [value]="null">—</app-option>
                @for (c of lookups.cities(); track c.id) { <app-option [value]="c.id">{{ c.name }}</app-option> }
              </app-select>
            </div>
            <div class="field">
              <label for="u-role">Uloga</label>
              <app-select inputId="u-role" formControlName="role">
                <app-option value="Vendor">Salon</app-option>
                <app-option value="Couple">Mladenci</app-option>
                <app-option value="Admin">Administrator</app-option>
              </app-select>
            </div>
            <div class="field">
              <label for="u-pass">{{ editing() ? 'Nova lozinka (opciono)' : 'Početna lozinka' }}</label>
              <input id="u-pass" class="input" type="text" formControlName="password" autocomplete="off" />
<app-field-error [control]="form.controls.password" />
              <span class="hint">Najmanje 8 znakova. Korisnik je mijenja pri prvoj prijavi.</span>
            </div>
          </div>
          @if (editing()) {
            <label class="list-group list-row toggle">
              <span class="grow">Nalog aktivan</span>
              <input type="checkbox" class="switch" formControlName="isActive" />
            </label>
          }
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="form.invalid || busy()">Sačuvaj</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); align-items: center; }
    .toolbar .input { flex: 1 1 16rem; }
    .actions .icon-btn { width: 2.125rem; height: 2.125rem; }
    .toggle { cursor: pointer; }
    .grow { flex: 1; }
  `,
})
export class AdminUsers implements OnInit {
  protected readonly lookups = inject(LookupStore);
  private readonly api = inject(UserApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly sheet = viewChild(Sheet);

  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roleFilters: { label: string; value: UserRole | null }[] = [
    { label: 'Svi', value: null },
    { label: 'Saloni', value: 'Vendor' },
    { label: 'Mladenci', value: 'Couple' },
    { label: 'Admini', value: 'Admin' },
  ];
  protected readonly users = signal<User[]>([]);
  protected readonly role = signal<UserRole | null>(null);
  protected readonly editing = signal<User | null>(null);
  protected readonly editOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly me = () => this.auth.user()?.id;
  protected readonly date = (v: string) => formatDate(v);
  protected readonly search$ = new Subject<string>();
  protected fts = '';

  protected readonly form = this.fb.group({
    firstName: this.fb.nonNullable.control('', [Validators.required, ...V.personName]),
    lastName: this.fb.nonNullable.control('', [Validators.required, ...V.personName]),
    email: this.fb.nonNullable.control('', [Validators.required, ...V.email]),
    username: this.fb.nonNullable.control(''),
    phoneNumber: this.fb.control<string | null>(null, V.phone),
    cityId: this.fb.control<number | null>(null),
    role: this.fb.nonNullable.control<UserRole>('Vendor'),
    password: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });

  ngOnInit(): void {
    this.lookups.ensureLoaded();
    this.search$.pipe(debounceTime(250)).subscribe((v) => {
      this.fts = v;
      this.load();
    });
    this.load();
  }

  protected load(): void {
    this.api.list({ role: this.role(), fts: this.fts || null, pageSize: 100 }).subscribe((r) => this.users.set(r.items));
  }

  protected openEdit(user: User | null): void {
    this.editing.set(user);
    this.form.reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      username: user?.username ?? '',
      phoneNumber: user?.phoneNumber ?? null,
      cityId: user?.cityId ?? null,
      role: user?.role ?? 'Vendor',
      password: '',
      isActive: user?.isActive ?? true,
    });
    const username = this.form.controls.username;
    const password = this.form.controls.password;
    username.setValidators(user ? [] : [Validators.required, ...V.username]);
    password.setValidators(user ? V.password : [Validators.required, ...V.password]);
    username.updateValueAndValidity();
    password.updateValueAndValidity();
    this.editOpen.set(true);
  }

  protected save(): void {
    const v = this.form.getRawValue();
    const user = this.editing();
    this.busy.set(true);
    const request$ = user
      ? this.api.update(user.id, {
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          phoneNumber: v.phoneNumber || null,
          cityId: v.cityId,
          role: v.role,
          isActive: v.isActive,
          newPassword: v.password || null,
        })
      : this.api.create({
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          username: v.username,
          phoneNumber: v.phoneNumber || null,
          cityId: v.cityId,
          role: v.role,
          password: v.password,
        });
    request$.subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success(user ? 'Korisnik je sačuvan.' : 'Nalog je kreiran. Pošaljite korisniku pristupne podatke.');
        this.sheet()?.close();
        this.load();
      },
      error: () => this.busy.set(false),
    });
  }

  protected async remove(user: User): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Obrisati ${user.firstName} ${user.lastName}?`,
      message: 'Nalog će biti trajno obrisan. Ako korisnik ima recenzije, rezervacije ili salon, umjesto toga ga deaktivirajte.',
    });
    if (!ok) return;
    this.api.remove(user.id).subscribe(() => {
      this.toasts.success('Korisnik je obrisan.');
      this.load();
    });
  }
}
