import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';
import { FavoritesService } from '../core/favorites';
import { ThemeService } from '../core/theme';
import { BrandMark } from '../shared/ui/brand-mark';
import { Icon } from '../shared/ui/icon';
import { PlanCart } from '../shared/ui/plan-cart';
import { Avatar } from '../shared/ui/avatar';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  exact?: boolean;
  badge?: number;
  /** Na telefonu se ne prikazuje u donjoj traci (najviše 5 kartica); dostupno je iz menija naloga. */
  desktopOnly?: boolean;
}

/**
 * Okvir aplikacije za prijavljene korisnike.
 * Desktop: prozirna gornja traka (sadržaj klizi ispod nje). Telefon: prozirna donja traka sa karticama.
 * Ivica ispod gornje trake pojavljuje se tek kad sadržaj ode ispod nje (scroll edge effect).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, BrandMark, PlanCart, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#sadrzaj">Preskoči na sadržaj</a>

    <header class="topbar material" [class.scrolled]="scrolled()">
      <div class="container bar">
        <a class="brand" [routerLink]="auth.homeUrl()"><app-brand-mark /></a>

        <nav class="links" aria-label="Glavna navigacija">
          @for (item of items(); track item.link) {
            <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
              {{ item.label }}
              @if (item.badge) { <span class="nav-badge">{{ item.badge }}</span> }
            </a>
          }
        </nav>

        <div class="account">
          @if (auth.isLoggedIn()) {
            <button type="button" class="avatar" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()"
              aria-haspopup="menu" aria-label="Moj nalog">
              <app-avatar [src]="auth.user()?.avatarUrl" [firstName]="auth.user()?.firstName" [lastName]="auth.user()?.lastName" />
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
                @if (auth.hasRole('Couple')) {
                  <a role="menuitem" routerLink="/moje-recenzije" (click)="menuOpen.set(false)">
                    <app-icon name="star" /> Moje recenzije
                  </a>
                }
                <button type="button" role="menuitem" (click)="cycleTheme()">
                  <app-icon [name]="theme.preference() === 'dark' ? 'moon' : 'sun'" />
                  Tema: {{ themeLabel() }}
                </button>
                <button type="button" role="menuitem" class="danger" (click)="auth.logout()">
                  <app-icon name="logout" /> Odjava
                </button>
              </div>
            }
          } @else {
            <div class="guest">
              <a class="btn btn-plain btn-sm" routerLink="/prijava" [queryParams]="{ povratak: currentUrl() }">Prijava</a>
              <a class="btn btn-primary btn-sm" routerLink="/registracija" [queryParams]="{ povratak: currentUrl() }">
                Napravite profil
              </a>
            </div>
          }
        </div>
      </div>
    </header>

    <main id="sadrzaj" tabindex="-1">
      <router-outlet />
    </main>

    <app-plan-cart />

    <nav class="tabbar material" aria-label="Kartice">
      @for (item of tabItems(); track item.link) {
        <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!item.exact }">
          <span class="tab-icon">
            <app-icon [name]="item.icon" />
            @if (item.badge) { <span class="tab-badge">{{ item.badge }}</span> }
          </span>
          <span>{{ item.label }}</span>
        </a>
      }
      @if (auth.isLoggedIn()) {
        <a routerLink="/profil" routerLinkActive="active">
          <span class="tab-icon"><app-icon name="user" /></span>
          <span>Profil</span>
        </a>
      } @else {
        <a routerLink="/prijava" [queryParams]="{ povratak: currentUrl() }">
          <span class="tab-icon"><app-icon name="user" /></span>
          <span>Prijava</span>
        </a>
      }
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
      color: var(--text);
    }

    main:focus {
      outline: none;
    }

    .guest {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .nav-badge,
    .tab-badge {
      display: inline-grid;
      place-items: center;
      min-width: 1.125rem;
      height: 1.125rem;
      padding: 0 0.3rem;
      border-radius: var(--radius-full);
      background: var(--accent);
      color: var(--text-on-accent);
      font-size: 0.6875rem;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .nav-badge {
      margin-left: 0.25rem;
      vertical-align: 1px;
    }

    .tab-icon {
      position: relative;
      display: inline-grid;
    }

    .tab-icon app-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .tab-badge {
      position: absolute;
      top: -0.25rem;
      right: -0.6rem;
      box-shadow: 0 0 0 2px var(--bg);
    }

    .links {
      display: none;
      gap: var(--space-1);
      flex: 1;
      min-width: 0;
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

    .avatar app-avatar {
      width: 100%;
      height: 100%;
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
      min-width: 3.5rem;
      padding: 0.25rem;
      color: var(--text-tertiary);
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: color var(--dur-fast) ease;
    }

    .tabbar a.active {
      color: var(--accent);
    }

    // Aktivna kartica dobija mekanu "pilulu" iza ikone.
    .tab-icon {
      padding: 0.125rem 0.875rem;
      border-radius: var(--radius-full);
      transition:
        background-color var(--dur-base) var(--ease-out),
        transform var(--dur-press) ease-out;
    }

    .tabbar a.active .tab-icon {
      background: var(--accent-soft);
    }

    // Pritisak na karticu: odmah, bez čekanja na navigaciju.
    .tabbar a:active .tab-icon {
      transform: scale(0.9);
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
  private readonly favorites = inject(FavoritesService);
  private readonly router = inject(Router);
  protected readonly scrolled = signal(false);
  protected readonly menuOpen = signal(false);


  /** Za "Prijava" iz okvira: vrati gosta tačno tamo gdje je bio. */
  protected currentUrl(): string {
    return this.router.url;
  }

  protected readonly items = computed<NavItem[]>(() => {
    const saved = this.favorites.count() || undefined;
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
      case 'Couple':
        return [
          { label: 'Istraži', icon: 'grid', link: '/istrazi' },
          { label: 'Planer', icon: 'sparkles', link: '/planiranje' },
          { label: 'Sačuvano', icon: 'heart', link: '/sacuvano', badge: saved },
          { label: 'Rezervacije', icon: 'calendar', link: '/moje-rezervacije' },
          { label: 'Recenzije', icon: 'star', link: '/moje-recenzije', desktopOnly: true },
        ];
      default:
        // Gost: katalog, planer i lokalna lista.
        return [
          { label: 'Istraži', icon: 'grid', link: '/istrazi' },
          { label: 'Planer', icon: 'sparkles', link: '/planiranje' },
          { label: 'Sačuvano', icon: 'heart', link: '/sacuvano', badge: saved },
        ];
    }
  });

  protected readonly tabItems = computed(() => this.items().filter((i) => !i.desktopOnly));

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
