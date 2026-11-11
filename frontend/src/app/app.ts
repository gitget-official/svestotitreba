import { ChangeDetectionStrategy, Component, afterNextRender } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './shared/ui/toast';
import { ConfirmHost } from './shared/ui/confirm';
import { SiteFooter } from './shared/ui/site-footer';
import { PuzzleBackdrop } from './shared/motion/puzzle-backdrop';
import { runIntro } from './core/intro';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts, ConfirmHost, SiteFooter, PuzzleBackdrop],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Slagalica u pozadini: slaže se dok se stranica lista. -->
    <app-puzzle-backdrop />
    <!-- Stranica zauzima ostatak visine, pa je podnožje na dnu i kad je sadržaj kratak. -->
    <div class="app-page">
      <router-outlet />
    </div>
    <app-site-footer />
    <app-toasts />
    <app-confirm-host />
  `,
})
export class App {
  constructor() {
    // uvodna animacija loga (jednom po posjeti), kad je stranica prvi put iscrtana
    afterNextRender(() => runIntro());
  }
}
