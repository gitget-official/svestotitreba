import { Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/**
 * Fotografija se pretopi kad se stvarno učita, umjesto da "iskoči" preko podloge.
 * Slika iz keša je odmah vidljiva (bez pretapanja), a greška pri učitavanju je ne ostavlja skrivenu.
 */
@Directive({
  selector: 'img[appFadeIn]',
  host: {
    class: 'fade-img',
    '[class.is-loaded]': 'loaded()',
    '(load)': 'loaded.set(true)',
    '(error)': 'loaded.set(true)',
  },
})
export class FadeInImage {
  protected readonly loaded = signal(false);

  constructor() {
    const img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('no-fade');
        this.loaded.set(true);
      }
    });
  }
}
