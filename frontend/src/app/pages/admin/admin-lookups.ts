import { ChangeDetectionStrategy, Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldError } from '../../shared/ui/field-error';
import { AppValidators as V } from '../../core/validators';
import { Observable } from 'rxjs';
import { CategoryApi, CityApi, SubscriptionPlanApi } from '../../core/api';
import { LookupStore } from '../../core/lookups';
import { City, ServiceCategory, SubscriptionPlan } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon, categoryIcon } from '../../shared/ui/icon';
import { Sheet } from '../../shared/ui/sheet';
import { ToastService } from '../../shared/ui/toast';

type Section = 'kategorije' | 'gradovi' | 'planovi';

/** Šifarnici: kategorije usluga (lista nije fiksna, FR-30), gradovi i planovi pretplate. */
@Component({
  selector: 'app-admin-lookups',
  imports: [ReactiveFormsModule, Icon, Sheet, FieldError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page narrow">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Šifarnici</h1>
          <p class="muted">Kategorije usluga, gradovi i planovi pretplate.</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="open(null)"><app-icon name="plus" /> Dodaj</button>
      </header>

      <div class="segmented tabs" role="tablist">
        <button type="button" role="tab" [class.is-active]="section() === 'kategorije'" (click)="section.set('kategorije')">Kategorije</button>
        <button type="button" role="tab" [class.is-active]="section() === 'gradovi'" (click)="section.set('gradovi')">Gradovi</button>
        <button type="button" role="tab" [class.is-active]="section() === 'planovi'" (click)="section.set('planovi')">Planovi pretplate</button>
      </div>

      <div class="list-group enter">
        @switch (section()) {
          @case ('kategorije') {
            @for (c of categories(); track c.id) {
              <div class="list-row">
                <span class="icon-tile"><app-icon [name]="icon(c.slug)" /></span>
                <div class="grow">
                  <strong>{{ c.name }}</strong>
                  @if (c.description) { <span class="t-footnote muted">{{ c.description }}</span> }
                </div>
                @if (!c.isActive) { <span class="badge">Skrivena</span> }
                <button type="button" class="icon-btn" (click)="open(c)" aria-label="Uredi"><app-icon name="edit" /></button>
                <button type="button" class="icon-btn" (click)="remove(c)" aria-label="Obriši"><app-icon name="trash" /></button>
              </div>
            }
          }
          @case ('gradovi') {
            @for (c of cities(); track c.id) {
              <div class="list-row">
                <div class="grow"><strong>{{ c.name }}</strong></div>
                <button type="button" class="icon-btn" (click)="open(c)" aria-label="Uredi"><app-icon name="edit" /></button>
                <button type="button" class="icon-btn" (click)="remove(c)" aria-label="Obriši"><app-icon name="trash" /></button>
              </div>
            }
          }
          @case ('planovi') {
            @for (p of plans(); track p.id) {
              <div class="list-row">
                <div class="grow">
                  <strong>{{ p.name }} · {{ p.price }} KM / {{ p.durationDays }} dana</strong>
                  <span class="t-footnote muted">Prioritet u pretrazi: {{ p.priorityWeight }}@if (p.description) { · {{ p.description }} }</span>
                </div>
                @if (!p.isActive) { <span class="badge">Neaktivan</span> }
                <button type="button" class="icon-btn" (click)="open(p)" aria-label="Uredi"><app-icon name="edit" /></button>
                <button type="button" class="icon-btn" (click)="remove(p)" aria-label="Obriši"><app-icon name="trash" /></button>
              </div>
            }
          }
        }
      </div>
    </div>

    @if (editOpen()) {
      <app-sheet [title]="title()" (closed)="editOpen.set(false)">
        <form class="stack" [formGroup]="form" (ngSubmit)="save()">
          <div class="field"><label for="l-name">Naziv</label><input id="l-name" class="input" formControlName="name" />
<app-field-error [control]="form.controls.name" /></div>
          @if (section() !== 'gradovi') {
            <div class="field"><label for="l-desc">Opis</label><textarea id="l-desc" class="textarea" formControlName="description"></textarea>
<app-field-error [control]="form.controls.description" /></div>
          }
          @if (section() === 'kategorije') {
            <div class="field"><label for="l-sort">Redoslijed</label><input id="l-sort" class="input" type="number" formControlName="sortOrder" />
<app-field-error [control]="form.controls.sortOrder" /></div>
          }
          @if (section() === 'planovi') {
            <div class="form-grid">
              <div class="field"><label for="l-price">Cijena (KM)</label><input id="l-price" class="input" type="number" min="0" formControlName="price" />
<app-field-error [control]="form.controls.price" /></div>
              <div class="field"><label for="l-days">Trajanje (dana)</label><input id="l-days" class="input" type="number" min="1" formControlName="durationDays" />
<app-field-error [control]="form.controls.durationDays" /></div>
              <div class="field"><label for="l-weight">Prioritet</label><input id="l-weight" class="input" type="number" min="0" max="100" formControlName="priorityWeight" />
<app-field-error [control]="form.controls.priorityWeight" /></div>
            </div>
          }
          @if (section() !== 'gradovi' && editing()) {
            <label class="list-group list-row toggle">
              <span class="grow">Aktivno</span>
              <input type="checkbox" class="switch" formControlName="isActive" />
            </label>
          }
          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-block" [disabled]="form.invalid">Sačuvaj</button>
          </div>
        </form>
      </app-sheet>
    }
  `,
  styles: `
    .narrow { max-width: 48rem; }
    .tabs { margin-bottom: var(--space-5); }
    .grow { flex: 1; display: grid; min-width: 0; }
    .icon-tile {
      display: grid; place-items: center; flex: none; width: 2.25rem; height: 2.25rem;
      border-radius: var(--radius-sm); background: var(--accent-soft); color: var(--accent);
    }
    .toggle { cursor: pointer; }
  `,
})
export class AdminLookups implements OnInit {
  private readonly categoryApi = inject(CategoryApi);
  private readonly cityApi = inject(CityApi);
  private readonly planApi = inject(SubscriptionPlanApi);
  private readonly lookups = inject(LookupStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly sheet = viewChild(Sheet);

  protected readonly section = signal<Section>('kategorije');
  protected readonly categories = signal<ServiceCategory[]>([]);
  protected readonly cities = signal<City[]>([]);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly editing = signal<{ id: number } | null>(null);
  protected readonly editOpen = signal(false);
  protected readonly icon = categoryIcon;

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, ...V.businessName]),
    description: this.fb.control<string | null>(null, V.text(500)),
    sortOrder: this.fb.nonNullable.control(0, V.integer(0, 1000)),
    price: this.fb.nonNullable.control(0, [Validators.min(0), Validators.max(100_000)]),
    durationDays: this.fb.nonNullable.control(30, V.integer(1, 3650)),
    priorityWeight: this.fb.nonNullable.control(1, V.integer(0, 100)),
    isActive: this.fb.nonNullable.control(true),
  });

  protected title(): string {
    const titles = {
      kategorije: ['Nova kategorija', 'Uredi kategoriju'],
      gradovi: ['Novi grad', 'Uredi grad'],
      planovi: ['Novi plan', 'Uredi plan'],
    }[this.section()];
    return this.editing() ? titles[1] : titles[0];
  }

  ngOnInit(): void {
    this.loadAll();
  }

  protected open(item: ServiceCategory | City | SubscriptionPlan | null): void {
    const any = item as Partial<ServiceCategory & SubscriptionPlan> | null;
    this.editing.set(item ? { id: item.id } : null);
    this.form.reset({
      name: any?.name ?? '',
      description: any?.description ?? null,
      sortOrder: any?.sortOrder ?? this.categories().length + 1,
      price: any?.price ?? 0,
      durationDays: any?.durationDays ?? 30,
      priorityWeight: any?.priorityWeight ?? 1,
      isActive: any?.isActive ?? true,
    });
    this.editOpen.set(true);
  }

  protected save(): void {
    const v = this.form.getRawValue();
    const id = this.editing()?.id;
    let request$: Observable<unknown>;
    switch (this.section()) {
      case 'kategorije': {
        const body = { name: v.name, description: v.description || null, sortOrder: v.sortOrder };
        request$ = id ? this.categoryApi.update(id, { ...body, isActive: v.isActive }) : this.categoryApi.create(body);
        break;
      }
      case 'gradovi':
        request$ = id ? this.cityApi.update(id, { name: v.name }) : this.cityApi.create({ name: v.name });
        break;
      default: {
        const body = {
          name: v.name,
          description: v.description || null,
          price: v.price,
          durationDays: v.durationDays,
          priorityWeight: v.priorityWeight,
          isActive: v.isActive,
        };
        request$ = id ? this.planApi.update(id, body) : this.planApi.create(body);
      }
    }
    request$.subscribe(() => {
      this.toasts.success('Sačuvano.');
      this.sheet()?.close();
      this.loadAll();
    });
  }

  protected async remove(item: ServiceCategory | City | SubscriptionPlan): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Obrisati „${item.name}“?`,
      message: 'Brisanje nije moguće ako se stavka već koristi. Kategorije i planove tada sakrijte (isključite „Aktivno“).',
    });
    if (!ok) return;
    const request$: Observable<void> =
      this.section() === 'kategorije'
        ? this.categoryApi.remove(item.id)
        : this.section() === 'gradovi'
          ? this.cityApi.remove(item.id)
          : this.planApi.remove(item.id);
    request$.subscribe(() => {
      this.toasts.success('Obrisano.');
      this.loadAll();
    });
  }

  private loadAll(): void {
    this.categoryApi.list({ pageSize: 100 }).subscribe((r) => this.categories.set(r.items));
    this.cityApi.list({ pageSize: 100 }).subscribe((r) => this.cities.set(r.items));
    this.planApi.list({ pageSize: 100 }).subscribe((r) => this.plans.set(r.items));
    this.lookups.ensureLoaded(true);
  }
}
