import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VendorApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { Vendor } from '../../core/models';
import { Icon } from '../../shared/ui/icon';
import { VendorCard } from '../../shared/ui/vendor-card';

/** Početna za vlasnika salona: ako upravlja jednim salonom, odmah ga otvara. */
@Component({
  selector: 'app-salon-home',
  imports: [RouterLink, Icon, VendorCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Moji saloni</h1>
          <p class="muted">Uredite stranicu, usluge, galeriju i radno vrijeme.</p>
        </div>
        <a class="btn btn-tinted" routerLink="/salon/rezervacije"><app-icon name="calendar" /> Rezervacije</a>
      </header>

      @if (loading()) {
        <div class="grid-cards"><div class="skeleton tile"></div><div class="skeleton tile"></div></div>
      } @else if (!vendors().length) {
        <div class="empty-state">
          <app-icon name="store" />
          <h3 class="t-title-3">Nalog još nije povezan sa salonom</h3>
          <p>Administrator treba da vaš nalog dodijeli salonu. Javite nam se na info&#64;planiraj.ba.</p>
        </div>
      } @else {
        <div class="grid-cards">
          @for (v of vendors(); track v.id) {
            <div class="stack-sm">
              <app-vendor-card [vendor]="v" />
              <a class="btn btn-primary btn-block" [routerLink]="['/salon', v.id]"><app-icon name="edit" /> Uredi</a>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .tile { aspect-ratio: 4 / 3; border-radius: var(--radius-lg); }
  `,
})
export class SalonHome implements OnInit {
  private readonly api = inject(VendorApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly vendors = signal<Vendor[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.api.list({ ownerUserId: this.auth.user()?.id, pageSize: 50 }).subscribe({
      next: (r) => {
        if (r.items.length === 1) {
          void this.router.navigate(['/salon', r.items[0].id], { replaceUrl: true });
          return;
        }
        this.vendors.set(r.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
