import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  contentChildren,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';

let nextId = 0;

/**
 * Jedna stavka u `app-select` (zamjena za `<option>`). Tekst stavke je njen sadržaj, a vrijednost bilo šta
 * (broj, tekst, null), kao `[ngValue]` kod nativnog `<option>`.
 */
@Component({
  selector: 'app-option',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: none;
    }
  `,
})
export class SelectOption {
  readonly value = input<unknown>(null);
  readonly disabled = input(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  label(): string {
    return (this.host.textContent ?? '').trim();
  }
}

/** Panel se otvara ispod polja, poravnat s lijevom ivicom; iznad samo kad ispod nema mjesta. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
];

/**
 * Zajednički padajući izbornik (zamjena za nativni `<select>`), isti izgled svuda u aplikaciji.
 * - Panel živi u CDK overlay sloju (na nivou `body`), pa ga ne siječe `overflow` roditelja (list, kartica)
 *   i uvijek je iznad sadržaja; ostaje unutar ekrana (margina 8 px) i prati polje pri skrolu.
 * - Radi kao `<select>` za forme: `formControlName`, `[(ngModel)]`, `[ngModel]` + `(ngModelChange)`.
 * - Tastatura kao kod nativnog: strelice, Home/End, Enter/razmak, Escape, Tab i skok na prvo slovo.
 * - `variant="bare"`: bez okvira i pozadine (npr. polja u pretrazi na početnoj stranici).
 */
@Component({
  selector: 'app-select',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true }],
  template: `
    <button
      #trigger="cdkOverlayOrigin"
      cdkOverlayOrigin
      type="button"
      class="trigger"
      [class.select]="variant() === 'field'"
      [class.bare]="variant() === 'bare'"
      [class.open]="open()"
      [id]="inputId()"
      role="combobox"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? listId : null"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-activedescendant]="open() && active() >= 0 ? optionId(active()) : null"
      [attr.aria-invalid]="invalid() || null"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="onKey($event)"
      (blur)="onBlur()"
    >
      <span class="value" [class.placeholder]="selectedIndex() < 0">{{
        selectedLabel() || placeholder()
      }}</span>
      <app-icon name="chevron-down" class="chev" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayMinWidth]="width()"
      [cdkConnectedOverlayViewportMargin]="8"
      [cdkConnectedOverlayFlexibleDimensions]="true"
      [cdkConnectedOverlayGrowAfterOpen]="true"
      [cdkConnectedOverlayPush]="false"
      (overlayOutsideClick)="onOutside($event)"
      (detach)="close(false)"
    >
      <ul
        class="dropdown-panel select-panel"
        role="listbox"
        [id]="listId"
        [attr.aria-label]="ariaLabel()"
        #panel
      >
        @for (option of options(); track $index; let i = $index) {
          <li
            role="option"
            class="select-option"
            [id]="optionId(i)"
            [class.active]="i === active()"
            [class.selected]="i === selectedIndex()"
            [attr.aria-selected]="i === selectedIndex()"
            [attr.aria-disabled]="option.disabled() || null"
            (mousemove)="active.set(i)"
            (mousedown)="$event.preventDefault()"
            (click)="pick(i)"
          >
            <span>{{ option.label() }}</span>
            @if (i === selectedIndex()) {
              <app-icon name="check" class="tick" [strokeWidth]="2.2" />
            }
          </li>
        }
      </ul>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .trigger {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      text-align: left;
      color: var(--text);
      cursor: pointer;
    }

    // Isto polje kao .input; strelica je ikona (globalni .select crta svoju kao pozadinu).
    .trigger.select {
      padding-right: 0.75rem;
      background-image: none;
    }

    .trigger.bare {
      min-height: 0;
      padding: 0;
      border: 0;
      background: transparent;
      font-size: 1rem;
      font-weight: 600;
    }

    .trigger.bare:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }

    .trigger:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .placeholder {
      color: var(--text-tertiary);
    }

    .chev {
      flex: none;
      width: 1rem;
      height: 1rem;
      color: var(--text-tertiary);
      transition: transform var(--dur-fast) var(--ease-out);
    }

    .open .chev {
      transform: rotate(180deg);
    }

    :host(.ng-invalid.ng-touched) .trigger.select,
    .trigger[aria-invalid='true'] {
      border-color: var(--danger);
    }

    @media (prefers-reduced-motion: reduce) {
      .chev {
        transition: none;
      }
    }
  `,
})
export class Select implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly placeholder = input('Odaberite');
  readonly variant = input<'field' | 'bare'>('field');
  readonly invalid = input(false);

  protected readonly options = contentChildren(SelectOption);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly disabled = signal(false);
  protected readonly value = signal<unknown>(null);
  protected readonly width = signal(0);
  protected readonly positions = POSITIONS;
  protected readonly listId = `app-select-${nextId++}`;

  private readonly origin = viewChild.required(CdkOverlayOrigin);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly selectedIndex = computed(() =>
    this.options().findIndex((o) => o.value() === this.value()),
  );

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  private triggerEl(): HTMLButtonElement {
    return this.origin().elementRef.nativeElement as HTMLButtonElement;
  }

  protected selectedLabel(): string {
    const index = this.selectedIndex();
    return index >= 0 ? this.options()[index].label() : '';
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  protected show(): void {
    if (this.disabled() || !this.options().length) return;
    this.width.set(this.triggerEl().getBoundingClientRect().width);
    this.active.set(Math.max(0, this.selectedIndex()));
    this.open.set(true);
    // Izabrana stavka je odmah vidljiva i u dugoj listi (npr. gradovi).
    requestAnimationFrame(() => this.scrollToActive());
  }

  close(focus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (focus) this.triggerEl().focus();
  }

  protected pick(index: number): void {
    const option = this.options()[index];
    if (!option || option.disabled()) return;
    if (option.value() !== this.value()) {
      this.value.set(option.value());
      this.onChange(option.value());
    }
    this.onTouched();
    this.close();
  }

  protected onOutside(event: MouseEvent): void {
    // Klik na samo polje rješava toggle(); sve ostalo zatvara panel bez vraćanja fokusa.
    if (!this.triggerEl().contains(event.target as Node)) this.close(false);
  }

  protected onBlur(): void {
    if (!this.open()) this.onTouched();
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    if (!count) return;
    const open = this.open();

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) return this.show();
        this.move(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      case 'Home':
      case 'End':
        if (!open) return;
        event.preventDefault();
        this.active.set(event.key === 'Home' ? 0 : count - 1);
        this.scrollToActive();
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) this.pick(this.active());
        else this.show();
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation(); // da Escape ne zatvori i list/dijalog ispod
          this.close();
        }
        return;
      case 'Tab':
        if (open) this.close(false);
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
          this.typeahead(event.key);
    }
  }

  writeValue(value: unknown): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.close(false);
  }

  private move(step: number): void {
    const options = this.options();
    let next = this.active();
    for (let i = 0; i < options.length; i++) {
      next = Math.min(options.length - 1, Math.max(0, next + step));
      if (!options[next].disabled()) break;
    }
    this.active.set(next);
    this.scrollToActive();
  }

  /** Prvo slovo skače na sljedeću stavku koja počinje njime (kao kod nativnog izbornika). */
  private typeahead(key: string): void {
    const options = this.options();
    const letter = key.toLocaleLowerCase('bs');
    const start = this.open() ? this.active() : this.selectedIndex();
    for (let step = 1; step <= options.length; step++) {
      const i = (start + step + options.length) % options.length;
      if (!options[i].disabled() && options[i].label().toLocaleLowerCase('bs').startsWith(letter)) {
        if (this.open()) {
          this.active.set(i);
          this.scrollToActive();
        } else {
          this.pick(i);
        }
        return;
      }
    }
  }

  private scrollToActive(): void {
    const item = this.panel()?.nativeElement.querySelector<HTMLElement>(
      `#${this.optionId(this.active())}`,
    );
    item?.scrollIntoView({ block: 'nearest' });
  }
}

/** Za `imports` komponenti: `[...SELECT]`. */
export const SELECT = [Select, SelectOption] as const;
