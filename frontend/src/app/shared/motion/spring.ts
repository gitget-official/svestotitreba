/**
 * Mala spring biblioteka u duhu Apple "Designing Fluid Interfaces".
 *
 * - Parametri su `damping` (omjer prigušenja; 1 = bez odskoka) i `response` (koliko brzo stiže, u sekundama),
 *   a ne masa/krutost/prigušenje.
 * - Animacija uvijek kreće od TRENUTNE vrijednosti i trenutne brzine, pa se može prekinuti i preusmjeriti
 *   u bilo kojem trenutku bez skoka (interruptibility).
 * - Brzina gesta se predaje springu (velocity handoff), pa nema šava između prevlačenja i animacije.
 */

export interface SpringConfig {
  /** 1.0 = kritično prigušeno (bez odskoka). < 1 = odskok. */
  damping: number;
  /** Vrijeme odziva u sekundama (manje = brže). */
  response: number;
}

export const SPRING_DEFAULT: SpringConfig = { damping: 1, response: 0.35 };
/** Za ladice/sheetove nakon gesta sa zamahom (Apple: 0.8 / 0.3). */
export const SPRING_DRAWER: SpringConfig = { damping: 0.8, response: 0.3 };

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class Spring {
  private target: number;
  private velocity = 0;
  private frame = 0;
  private lastTime = 0;
  private config: SpringConfig;
  private onRest?: () => void;

  constructor(
    private current: number,
    private readonly onUpdate: (value: number) => void,
    config: SpringConfig = SPRING_DEFAULT,
  ) {
    this.target = current;
    this.config = config;
  }

  get value(): number {
    return this.current;
  }

  get isAnimating(): boolean {
    return this.frame !== 0;
  }

  /** Postavi vrijednost odmah (npr. tokom prevlačenja 1:1), bez animacije. */
  set(value: number): void {
    this.stop();
    this.current = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  /**
   * Animiraj do cilja. Kreće od trenutne vrijednosti; ako je `velocity` zadan (jedinica/s),
   * preuzima brzinu gesta, inače zadržava trenutnu brzinu (glatko preusmjeravanje).
   */
  to(target: number, options: Partial<SpringConfig> & { velocity?: number; onRest?: () => void } = {}): void {
    this.target = target;
    this.config = { ...this.config, ...pick(options) };
    if (options.velocity !== undefined) this.velocity = options.velocity;
    this.onRest = options.onRest;

    if (this.frame === 0) {
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (now: number): void => {
    // Ograniči korak (npr. nakon povratka na tab) da simulacija ne "eksplodira".
    let dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;

    const { damping, response } = this.config;
    const stiffness = Math.pow((2 * Math.PI) / Math.max(response, 0.01), 2);
    const friction = (4 * Math.PI * damping) / Math.max(response, 0.01);

    // Polu-implicitni Euler u malim podkoracima za stabilnost.
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    dt /= steps;
    for (let i = 0; i < steps; i++) {
      const force = -stiffness * (this.current - this.target) - friction * this.velocity;
      this.velocity += force * dt;
      this.current += this.velocity * dt;
    }

    const settled = Math.abs(this.velocity) < 0.001 && Math.abs(this.current - this.target) < 0.0005;
    if (settled) {
      this.current = this.target;
      this.velocity = 0;
      this.frame = 0;
      this.onUpdate(this.current);
      const done = this.onRest;
      this.onRest = undefined;
      done?.();
      return;
    }

    this.onUpdate(this.current);
    this.frame = requestAnimationFrame(this.tick);
  };
}

function pick(options: Partial<SpringConfig>): Partial<SpringConfig> {
  const result: Partial<SpringConfig> = {};
  if (options.damping !== undefined) result.damping = options.damping;
  if (options.response !== undefined) result.response = options.response;
  return result;
}

/**
 * Gdje bi se element zaustavio da nastavi zamahom (Apple-ova funkcija iz WWDC primjera).
 * decelerationRate 0.998 = osjećaj skrolanja; 0.99 = brže zaustavljanje.
 */
export function project(velocityPxPerSecond: number, decelerationRate = 0.998): number {
  return ((velocityPxPerSecond / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Meki otpor preko granice: što dalje vučeš, element sve manje prati. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Kratka historija pozicija za računanje brzine na otpuštanju. */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];

  reset(): void {
    this.samples = [];
  }

  add(value: number, time = performance.now()): void {
    this.samples.push({ t: time, v: value });
    // Zadrži samo zadnjih ~100 ms.
    while (this.samples.length > 2 && time - this.samples[0].t > 100) this.samples.shift();
  }

  /** Brzina u jedinicama po sekundi. */
  velocity(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.v - first.v) / dt : 0;
  }
}
