import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Sadržaj se blago pojavi kad uđe u vidno polje, jednom (ne ponavlja se pri skrolanju nazad).
 * Jedan zajednički IntersectionObserver za cijelu aplikaciju. Skriveno stanje postoji samo dok je
 * `html.reveal-armed`, pa bez podrške za observer sadržaj je odmah vidljiv. Stilovi su u `styles/_motion.scss`.
 *
 * - `appReveal`: element ulazi kao cjelina; `revealDelay` (ms) za ručni redoslijed.
 * - `appReveal="stagger"`: djeca ulaze redom (npr. kartice u mreži).
 */
@Directive({
  selector: '[appReveal]',
  host: {
    '[class.reveal]': 'mode() !== "stagger"',
    '[class.reveal-stagger]': 'mode() === "stagger"',
    '[style.--reveal-delay.ms]': 'revealDelay()',
  },
})
export class Reveal {
  readonly mode = input<'' | 'stagger'>('', { alias: 'appReveal' });
  readonly revealDelay = input(0);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const observer = sharedObserver();
    if (!observer) return;

    afterNextRender(() => observer.observe(el));
    inject(DestroyRef).onDestroy(() => observer.unobserve(el));
  }
}

let observer: IntersectionObserver | null | undefined;

function sharedObserver(): IntersectionObserver | null {
  if (observer !== undefined) return observer;
  if (typeof IntersectionObserver === 'undefined') return (observer = null);

  document.documentElement.classList.add('reveal-armed');
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer!.unobserve(entry.target);
      }
    },
    // Malo prije nego što element stvarno dođe do dna ekrana, da pokret ne kasni za skrolom.
    { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
  );
  return observer;
}
