import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initials } from '../../core/format';

type HairStyle =
  'short' | 'quiff' | 'side' | 'buzz' | 'bald' | 'curly' | 'long' | 'wavy' | 'bob' | 'bun' | 'buns';

export interface AvatarPreset {
  /** Čuva se kao `avatar:<key>`; nazivi su cvjetovi da ne nose ime ni spol. */
  key: string;
  skin: string;
  hair: string;
  style: HairStyle;
  shirt: string;
  bg: string;
  beard?: boolean;
  glasses?: boolean;
  earrings?: boolean;
}

// Tople, prigušene boje iz palete (bordo, šampanjac, žalfija, taupe), bez jarkih gradijenata.
const BG = { blush: '#f6e3e1', champagne: '#f3e9d8', sage: '#e4e9de', taupe: '#ece4dd' };
const SHIRT = {
  bordo: '#a5434e',
  rose: '#d4878f',
  champagne: '#c9a46a',
  sage: '#7d8c69',
  taupe: '#9a8676',
  slate: '#56637a',
};
const SKIN = ['#f6d3be', '#edc1a3', '#dba680', '#bb7f58', '#8f5c3d', '#6c432b'];
const HAIR = {
  black: '#2a201b',
  brown: '#4b3327',
  chestnut: '#7a4b2e',
  auburn: '#a8603a',
  blonde: '#d6b278',
  gray: '#a19a92',
};

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    key: 'ruza',
    skin: SKIN[1],
    hair: HAIR.brown,
    style: 'short',
    shirt: SHIRT.slate,
    bg: BG.blush,
    beard: true,
  },
  {
    key: 'bozur',
    skin: SKIN[0],
    hair: HAIR.brown,
    style: 'bald',
    shirt: SHIRT.bordo,
    bg: BG.champagne,
    beard: true,
  },
  {
    key: 'ljiljan',
    skin: SKIN[0],
    hair: HAIR.black,
    style: 'quiff',
    shirt: SHIRT.rose,
    bg: BG.sage,
  },
  { key: 'lala', skin: SKIN[4], hair: HAIR.black, style: 'curly', shirt: SHIRT.sage, bg: BG.taupe },
  {
    key: 'jasmin',
    skin: SKIN[1],
    hair: HAIR.auburn,
    style: 'buzz',
    shirt: SHIRT.champagne,
    bg: BG.blush,
    beard: true,
  },
  {
    key: 'lavanda',
    skin: SKIN[0],
    hair: HAIR.chestnut,
    style: 'side',
    shirt: SHIRT.taupe,
    bg: BG.sage,
    glasses: true,
  },
  {
    key: 'magnolija',
    skin: SKIN[0],
    hair: HAIR.black,
    style: 'bob',
    shirt: SHIRT.slate,
    bg: BG.champagne,
  },
  {
    key: 'orhideja',
    skin: SKIN[1],
    hair: HAIR.brown,
    style: 'long',
    shirt: SHIRT.bordo,
    bg: BG.taupe,
  },
  {
    key: 'iris',
    skin: SKIN[0],
    hair: HAIR.auburn,
    style: 'wavy',
    shirt: SHIRT.champagne,
    bg: BG.blush,
  },
  {
    key: 'dalija',
    skin: SKIN[2],
    hair: HAIR.black,
    style: 'long',
    shirt: SHIRT.rose,
    bg: BG.sage,
    earrings: true,
  },
  {
    key: 'kamelija',
    skin: SKIN[5],
    hair: HAIR.black,
    style: 'bun',
    shirt: SHIRT.sage,
    bg: BG.champagne,
    earrings: true,
  },
  {
    key: 'frezija',
    skin: SKIN[3],
    hair: HAIR.brown,
    style: 'buns',
    shirt: SHIRT.taupe,
    bg: BG.blush,
    earrings: true,
  },
];

const PRESET_PREFIX = 'avatar:';

export function presetValue(key: string): string {
  return PRESET_PREFIX + key;
}

