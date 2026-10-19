import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'planiraj.theme';

/** Tema prati sistem, osim ako korisnik ne odabere drugačije (lična postavka po pregledniku). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>(read());

  constructor() {
    this.apply(this.preference());
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(KEY, preference);
    } catch {
      /* ignoriši */
    }
    this.apply(preference);
  }

  private apply(preference: ThemePreference): void {
    const root = this.document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }
}

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
