import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { dateToIso, dateToTime, isoToDate, timeToDate } from '../../core/date-adapter';
import { Icon } from './icon';

/** Telefon: kalendar kao dijalog preko ekrana i bez tastature (lakše prstom). */
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

const FIELD_STYLES = `
  :host { display: block; }
  .wrap { position: relative; }
  .wrap .input { padding-right: 3rem; }
  .toggle {
    position: absolute; top: 50%; right: 0.375rem; transform: translateY(-50%);
    display: grid; place-items: center; width: 2.25rem; height: 2.25rem;
    border: 0; border-radius: var(--radius-full); background: transparent; color: var(--text-secondary);
    cursor: pointer; transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease, transform var(--dur-press) ease-out;
  }
  .toggle:hover { background: var(--fill); color: var(--accent); }
  .toggle:active { transform: translateY(-50%) scale(0.9); }
  .toggle:disabled { opacity: 0.4; cursor: not-allowed; }
`;

/**
 * Polje za datum (Angular Material datepicker) sa vrijednošću u formatu backenda: "2027-06-12".
 * Prikaz i unos su "12.06.2027.". Radi i sa reactive formama i sa ngModel.
 */
@Component({
  selector: 'app-date-field',
  imports: [MatDatepickerModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true }],
  template: `
    <div class="wrap">
      <input class="input" [id]="inputId()" [matDatepicker]="picker" [min]="minDate()" [max]="maxDate()" [value]="date()"
        [placeholder]="placeholder()" [disabled]="disabled()" [readOnly]="touch" autocomplete="off" inputmode="numeric"
        [attr.aria-describedby]="describedBy()" [attr.aria-invalid]="invalid() || null" [attr.aria-label]="ariaLabel()"
        (dateChange)="select($event.value)" (blur)="onTouched()" (click)="touch && picker.open()" />
      <button type="button" class="toggle" (click)="picker.open()" [disabled]="disabled()" aria-label="Otvori kalendar">
        <app-icon name="calendar" />
      </button>
      <mat-datepicker #picker [touchUi]="touch" [startAt]="date() ?? minDate()" (closed)="onTouched()" />
    </div>
  `,
  styles: FIELD_STYLES,
})
export class DateField implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly placeholder = input('dd.mm.gggg.');
  readonly describedBy = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly invalid = input(false);

  protected readonly touch = isTouch;
  protected readonly date = signal<Date | null>(null);
  protected readonly disabled = signal(false);
  protected readonly minDate = computed(() => isoToDate(this.min()));
  protected readonly maxDate = computed(() => isoToDate(this.max()));

  private onChange: (value: string | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.date.set(isoToDate(value));
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected select(value: Date | null): void {
    this.date.set(value);
    this.onChange(dateToIso(value));
  }
}

/**
 * Polje za vrijeme (Angular Material timepicker), korak 30 minuta, vrijednost "14:30".
 */
@Component({
  selector: 'app-time-field',
  imports: [MatTimepickerModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeField), multi: true }],
  template: `
    <div class="wrap">
      <input class="input" [id]="inputId()" [matTimepicker]="picker" [matTimepickerMin]="minTime()" [matTimepickerMax]="maxTime()"
        [value]="time()" [placeholder]="placeholder()" [disabled]="disabled()" [readOnly]="touch" autocomplete="off"
        [attr.aria-describedby]="describedBy()" [attr.aria-invalid]="invalid() || null" [attr.aria-label]="ariaLabel()"
        (valueChange)="select($event)" (blur)="onTouched()" />
      <button type="button" class="toggle" (click)="picker.open()" [disabled]="disabled()" aria-label="Odaberi vrijeme">
        <app-icon name="clock" />
      </button>
      <mat-timepicker #picker [interval]="interval()" (closed)="onTouched()" />
    </div>
  `,
  styles: FIELD_STYLES,
})
export class TimeField implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly min = input('07:00');
  readonly max = input('23:30');
  readonly interval = input('30m');
  readonly placeholder = input('hh:mm');
  readonly describedBy = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly invalid = input(false);

  protected readonly touch = isTouch;
  protected readonly time = signal<Date | null>(null);
  protected readonly disabled = signal(false);
  protected readonly minTime = computed(() => timeToDate(this.min()));
  protected readonly maxTime = computed(() => timeToDate(this.max()));

  private onChange: (value: string | null) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.time.set(timeToDate(value));
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected select(value: Date | null): void {
    this.time.set(value);
    this.onChange(dateToTime(value));
  }
}