export function findPreset(value: string | null | undefined): AvatarPreset | null {
  if (!value?.startsWith(PRESET_PREFIX)) return null;
  const key = value.slice(PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((p) => p.key === key) ?? null;
}

export function isPhoto(value: string | null | undefined): value is string {
  return !!value && value.startsWith('data:image/');
}

/**
 * Ilustrovani lik u krugu (64×64). Pune boje umjesto SVG gradijenata: `url(#id)` se uz `<base href>`
 * u nekim preglednicima razrješava pogrešno. Sjena i odsjaj su prozirni slojevi iste boje.
 */
@Component({
  selector: 'app-avatar-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = preset();
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <!-- Kosa iza glave (duga, bob, punđe) -->
      @switch (p.style) {
        @case ('long') {
          <path
            [attr.fill]="p.hair"
            d="M19.4 30 C17.8 16 24.6 11.6 32 11.6 C39.4 11.6 46.2 16 44.6 30 L46.6 51 C41 54 23 54 17.4 51 Z"
          />
        }
        @case ('wavy') {
          <path
            [attr.fill]="p.hair"
            d="M19.4 29 C17.6 16 24.6 11.6 32 11.6 C39.4 11.6 46.4 16 44.6 29 C47.6 33 44.2 37 47 41 C49.4 45 45.6 49 46.4 52 L17.6 52 C18.4 49 14.6 45 17 41 C19.8 37 16.4 33 19.4 29 Z"
          />
        }
        @case ('bob') {
          <path
            [attr.fill]="p.hair"
            d="M19.6 31 C18.4 16.4 25 12 32 12 C39 12 45.6 16.4 44.4 31 L44.8 39 C40 41.4 24 41.4 19.2 39 Z"
          />
        }
        @case ('bun') {
          <circle [attr.fill]="p.hair" cx="32" cy="10.6" r="5.4" />
        }
        @case ('buns') {
          <circle [attr.fill]="p.hair" cx="22.6" cy="14.2" r="4.6" />
          <circle [attr.fill]="p.hair" cx="41.4" cy="14.2" r="4.6" />
        }
      }

      <!-- Tijelo i vrat -->
      <path [attr.fill]="p.shirt" d="M8 66 C8 51.5 19 45.4 32 45.4 C45 45.4 56 51.5 56 66 Z" />
      <path fill="#fff" opacity="0.16" d="M8 66 C8 51.5 19 45.4 32 45.4 C25 48 21 55.5 20.5 66 Z" />
      <path [attr.fill]="p.skin" d="M27.4 36 L36.6 36 L36.6 45.2 C34 47.6 30 47.6 27.4 45.2 Z" />
      <path
        fill="#000"
        opacity="0.08"
        d="M27.4 36 L36.6 36 L36.6 41 C33.6 42.6 30.4 42.6 27.4 41 Z"
      />

      <!-- Uši, glava -->
      <circle [attr.fill]="p.skin" cx="21.3" cy="29.2" r="2.9" />
      <circle [attr.fill]="p.skin" cx="42.7" cy="29.2" r="2.9" />
      <ellipse [attr.fill]="p.skin" cx="32" cy="27.6" rx="10.9" ry="12.3" />

      @if (p.earrings) {
        <circle fill="#d8b97f" cx="21" cy="33.4" r="1.25" />
        <circle fill="#d8b97f" cx="43" cy="33.4" r="1.25" />
      }

      @if (p.beard) {
        <path
          [attr.fill]="p.hair"
          d="M21.2 28.6 C21 37.6 25.6 41.6 32 41.6 C38.4 41.6 43 37.6 42.8 28.6 C41.6 32.6 39.4 34.4 36.4 34.2 C34.6 32.8 29.4 32.8 27.6 34.2 C24.6 34.4 22.4 32.6 21.2 28.6 Z"
        />
      }

      <!-- Kosa ispred -->
      @switch (p.style) {
        @case ('short') {
          <path
            [attr.fill]="p.hair"
            d="M20.8 28 C19.4 17 25 13.2 32 13.2 C39.6 13.2 44.6 17.6 43.2 28 C42 23 39.4 20.6 35.6 20 C31 19.4 26.4 20.6 24 22.6 C22.3 24 21.4 25.8 20.8 28 Z"
          />
        }
        @case ('quiff') {
          <path
            [attr.fill]="p.hair"
            d="M21 27.4 C19.6 17.6 24.6 12.6 31 12.2 C33.2 9.4 38.8 9.2 41.2 12.4 C44.6 15.2 44.2 21.2 43 27.4 C42 22.6 39.8 20.2 36.4 19.8 C33.4 21.6 27.6 21.6 24.2 21 C22.5 22.8 21.5 24.8 21 27.4 Z"
          />
        }
        @case ('side') {
          <path
            [attr.fill]="p.hair"
            d="M20.8 29 C19 18 24.6 13 32.6 13 C40 13 44.8 18 43.2 28 C42.8 24 41 21.4 38.4 20.2 C34 22.6 27 22.8 22.8 21.8 C21.8 24 21.2 26.6 20.8 29 Z"
          />
        }
        @case ('buzz') {
          <path
            [attr.fill]="p.hair"
            opacity="0.92"
            d="M21.2 26.4 C21 18.2 26 14.6 32 14.6 C38 14.6 43 18.2 42.8 26.4 C41 21.4 37 19.2 32 19.2 C27 19.2 23 21.4 21.2 26.4 Z"
          />
        }
        @case ('bald') {
          <path [attr.fill]="p.hair" d="M21.1 30.4 C20.8 27.4 21.2 25.6 22.2 24.4 L23 30.4 Z" />
          <path [attr.fill]="p.hair" d="M42.9 30.4 C43.2 27.4 42.8 25.6 41.8 24.4 L41 30.4 Z" />
          <ellipse fill="#fff" opacity="0.28" cx="35.6" cy="18.4" rx="3.2" ry="1.6" />
        }
        @case ('curly') {
          <g [attr.fill]="p.hair">
            <circle cx="24.2" cy="19.4" r="4.6" />
            <circle cx="29" cy="15.6" r="5" />
            <circle cx="35" cy="15.6" r="5" />
            <circle cx="39.8" cy="19.4" r="4.6" />
            <circle cx="21.8" cy="24.2" r="3.3" />
            <circle cx="42.2" cy="24.2" r="3.3" />
            <circle cx="32" cy="19" r="4" />
          </g>
        }
        @case ('long') {
          <path
            [attr.fill]="p.hair"
            d="M21 29.4 C20 18 25.4 13.2 32 13.2 C38.6 13.2 44 18 43 29.4 C41.6 22.2 37.6 18.6 32.4 18.2 C28.6 21 24.2 24.4 21 29.4 Z"
          />
        }
        @case ('wavy') {
          <path
            [attr.fill]="p.hair"
            d="M21 29 C20 18 25.4 13.2 32 13.2 C38.6 13.2 44 18 43 29 C42 23.6 39.4 20.4 35.6 19.4 C31.8 21.8 26 22.4 21 29 Z"
          />
        }
        @case ('bob') {
          <path
            [attr.fill]="p.hair"
            d="M21 27.4 C20.4 17.6 25.4 13.2 32 13.2 C38.6 13.2 43.6 17.6 43 27.4 C42.4 24.2 41.4 22.2 39.8 21 L24.2 21 C22.6 22.2 21.6 24.2 21 27.4 Z"
          />
        }
        @default {
          <!-- bun, buns: zalizana kosa -->
          <path
            [attr.fill]="p.hair"
            d="M21.2 27.4 C20.6 18.2 25.4 13.6 32 13.6 C38.6 13.6 43.4 18.2 42.8 27.4 C41.4 22.2 37.4 19.2 32 19.2 C26.6 19.2 22.6 22.2 21.2 27.4 Z"
          />
        }
      }

      <!-- Lice -->
      <path
        [attr.stroke]="p.hair"
        stroke-width="1.1"
        stroke-linecap="round"
        fill="none"
        opacity="0.75"
        d="M26.4 25.4 Q28 24.5 29.6 25.2 M34.4 25.2 Q36 24.5 37.6 25.4"
      />
      <ellipse fill="#2a201b" cx="28" cy="28.9" rx="0.95" ry="1.2" />
      <ellipse fill="#2a201b" cx="36" cy="28.9" rx="0.95" ry="1.2" />
      <circle fill="#e27f86" opacity="0.26" cx="25.4" cy="32.6" r="2" />
      <circle fill="#e27f86" opacity="0.26" cx="38.6" cy="32.6" r="2" />
      <path
        [attr.stroke]="p.beard ? '#f1dcd2' : '#8f4b40'"
        stroke-width="1.2"
        stroke-linecap="round"
        fill="none"
        d="M29.4 33.8 Q32 36.2 34.6 33.8"
      />

      @if (p.glasses) {
        <g fill="none" stroke="#3b2f29" stroke-width="0.9">
          <circle cx="28" cy="29" r="3.1" />
          <circle cx="36" cy="29" r="3.1" />
          <path d="M31.1 28.6 Q32 28 32.9 28.6" />
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      border-radius: 50%;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
  host: {
    '[style.background]': 'preset().bg',
  },
})
export class AvatarArt {
  readonly preset = input.required<AvatarPreset>();
}

/**
 * Profilna slika korisnika: fotografija, ilustrovani avatar ili inicijali (kad ništa nije odabrano).
 * Veličina dolazi od roditelja (širina i visina hosta).
 */
@Component({
  selector: 'app-avatar',
  imports: [AvatarArt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (photo(); as src) {
      <img [src]="src" alt="" decoding="async" />
    } @else if (preset(); as p) {
      <app-avatar-art [preset]="p" />
    } @else if (letters()) {
      <span class="initials" aria-hidden="true">{{ letters() }}</span>
    } @else {
      <svg class="silhouette" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="26" r="10" />
        <path d="M12 58 C12 45 21 39 32 39 C43 39 52 45 52 58 Z" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      overflow: hidden;
      flex: none;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
      // Inicijali rastu sa krugom.
      container-type: inline-size;
    }

    img,
    app-avatar-art {
      width: 100%;
      height: 100%;
    }

    img {
      object-fit: cover;
    }

    .initials {
      font-size: 38cqi;
      letter-spacing: 0.02em;
      line-height: 1;
    }

    .silhouette {
      width: 100%;
      height: 100%;
      fill: currentColor;
      opacity: 0.35;
    }
  `,
})
export class Avatar {
  readonly src = input<string | null | undefined>(null);
  readonly firstName = input<string | null | undefined>('');
  readonly lastName = input<string | null | undefined>('');

  protected readonly photo = computed(() => (isPhoto(this.src()) ? this.src() : null));
  protected readonly preset = computed(() => findPreset(this.src()));
  protected readonly letters = computed(() => initials(this.firstName(), this.lastName()));
}
