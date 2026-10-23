import { ChangeDetectionStrategy, Component, Injectable, inject, signal, viewChild } from '@angular/core';
import { Sheet } from './sheet';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmText: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Potvrda samo za destruktivne, nepovratne akcije (brisanje). Ne koristiti za sve,
 * jer ljudi nauče da klikću "potvrdi" bez čitanja.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(options: { title: string; message: string; confirmText?: string; destructive?: boolean }): Promise<boolean> {
    return new Promise((resolve) =>
      this.request.set({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? 'Obriši',
        destructive: options.destructive ?? true,
        resolve,
      }),
    );
  }
}

@Component({
  selector: 'app-confirm-host',
  imports: [Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.request(); as req) {
      <app-sheet [title]="req.title" (closed)="finish()">
        <p class="t-body muted">{{ req.message }}</p>
        <div class="form-actions">
          <button type="button" class="btn" (click)="answer(false)">Odustani</button>
          <button type="button" class="btn" [class.btn-danger]="req.destructive" [class.btn-primary]="!req.destructive"
            (click)="answer(true)">
            {{ req.confirmText }}
          </button>
        </div>
      </app-sheet>
    }
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);
  private readonly sheet = viewChild(Sheet);
  private result = false;

  protected answer(ok: boolean): void {
    this.result = ok;
    this.sheet()?.close();
  }

  protected finish(): void {
    const req = this.confirm.request();
    this.confirm.request.set(null);
    req?.resolve(this.result);
    this.result = false;
  }
}
