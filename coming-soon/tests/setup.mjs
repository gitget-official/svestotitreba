// Za testove u Node-u: modul "cloudflare:email" postoji samo u Workeru, pa se ovdje zamijeni malim stubom.
import { registerHooks } from 'node:module';

const stub = new URL('./cloudflare-email-stub.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:email') return { url: stub, shortCircuit: true };
    return next(specifier, context);
  }
});
