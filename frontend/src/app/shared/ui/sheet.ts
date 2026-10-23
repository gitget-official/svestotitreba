import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icon } from './icon';
import {
  SPRING_DEFAULT,
  SPRING_DRAWER,
  Spring,
  VelocityTracker,
  prefersReducedMotion,
  project,
  rubberband,
} from '../motion/spring';

let openSheets = 0;

/**
 * Modalni sheet.
 * - Telefon: izlazi odozdo i tamo se vraća (isti put); prevlačenje ručke 1:1, otpor iznad vrha,
 *   a na otpuštanju projekcija zamaha odlučuje zatvaranje i spring preuzima brzinu prsta.
 * - Desktop: centrirani panel koji se "materijalizuje" (skala + prozirnost), sa zatamnjenjem pozadine.
 * - Animacija se može prekinuti: ponovno hvatanje tokom zatvaranja nastavlja od trenutne pozicije.
 *
 * Upotreba: roditelj prikazuje `<app-sheet>` unutar `@if`, sluša `(closed)` i tada uklanja sheet.
 * Za zatvaranje iz koda (npr. nakon snimanja) pozovite `close()`.
 */
@Component({
  selector: 'app-sheet',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" #scrim (click)="close()"></div>
    <section
      #panel
      class="panel"
      [class.wide]="wide()"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="title()"
      tabindex="-1"
      (keydown.escape)="close()"
    >
      <header
        class="header"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
      >
        <div class="grabber" aria-hidden="true"></div>
        <h2 class="t-title-3">{{ title() }}</h2>
        <button type="button" class="icon-btn close" (click)="close()" aria-label="Zatvori">
          <app-icon name="close" />
        </button>
      </header>
      <div class="body">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      align-items: end;
      justify-items: center;
    }

    .scrim {
      position: absolute;
      inset: 0;
      background: var(--scrim);
      opacity: 0;
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-height: calc(100dvh - 2.5rem);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      // Velika površina = "deblji" materijal: skoro puna pozadina radi čitljivosti forme.
      background: color-mix(in srgb, var(--bg-elevated) 95%, transparent);
      -webkit-backdrop-filter: var(--blur-regular);
      backdrop-filter: var(--blur-regular);
      box-shadow: var(--shadow-lg), inset 0 1px 0 var(--material-edge);
      outline: none;
      transform: translateY(100%);
      will-change: transform;
    }

    .header {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-5) var(--space-5) var(--space-3);
      touch-action: none;
      cursor: grab;
      user-select: none;
    }

    .header:active {
      cursor: grabbing;
    }

    .header h2 {
      flex: 1;
    }

    .grabber {
      position: absolute;
      top: 0.5rem;
      left: 50%;
      width: 2.25rem;
      height: 0.3125rem;
      margin-left: -1.125rem;
      border-radius: var(--radius-full);
      background: var(--fill-strong);
    }

    .close {
      width: 2rem;
      height: 2rem;
    }

    .body {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: var(--space-2) var(--space-5) calc(var(--space-5) + var(--safe-bottom));
    }

    @media (min-width: 40rem) {
      :host {
        align-items: center;
        padding: var(--space-5);
      }

      .panel {
        max-width: 34rem;
        max-height: min(46rem, calc(100dvh - 3rem));
        border-radius: var(--radius-xl);
        transform: none;
        opacity: 0;
      }

      .panel.wide {
        max-width: 46rem;
      }

      .header {
        cursor: default;
        touch-action: auto;
      }

      .grabber {
        display: none;
      }
    }
  `,
})
export class Sheet implements AfterViewInit, OnDestroy {
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly scrim = viewChild.required<ElementRef<HTMLElement>>('scrim');

  /** progress: 1 = otvoreno, 0 = zatvoreno. */
  private readonly spring = new Spring(0, (p) => this.render(p), SPRING_DEFAULT);
  private readonly tracker = new VelocityTracker();
  private readonly reducedMotion = prefersReducedMotion();
  private readonly isPhone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 39.99rem)').matches;
  private previousFocus: HTMLElement | null = null;
  private closing = false;
  private drag: { pointerId: number; startY: number; startProgress: number; height: number } | null = null;

  ngAfterViewInit(): void {
    this.previousFocus = this.document.activeElement as HTMLElement | null;
    if (openSheets++ === 0) this.document.body.style.overflow = 'hidden';

    this.render(0);
    this.panel().nativeElement.focus({ preventScroll: true });
    this.spring.to(1, this.reducedMotion ? { response: 0.2 } : {});
  }

  ngOnDestroy(): void {
    this.spring.stop();
    if (--openSheets === 0) this.document.body.style.overflow = '';
    this.previousFocus?.focus?.({ preventScroll: true });
  }

  /** Animirano zatvaranje; nakon završetka emituje `closed`. */
  close(velocity?: number): void {
    this.closing = true;
    this.spring.to(0, {
      ...(velocity !== undefined ? { velocity } : {}),
      ...SPRING_DEFAULT,
      response: this.reducedMotion ? 0.2 : 0.32,
      onRest: () => this.closed.emit(),
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.isPhone || (event.target as HTMLElement).closest('button')) return;
    // Hvatanje usred animacije: kreni od trenutne (prikazane) vrijednosti.
    this.spring.stop();
    this.closing = false;
    const header = event.currentTarget as HTMLElement;
    header.setPointerCapture(event.pointerId);
    this.drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startProgress: this.spring.value,
      height: this.panel().nativeElement.offsetHeight,
    };
    this.tracker.reset();
    this.tracker.add(event.clientY, event.timeStamp);
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const startOffset = (1 - drag.startProgress) * drag.height;
    let offset = startOffset + (event.clientY - drag.startY);
    // Iznad vrha: meki otpor umjesto tvrdog zaustavljanja.
    if (offset < 0) offset = -rubberband(-offset, drag.height);

    this.tracker.add(event.clientY, event.timeStamp);
    this.spring.set(1 - offset / drag.height);
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;

    const velocityPx = this.tracker.velocity();
    const offset = (1 - this.spring.value) * drag.height;
    const projected = offset + project(velocityPx);
    // Brzina u jedinicama "progress"-a po sekundi (prema dolje = smanjuje progress).
    const velocity = -velocityPx / drag.height;

    if (projected > drag.height * 0.45) {
      this.close(velocity);
    } else {
      // Povratak sa malim odskokom, jer je prethodio gest sa zamahom.
      this.spring.to(1, { ...SPRING_DRAWER, velocity });
    }
  }

  private render(progress: number): void {
    const panel = this.panel().nativeElement;
    const clamped = Math.min(Math.max(progress, 0), 1);
    this.scrim().nativeElement.style.opacity = String(clamped);

    if (this.reducedMotion) {
      // Bez pomjeranja: samo pretapanje.
      panel.style.transform = 'none';
      panel.style.opacity = String(clamped);
      return;
    }

    if (this.isPhone) {
      panel.style.transform = `translate3d(0, ${(1 - progress) * 100}%, 0)`;
    } else {
      panel.style.opacity = String(clamped);
      panel.style.transform = `scale(${0.96 + 0.04 * progress})`;
    }

    panel.style.pointerEvents = this.closing && progress < 0.5 ? 'none' : '';
  }
}
