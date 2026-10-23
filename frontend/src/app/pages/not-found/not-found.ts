import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { Icon } from '../../shared/ui/icon';

/** Nepoznata adresa: jasno reci šta se desilo i ponudi put nazad (umjesto tihog preusmjeravanja). */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page">
      <div class="empty-state enter">
        <app-icon name="map-pin" />
        <h1 class="t-title-2">Ova stranica ne postoji</h1>
        <p>Možda je link pogrešno kopiran ili je stranica uklonjena.</p>
        <div class="row-wrap actions">
          <a class="btn btn-primary" routerLink="/istrazi">Istražite ponudu</a>
          <a class="btn" [routerLink]="auth.homeUrl()">Početna</a>
        </div>
      </div>
    </div>
  `,
  styles: `
    .actions {
      justify-content: center;
      margin-top: var(--space-3);
    }
  `,
})
export class NotFound {
  protected readonly auth = inject(AuthService);
}
