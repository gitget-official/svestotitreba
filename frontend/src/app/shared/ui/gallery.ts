import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { VendorImage } from '../../core/models';
import { SPRING_DEFAULT, SPRING_DRAWER, Spring, VelocityTracker, project, rubberband } from '../motion/spring';
import { FadeInImage } from '../motion/fade-in-image';
import { Icon } from './icon';

/**
 * Galerija koja se prevlači prstom/mišem:
 * slika prati pokazivač 1:1, na krajevima pruža meki otpor, a na otpuštanju projekcija zamaha bira
 * sliku na kojoj ćemo stati. Spring preuzima brzinu prsta i može se ponovo uhvatiti u letu.
 */
@Component({
  selector: 'app-gallery',
  imports: [FadeInImage, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #viewport
      class="viewport"
      tabindex="0"
      role="region"
      aria-roledescription="galerija"
      [attr.aria-label]="'Fotografije, ' + (index() + 1) + ' od ' + images().length"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (keydown.arrowLeft)="go(index() - 1)"
      (keydown.arrowRight)="go(index() + 1)"
    >
      <div #track class="track">
        @for (image of images(); track image.id; let i = $index) {
          <figure class="slide">
            <img appFadeIn [src]="image.url" [alt]="image.caption || 'Fotografija ' + (i + 1)" draggable="false"
              [attr.loading]="i === 0 ? 'eager' : 'lazy'" decoding="async" />
          </figure>
        }
      </div>

      @if (images().length > 1) {
        <button type="button" class="nav prev" (click)="go(index() - 1)" [disabled]="index() === 0" aria-label="Prethodna">
          <app-icon name="chevron-left" />
        </button>
        <button type="button" class="nav next" (click)="go(index() + 1)" [disabled]="index() === images().length - 1"
          aria-label="Sljedeća">
          <app-icon name="chevron-right" />
        </button>
        <div class="dots" aria-hidden="true">
          @for (image of images(); track image.id; let i = $index) {
            <span [class.on]="i === index()"></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .viewport {
      position: relative;
      overflow: hidden;
      aspect-ratio: 16 / 10;
      border-radius: var(--radius-xl);
      background: var(--bg-sunken);
      touch-action: pan-y;
      cursor: grab;
      user-select: none;
    }

    .viewport:active {
      cursor: grabbing;
    }

    .track {
      display: flex;
      height: 100%;
      will-change: transform;
    }

    .slide {
      flex: 0 0 100%;
      height: 100%;
      margin: 0;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
    }

    .nav {
      position: absolute;
      top: 50%;
      display: none;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      margin-top: -1.25rem;
      border: 0;
      border-radius: 50%;
      background: var(--material-thick);
      -webkit-backdrop-filter: var(--blur-thin);
      backdrop-filter: var(--blur-thin);
      box-shadow: var(--shadow-md);
      color: var(--text);
      cursor: pointer;
      transition: transform var(--dur-press) ease-out, opacity var(--dur-fast) ease;
    }

    .nav:active {
      transform: scale(0.92);
    }

    .nav:disabled {
      opacity: 0;
      pointer-events: none;
    }

    .prev {
      left: var(--space-3);
    }

    .next {
      right: var(--space-3);
    }

    .dots {
      position: absolute;
      bottom: var(--space-3);
      left: 50%;
      display: flex;
      gap: 6px;
      padding: 6px 8px;
      border-radius: var(--radius-full);
      background: rgba(0, 0, 0, 0.28);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      transform: translateX(-50%);
    }

    .dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      transition: background-color var(--dur-fast) ease, transform var(--dur-fast) ease;
    }

    .dots span.on {
      background: #fff;
      transform: scale(1.25);
    }

    @media (hover: hover) and (min-width: 48rem) {
      .nav {
        display: grid;
      }
    }
  `,
})
export class Gallery implements AfterViewInit, OnDestroy {
  readonly images = input.required<VendorImage[]>();

  protected readonly index = signal(0);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  private readonly spring = new Spring(0, (x) => this.render(x), SPRING_DEFAULT);
  private readonly tracker = new VelocityTracker();
  private drag: { id: number; startX: number; startY: number; startOffset: number; locked: 'x' | 'y' | null } | null = null;
  private width = 0;

  ngAfterViewInit(): void {
    this.width = this.viewport().nativeElement.clientWidth;
  }

  ngOnDestroy(): void {
    this.spring.stop();
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.width = this.viewport().nativeElement.clientWidth;
    this.spring.set(-this.index() * this.width);
  }

  protected go(target: number, velocity?: number): void {
    const count = this.images().length;
    const next = Math.max(0, Math.min(count - 1, target));
    this.index.set(next);
    this.width = this.viewport().nativeElement.clientWidth;
    this.spring.to(-next * this.width, {
      ...(velocity !== undefined ? { velocity, ...SPRING_DRAWER } : SPRING_DEFAULT),
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.images().length < 2 || (event.target as HTMLElement).closest('button')) return;
    // Uhvati u letu: nastavi od trenutno prikazane pozicije.
    this.spring.stop();
    this.width = this.viewport().nativeElement.clientWidth;
    this.drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, startOffset: this.spring.value, locked: null };
    this.tracker.reset();
    this.tracker.add(event.clientX, event.timeStamp);
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    // Mali prag (histereza) prije nego što odlučimo smjer; vertikalni pokret prepuštamo skrolanju stranice.
    if (!drag.locked) {
      if (Math.hypot(dx, dy) < 8) return;
      drag.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.locked === 'x') this.viewport().nativeElement.setPointerCapture(event.pointerId);
    }
    if (drag.locked !== 'x') return;

    const min = -(this.images().length - 1) * this.width;
    let offset = drag.startOffset + dx;
    if (offset > 0) offset = rubberband(offset, this.width);
    else if (offset < min) offset = min - rubberband(min - offset, this.width);

    this.tracker.add(event.clientX, event.timeStamp);
    this.spring.set(offset);
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.drag = null;
    if (drag.locked !== 'x') return;

    const velocity = this.tracker.velocity();
    // Projekcija zamaha: gdje bi galerija stala, pa najbliža slika toj tački (najviše jedna slika po zamahu).
    const projected = this.spring.value + project(velocity, 0.99);
    const nearest = Math.round(-projected / this.width);
    const current = this.index();
    this.go(Math.max(current - 1, Math.min(current + 1, nearest)), velocity);
  }

  private render(x: number): void {
    this.track().nativeElement.style.transform = `translate3d(${x}px, 0, 0)`;
  }
}
