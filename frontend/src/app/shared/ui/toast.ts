import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { Icon } from './icon';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

/** Kratke poruke o statusu, uspjehu i greškama. Koristiti štedljivo, samo za bitne trenutke. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<ToastItem[]>([]);
  private nextId = 1;

  success(message: string): void {
    this.show('success', message);
  }

  error(message: string): void {
    this.show('error', message, 5000);
  }

  info(message: string, action?: ToastAction): void {
    // Sa akcijom (npr. "Poništi") poruka ostaje duže, da stigne da se pritisne.
    this.show('info', message, action ? 5000 : 3200, action);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  private show(kind: ToastKind, message: string, duration = 3200, action?: ToastAction): void {
    const id = this.nextId++;
    this.items.update((list) => [...list.slice(-2), { id, kind, message, action }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (toast of toasts.items(); track toast.id) {
        <div class="toast" [class]="toast.kind" role="status" (click)="toasts.dismiss(toast.id)">
          <app-icon [name]="toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info'" />
          <span class="message">{{ toast.message }}</span>
          @if (toast.action; as action) {
            <button type="button" class="action" (click)="run(toast.id, action); $event.stopPropagation()">
              {{ action.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      top: calc(var(--nav-height) + var(--space-3));
      left: 50%;
      z-index: 200;
      display: grid;
      gap: var(--space-2);
      width: min(26rem, calc(100vw - 2rem));
      transform: translateX(-50%);
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 0.75rem 1rem;
      border-radius: var(--radius-lg);
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-regular);
      backdrop-filter: var(--blur-regular);
      box-shadow: var(--shadow-md), inset 0 1px 0 var(--material-edge);
      font-size: 0.9375rem;
      font-weight: 500;
      pointer-events: auto;
      cursor: pointer;
      // Ulazi odozgo, odakle i nestaje.
      animation: drop 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .message {
      flex: 1;
    }

    .action {
      flex: none;
      padding: 0.25rem 0.625rem;
      border: 0;
      border-radius: var(--radius-full);
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform var(--dur-press) ease-out;
    }

    .action:active {
      transform: scale(0.95);
    }

    .success app-icon { color: var(--success); }
    .error app-icon { color: var(--danger); }
    .info app-icon { color: var(--accent); }

    @keyframes drop {
      from {
        opacity: 0;
        transform: translateY(-12px) scale(0.98);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: fade 200ms ease both;
      }

      @keyframes fade {
        from {
          opacity: 0;
        }
      }
    }
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);

  protected run(id: number, action: ToastAction): void {
    action.run();
    this.toasts.dismiss(id);
  }
}
