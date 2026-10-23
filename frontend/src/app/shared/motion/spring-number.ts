import { DestroyRef, Signal, effect, inject, signal, untracked } from '@angular/core';
import { Spring, SpringConfig, prefersReducedMotion } from './spring';

/** Brojanje do iznosa: dovoljno sporo da se promjena osjeti, bez odskoka. */
export const SPRING_COUNT: SpringConfig = { damping: 1, response: 0.55 };

/**
 * Signal koji springom prati drugi broj (npr. ukupnu cijenu), pa se promjena vidi kao kratko "odbrojavanje"
 * umjesto skoka. Kreće od trenutne vrijednosti, pa se nove promjene glatko nadovezuju. Poziva se u
 * injection kontekstu (polje komponente). Kod reduced-motion vrijednost se mijenja odmah.
 */
export function springNumber(source: () => number, config: SpringConfig = SPRING_COUNT): Signal<number> {
  const value = signal(untracked(source));
  const spring = new Spring(value(), (v) => value.set(v), config);

  effect(() => {
    const target = source();
    untracked(() => (prefersReducedMotion() ? spring.set(target) : spring.to(target)));
  });
  inject(DestroyRef).onDestroy(() => spring.stop());

  return value.asReadonly();
}
