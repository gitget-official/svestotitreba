import { ChangeDetectionStrategy, Component, Injectable, inject, signal, viewChild } from '@angular/core';
import { Sheet } from './sheet';

/** Odgovor na pitanje sa tri izbora (vidi ConfirmService.choose). */
export type ConfirmChoice = 'confirm' | 'alternative' | 'cancel';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmText: string;
  /** Treći izbor između "Odustani" i glavne akcije (npr. "Otvori taj salon"). */
  alternativeText: string | null;
  destructive: boolean;
  resolve: (choice: ConfirmChoice) => void;
}

/**
 * Potvrda za destruktivne, nepovratne akcije (brisanje) i, preko choose(), izbor sa tri izlaza. Ne koristiti za sve,
 * jer ljudi nauče da klikću "potvrdi" bez čitanja.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);

  ask(options: { title: string; message: string; confirmText?: string; destructive?: boolean }): Promise<boolean> {
    return this.open({ ...options, alternativeText: null }).then((choice) => choice === 'confirm');
  }

  /**
   * Odluka sa tri izlaza: glavna akcija, druga akcija ili odustajanje (zatvaranje lista = odustajanje).
   * Za izbore koji nešto mijenjaju (npr. zamjena ponuđača u planu), ne za obične potvrde.
   */
  choose(options: { title: string; message: string; confirmText: string; alternativeText: string }): Promise<ConfirmChoice> {
    return this.open({ ...options, destructive: false });
  }

  private open(options: {
    title: string;
    message: string;
    confirmText?: string;
    alternativeText: string | null;
    destructive?: boolean;
  }): Promise<ConfirmChoice> {
    return new Promise((resolve) =>
      this.request.set({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? 'Obriši',
        alternativeText: options.alternativeText,
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
        <div class="form-actions" [class.three]="req.alternativeText">
          <button type="button" class="btn" (click)="answer('cancel')">Odustani</button>
          @if (req.alternativeText) {
            <button type="button" class="btn btn-tinted" (click)="answer('alternative')">{{ req.alternativeText }}</button>
          }
          <button type="button" class="btn" [class.btn-danger]="req.destructive" [class.btn-primary]="!req.destructive"
            (click)="answer('confirm')">
            {{ req.confirmText }}
          </button>
        </div>
      </app-sheet>
    }
  `,
  styles: `
    // Tri dugmeta: na telefonu jedno ispod drugog (glavna akcija prva), na širem ekranu u redu.
    @media (max-width: 39.99rem) {
      .form-actions.three {
        display: grid;
        grid-template-columns: 1fr;
      }

      .form-actions.three .btn-primary {
        order: -1;
      }
    }
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);
  private readonly sheet = viewChild(Sheet);
  private result: ConfirmChoice = 'cancel';

  protected answer(choice: ConfirmChoice): void {
    this.result = choice;
    this.sheet()?.close();
  }

  protected finish(): void {
    const req = this.confirm.request();
    this.confirm.request.set(null);
    req?.resolve(this.result);
    this.result = 'cancel';
  }
}
