import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';
import { initials } from '../core/format';
import { ThemeService } from '../core/theme';
import { Icon } from '../shared/ui/icon';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  exact?: boolean;
}

/**
 * Okvir aplikacije za prijavljene korisnike.
 * Desktop: prozirna gornja traka (sadržaj klizi ispod nje). Telefon: prozirna donja traka sa karticama.
 * Ivica ispod gornje trake pojavljuje se tek kad sadržaj ode ispod nje (scroll edge effect).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar material" [class.scrolled]="scrolled()">
      <div class="container bar">
        <a class="brand" [routerLink]="auth.homeUrl()">
          <span class="mark" aria-hidden="true">P</span>
          <span class="serif">Planiraj</span>
        </a>

        <nav class="links" aria-label="Glavna navigacija">
          @for (item of items(); track item.link) {
            <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="account">
          <button type="button" class="avatar" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()"
            aria-haspopup="menu" aria-label="Moj nalog">
            {{ userInitials() }}
          </button>

          @if (menuOpen()) {
            <div class="menu material" role="menu">
              <div class="menu-head">
                <strong>{{ auth.user()?.firstName }} {{ auth.user()?.lastName }}</strong>
                <span class="t-footnote muted">{{ auth.user()?.email }}</span>
              </div>
              <a role="menuitem" routerLink="/profil" (click)="menuOpen.set(false)">
                <app-icon name="user" /> Profil
              </a>
              <button type="button" role="menuitem" (click)="cycleTheme()">
                <app-icon [name]="theme.preference() === 'dark' ? 'moon' : 'sun'" />
                Tema: {{ themeLabel() }}
              </button>
              <button type="button" role="menuitem" class="danger" (click)="auth.logout()">
                <app-icon name="logout" /> Odjava
              </button>
            </div>
          }
        </div>
      </div>
    </header>

    <main id="sadrzaj">
      <router-outlet />
    </main>

    <nav class="tabbar material" aria-label="Kartice">
      @for (item of items(); track item.link) {
        <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
          <app-icon [name]="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      }
      <a routerLink="/profil" routerLinkActive="active">
        <app-icon name="user" />
        <span>Profil</span>
      </a>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      height: var(--nav-height);
      box-shadow: none;
      transition: box-shadow var(--dur-base) ease;
    }

    .topbar.scrolled {
      box-shadow: 0 1px 0 var(--separator);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      height: 100%;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text);
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.015em;
    }

    .mark {
      display: grid;
      place-items: center;
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 9px;
      background: var(--accent);
      color: var(--text-on-accent);
      font-family: var(--font-display);
      font-size: 1.05rem;
    }

    .links {
      display: none;
      gap: var(--space-1);
      flex: 1;
    }

    .links a {
      padding: 0.4rem 0.8rem;
      border-radius: var(--radius-full);
      color: var(--text-secondary);
      font-size: 0.9375rem;
      font-weight: 500;
      transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease;
    }

    .links a:hover {
      color: var(--text);
      background: var(--fill);
    }

    .links a.active {
      color: var(--text);
      background: var(--fill-strong);
    }

    .account {
      position: relative;
      margin-left: auto;
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 0;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: transform var(--dur-press) ease-out;
    }

    .avatar:active {
      transform: scale(0.93);
    }

    // Meni izlazi iz avatara (origin = okidač) i tamo se vraća.
    .menu {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      display: grid;
      min-width: 15rem;
      padding: var(--space-2);
      border-radius: var(--radius-lg);
      background: var(--material-thick);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
      transform-origin: top right;
      animation: pop 220ms var(--ease-out) both;
    }

    .menu-head {
      display: grid;
      padding: var(--space-2) var(--space-3) var(--space-3);
      border-bottom: 1px solid var(--separator);
      margin-bottom: var(--space-1);
    }

    .menu a,
    .menu button {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 0.6rem var(--space-3);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text);
      font-size: 0.9375rem;
      text-align: left;
      cursor: pointer;
    }

    .menu a:hover,
    .menu button:hover {
      background: var(--fill);
    }

    .menu .danger {
      color: var(--danger);
    }

    @keyframes pop {
      from {
        opacity: 0;
        transform: scale(0.94);
      }
    }

    main {
      padding-bottom: calc(4.5rem + var(--safe-bottom));
    }

    .tabbar {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 50;
      display: flex;
      justify-content: space-around;
      padding: 0.375rem 0.5rem calc(0.375rem + var(--safe-bottom));
      box-shadow: 0 -1px 0 var(--separator);
    }

    .tabbar a {
      display: grid;
      justify-items: center;
      gap: 0.125rem;
      min-width: 4rem;
      padding: 0.25rem;
      color: var(--text-tertiary);
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: color var(--dur-fast) ease;
    }

    .tabbar a app-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .tabbar a.active {
      color: var(--accent);
    }

    @media (min-width: 48rem) {
      .links {
        display: flex;
      }

      .tabbar {
        display: none;
      }

      main {
        padding-bottom: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .menu {
        animation: none;
      }
    }
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly scrolled = signal(false);
  protected readonly menuOpen = signal(false);

  protected readonly userInitials = computed(() => initials(this.auth.user()?.firstName, this.auth.user()?.lastName));

  protected readonly items = computed<NavItem[]>(() => {
    switch (this.auth.role()) {
      case 'Admin':
        return [
          { label: 'Ponuđači', icon: 'store', link: '/admin/ponudjaci' },
          { label: 'Recenzije', icon: 'shield', link: '/admin/recenzije' },
          { label: 'Korisnici', icon: 'users', link: '/admin/korisnici' },
          { label: 'Šifarnici', icon: 'tag', link: '/admin/sifarnici' },
        ];
      case 'Vendor':
        return [
          { label: 'Moj salon', icon: 'store', link: '/salon', exact: true },
          { label: 'Rezervacije', icon: 'calendar', link: '/salon/rezervacije' },
          { label: 'Istraži', icon: 'grid', link: '/istrazi' },
        ];
      default:
        return [
          { label: 'Istraži', icon: 'grid', link: '/istrazi' },
          { label: 'Planiranje', icon: 'sparkles', link: '/planiranje' },
          { label: 'Rezervacije', icon: 'calendar', link: '/moje-rezervacije' },
          { label: 'Recenzije', icon: 'star', link: '/moje-recenzije' },
        ];
    }
  });

  protected readonly themeLabel = computed(() => {
    switch (this.theme.preference()) {
      case 'light':
        return 'svijetla';
      case 'dark':
        return 'tamna';
      default:
        return 'sistemska';
    }
  });

  @HostListener('window:scroll')
  protected onScroll(): void {
    const scrolled = window.scrollY > 4;
    if (scrolled !== this.scrolled()) this.scrolled.set(scrolled);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !(event.target as HTMLElement).closest('.account')) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.menuOpen.set(false);
  }

  protected cycleTheme(): void {
    const order = ['system', 'light', 'dark'] as const;
    const next = order[(order.indexOf(this.theme.preference()) + 1) % order.length];
    this.theme.set(next);
  }
}
