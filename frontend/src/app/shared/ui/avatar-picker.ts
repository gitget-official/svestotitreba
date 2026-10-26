import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { AVATAR_PRESETS, Avatar, AvatarArt, findPreset, isPhoto, presetValue } from './avatar';
import { Icon } from './icon';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE = 12 * 1024 * 1024;
const OUTPUT_SIZE = 256;
/** Mora ostati ispod backend ograničenja (AvatarAttribute.MaxLength). */
const MAX_DATA_URL = 190_000;

/**
 * Izbor profilne slike: veliki pregled, dvanaest ilustrovanih likova i vlastita fotografija.
 * Fotografija se izreže na kvadrat i umanji na 256 px u pregledniku, pa na server ide mali JPEG.
 * Likovi su prave radio kontrole (strelice rade same od sebe), a fotografija se može i prevući na pregled.
 */
@Component({
  selector: 'app-avatar-picker',
  imports: [Avatar, AvatarArt, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="preview-col">
      <div
        class="preview"
        [class.dragging]="dragging()"
        (dragover)="onDragOver($event)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
      >
        <!-- Novi element pri svakoj promjeni, da se izbor "spusti" u okvir. -->
        @for (v of [value()]; track v) {
          <app-avatar
            class="preview-avatar"
            [src]="v"
            [firstName]="firstName()"
            [lastName]="lastName()"
          />
        }
        <button
          type="button"
          class="camera"
          (click)="fileInput().nativeElement.click()"
          aria-label="Dodajte svoju fotografiju"
        >
          <app-icon name="camera" />
        </button>
      </div>
      <span class="name t-footnote" aria-live="polite">{{ displayName() }}</span>
      @if (value()) {
        <button type="button" class="btn btn-plain btn-sm clear" (click)="value.set(null)">
          Bez slike
        </button>
      }
    </div>

    <fieldset class="choices">
      <legend class="t-footnote muted">Odaberite lik ili dodajte svoju fotografiju</legend>
      <div class="grid">
        @for (p of presets; track p.key; let i = $index) {
          <label class="option" [class.is-selected]="value() === valueOf(p.key)" [style.--i]="i">
            <input
              class="sr-only"
              type="radio"
              name="avatar"
              [value]="valueOf(p.key)"
              [checked]="value() === valueOf(p.key)"
              (change)="value.set(valueOf(p.key))"
            />
            <app-avatar-art [preset]="p" />
            <span class="sr-only">Lik {{ i + 1 }}</span>
          </label>
        }

        <!-- Posljednja fotografija ostaje u pločici: povratak na nju je jedan dodir, ponovni dodir je mijenja. -->
        <button
          type="button"
          class="option upload"
          [class.is-selected]="hasPhoto()"
          [style.--i]="presets.length"
          [attr.aria-pressed]="hasPhoto()"
          (click)="onUploadTile()"
        >
          @if (busy()) {
            <span class="spinner"></span>
          } @else if (photo(); as src) {
            <img [src]="src" alt="" />
          } @else {
            <app-icon name="plus" />
          }
          <span class="sr-only">{{ uploadLabel() }}</span>
        </button>
      </div>
      <input
        #file
        class="sr-only"
        type="file"
        tabindex="-1"
        aria-hidden="true"
        [accept]="accept"
        (change)="onFile($event)"
      />
      @if (error()) {
        <span class="error" role="alert">{{ error() }}</span>
      } @else {
        <span class="hint">JPG, PNG ili WebP. Sliku možete i prevući na krug.</span>
      }
    </fieldset>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      justify-items: center;
    }

    .preview-col {
      display: grid;
      justify-items: center;
      gap: var(--space-1);
    }

    .preview {
      position: relative;
      width: 6rem;
      height: 6rem;
      border-radius: 50%;
      // Tanki šampanjac prsten, kao okvir na pozivnici.
      box-shadow:
        0 0 0 4px var(--bg-elevated),
        0 0 0 5px color-mix(in srgb, var(--gold) 45%, transparent),
        var(--shadow-md);
      transition:
        box-shadow var(--dur-base) var(--ease-out),
        transform var(--dur-base) var(--ease-out);
    }

    .preview.dragging {
      transform: scale(1.04);
      box-shadow:
        0 0 0 4px var(--bg-elevated),
        0 0 0 6px var(--accent),
        var(--shadow-lg);
    }

    .preview-avatar {
      width: 100%;
      height: 100%;
      animation: settle 520ms var(--ease-out) both;
    }

    @keyframes settle {
      from {
        opacity: 0;
        transform: scale(0.86) rotate(-6deg);
      }
    }

    .camera {
      position: absolute;
      right: -0.25rem;
      bottom: -0.25rem;
      display: grid;
      place-items: center;
      width: 2.125rem;
      height: 2.125rem;
      border: 3px solid var(--bg-elevated);
      border-radius: 50%;
      background: var(--accent);
      color: var(--text-on-accent);
      cursor: pointer;
      transition: transform var(--dur-press) ease-out;
    }

    .camera app-icon {
      width: 0.95rem;
      height: 0.95rem;
    }

    .camera:active {
      transform: scale(0.92);
    }

    .name {
      margin-top: var(--space-2);
      font-weight: 600;
      color: var(--text);
      min-height: 1.3em;
    }

    .clear {
      min-height: 0;
      padding-block: 0.125rem;
      font-size: 0.8125rem;
    }

    .choices {
      display: grid;
      gap: var(--space-3);
      width: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    legend {
      padding: 0;
      margin-bottom: var(--space-3);
      text-align: center;
      width: 100%;
    }

    .grid {
      display: grid;
      // 12 likova + fotografija = dva reda (7 + 6); pločice rastu sa karticom.
      grid-template-columns: repeat(7, minmax(0, 3.25rem));
      justify-content: center;
      gap: clamp(0.375rem, 2vw, 0.75rem);
    }

    .option {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border-radius: 50%;
      cursor: pointer;
      // Likovi ulaze redom, kao karte koje se slažu na sto.
      animation: option-in 460ms var(--ease-out) both;
      animation-delay: calc(120ms + var(--i, 0) * 28ms);
      transition:
        transform var(--dur-base) var(--ease-out),
        box-shadow var(--dur-fast) ease;
    }

    @keyframes option-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.9);
      }
    }

    .option app-avatar-art,
    .option img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }

    @media (hover: hover) and (pointer: fine) {
      .option:hover {
        transform: translateY(-2px);
      }
    }

    .option:active {
      transform: scale(0.94);
    }

    .option.is-selected {
      transform: scale(1.06);
      box-shadow:
        0 0 0 2px var(--bg-elevated),
        0 0 0 4px var(--accent);
    }

    .option:focus-within:has(:focus-visible) {
      box-shadow:
        0 0 0 2px var(--bg-elevated),
        0 0 0 4px var(--accent),
        0 0 0 7px var(--accent-soft);
    }

    .upload {
      padding: 0;
      font: inherit;
      overflow: hidden;
      border: 1.5px dashed color-mix(in srgb, var(--text-tertiary) 70%, transparent);
      color: var(--text-secondary);
      background: var(--bg-sunken);
    }

    .upload.is-selected {
      border-color: transparent;
    }

    .upload app-icon {
      width: 1.1rem;
      height: 1.1rem;
    }

    .upload .spinner {
      width: 1rem;
      height: 1rem;
    }

    .hint,
    .error {
      font-size: 0.75rem;
      text-align: center;
      color: var(--text-tertiary);
    }

    .error {
      color: var(--danger);
    }

    @media (prefers-reduced-motion: reduce) {
      .preview-avatar,
      .option {
        animation: fade-in var(--dur-fast) ease both;
        animation-delay: 0ms;
      }

      .option.is-selected,
      .preview.dragging {
        transform: none;
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
      }
    }
  `,
})
export class AvatarPicker {
  /** `avatar:<ključ>`, data URL fotografije ili null (inicijali). */
  readonly value = model<string | null>(null);
  readonly firstName = input<string | null | undefined>('');
  readonly lastName = input<string | null | undefined>('');

  protected readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');
  protected readonly presets = AVATAR_PRESETS;
  protected readonly accept = ACCEPT.join(',');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly hasPhoto = computed(() => isPhoto(this.value()));
  /** Posljednja učitana fotografija (ili ona sa kojom je forma otvorena). */
  private readonly lastPhoto = signal<string | null>(null);
  protected readonly photo = computed(() => (this.hasPhoto() ? this.value() : this.lastPhoto()));
  protected readonly uploadLabel = computed(() =>
    this.hasPhoto()
      ? 'Zamijenite fotografiju'
      : this.lastPhoto()
        ? 'Vaša fotografija'
        : 'Dodajte svoju fotografiju',
  );
  protected readonly displayName = computed(() => {
    const name = `${this.firstName() ?? ''} ${this.lastName() ?? ''}`.trim();
    return name || (findPreset(this.value()) || this.hasPhoto() ? 'Lijepo izgledate' : 'Vaše ime');
  });

  constructor() {
    effect(() => {
      const v = this.value();
      if (isPhoto(v)) this.lastPhoto.set(v);
    });
  }

  protected valueOf(key: string): string {
    return presetValue(key);
  }

  protected onUploadTile(): void {
    const last = this.lastPhoto();
    if (last && !this.hasPhoto()) this.value.set(last);
    else this.fileInput().nativeElement.click();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // ista datoteka se može odabrati ponovo
    if (file) void this.load(file);
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) void this.load(file);
  }

  private async load(file: File): Promise<void> {
    this.error.set(null);
    if (!ACCEPT.includes(file.type)) {
      this.error.set('Odaberite fotografiju u formatu JPG, PNG ili WebP.');
      return;
    }
    if (file.size > MAX_FILE) {
      this.error.set('Fotografija je prevelika (najviše 12 MB).');
      return;
    }
    this.busy.set(true);
    try {
      const url = await squareThumbnail(file);
      this.lastPhoto.set(url);
      this.value.set(url);
    } catch {
      this.error.set('Fotografiju nije moguće otvoriti. Pokušajte sa drugom.');
    } finally {
      this.busy.set(false);
    }
  }
}

/** Izreže sredinu fotografije na kvadrat i vrati JPEG data URL od 256 px (uz poštovanje EXIF rotacije). */
async function squareThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  // Bijela podloga za prozirne PNG-ove (JPEG nema alfa kanal).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  bitmap.close();

  for (const quality of [0.86, 0.72, 0.58]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error('too large');
}
