import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './shared/ui/toast';
import { ConfirmHost } from './shared/ui/confirm';
import { SiteFooter } from './shared/ui/site-footer';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts, ConfirmHost, SiteFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Stranica zauzima ostatak visine, pa je podnožje na dnu i kad je sadržaj kratak. -->
    <div class="app-page">
      <router-outlet />
    </div>
    <app-site-footer />
    <app-toasts />
    <app-confirm-host />
  `,
})
export class App {}
