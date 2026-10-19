import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeBs from '@angular/common/locales/bs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth';

registerLocaleData(localeBs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Kratko pretapanje između stranica (preglednik ga preskače ako je uključen reduced-motion, vidi styles).
      withViewTransitions({ skipInitialTransition: true }),
    ),
    { provide: LOCALE_ID, useValue: 'bs' },
  ],
};
