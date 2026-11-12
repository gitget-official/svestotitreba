import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Jednostavne linijske ikone (24×24, stroke). Dekorativne su osim ako je zadan `label`. */
const ICONS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  locate: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  expand: '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  'map-pin': '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
  facebook: '<path d="M14.5 8.5h2V5h-2.3C11.8 5 10.5 6.6 10.5 9v2H8v3.4h2.5V21h3.6v-6.6h2.5l.4-3.4h-2.9V9.3c0-.5.3-.8.8-.8z"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.3-3.6 4-5.5 7.5-5.5s6.2 1.9 7.5 5.5"/>',
  users: '<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.5c1-3.2 3.3-4.8 6.2-4.8s5.2 1.6 6.2 4.8"/><path d="M15.5 5.3a3.4 3.4 0 0 1 0 6.4M17.5 14.9c1.8.6 3 2.1 3.7 4.6"/>',
  logout: '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 16l-4-4 4-4M6 12h9"/>',
  store: '<path d="M4 9.5 5.5 4.5h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17.5 5-4.5 4 3.5 3-2.5 4.5 4"/>',
  sparkles: '<path d="M12 3.5 13.6 9 19 10.5l-5.4 1.6L12 17.5l-1.6-5.4L5 10.5 10.4 9z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  edit: '<path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.5"/>',
  crown: '<path d="M4 18.5h16M4.5 16 3.5 7l5 4 3.5-6 3.5 6 5-4-1 9z"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4M12 17h.01"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5h-2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/>',
  compare: '<rect x="3.5" y="5" width="7" height="14" rx="1.5"/><rect x="13.5" y="5" width="7" height="14" rx="1.5"/>',
  wallet: '<path d="M4.5 7.5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-12a1.5 1.5 0 0 1 1.5-1.5h11"/><path d="M15.5 13.5h4"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.7-4.9"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8v5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
  rings: '<circle cx="9" cy="14" r="5.5"/><circle cx="15" cy="14" r="5.5"/><path d="m10.5 4.5 1.5-1.5 1.5 1.5-1.5 1.5z"/>',
  chat: '<path d="M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-1 0-2-.1-2.9-.4L5 20l1.1-3.6C4.5 15.1 3.5 13.2 3.5 11.2 3.5 7.2 7.3 4 12 4z"/>',
  send: '<path d="M4.5 12 3.5 4.5 20.5 12 3.5 19.5z"/><path d="M4.5 12h8"/>',
  // Kategorije
  dress: '<path d="M9.5 3.5h5l-1 4 3.5 4.5-1.5 2 2.5 6.5h-12l2.5-6.5-1.5-2L10.5 7.5z"/>',
  building: '<path d="M4.5 20.5v-12l7.5-5 7.5 5v12"/><path d="M3 20.5h18M9.5 20.5v-5h5v5M8.5 11h1M14.5 11h1"/>',
  flower: '<circle cx="12" cy="6.5" r="2.5"/><circle cx="15.8" cy="9.6" r="2.5"/><circle cx="8.2" cy="9.6" r="2.5"/><path d="M12 12.5V21M12 17.5c-1.8-.2-3.2-1.2-3.8-3M12 19c1.8-.2 3.2-1.2 3.8-3"/>',
  camera: '<path d="M4.5 8h3l1.5-2.5h6L16.5 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.4"/>',
  car: '<path d="M5 16.5h14v-4l-2-4.5H7l-2 4.5z"/><path d="M5 12.5h14M6.5 16.5v2M17.5 16.5v2"/><circle cx="8" cy="14.5" r=".8" fill="currentColor"/><circle cx="16" cy="14.5" r=".8" fill="currentColor"/>',
  scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 19.5 17M8.6 15.6 19.5 7"/>',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'app-icon',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label()',
  },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="strokeWidth()"
    stroke-linecap="round"
    stroke-linejoin="round"
    [class.filled]="filled()"
    [innerHTML]="markup()"
  ></svg>`,
  styles: `
    :host { display: inline-flex; width: 1.25rem; height: 1.25rem; flex: none; }
    svg { width: 100%; height: 100%; }
    svg.filled { fill: currentColor; }
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly label = input<string | null>(null);
  readonly filled = input(false);
  readonly strokeWidth = input(1.75);

  private readonly sanitizer = inject(DomSanitizer);

  // Markup dolazi isključivo iz statične mape iznad, pa je zaobilaženje sanitizera sigurno.
  protected readonly markup = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()] ?? ICONS['info']),
  );
}

/** Ikona za kategoriju usluge prema slug-u (nepoznate dobijaju "sparkles"). */
export function categoryIcon(slug: string | null | undefined): string {
  switch (slug) {
    case 'vjencanice-i-odijela':
      return 'dress';
    case 'saloni-za-vjencanje':
      return 'building';
    case 'dekoracije':
      return 'flower';
    case 'fotografi':
      return 'camera';
    case 'svecani-automobili':
      return 'car';
    case 'frizeri':
      return 'scissors';
    case 'beauty-makeup':
      return 'sparkles';
    default:
      return 'sparkles';
  }
}
