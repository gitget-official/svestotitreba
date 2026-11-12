import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { authGuard, guestGuard, passwordGuard, roleGuard } from './core/auth';

/**
 * Sanduče je jedna ruta za "poruke", "poruke/:id" i (za mladence) "poruke/salon/:vendorId", pa se stranica
 * ne pravi iznova pri prelasku između razgovora (lista ostaje gdje je bila).
 */
function inboxMatcher(withVendorTarget: boolean) {
  return (segments: UrlSegment[]): UrlMatchResult | null => {
    const [root, a, b] = segments.map((s) => s.path);
    if (root !== 'poruke') return null;
    if (segments.length === 1) return { consumed: segments };
    if (segments.length === 2 && /^\d+$/.test(a)) return { consumed: segments, posParams: { id: segments[1] } };
    if (withVendorTarget && segments.length === 3 && a === 'salon' && /^\d+$/.test(b))
      return { consumed: segments, posParams: { vendorId: segments[2] } };
    return null;
  };
}

// Naslovi su kratki; brend dodaje BrandTitleStrategy (core/brand.ts).
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'prijava',
    canActivate: [guestGuard],
    title: 'Prijava',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.Login),
  },
  {
    path: 'registracija',
    canActivate: [guestGuard],
    title: 'Registracija',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.Register),
  },
  {
    // saloni: posebna prijava i registracija preko Googlea
    path: 'za-salone',
    canActivate: [guestGuard],
    title: 'Za salone',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.SalonSignup),
  },
  {
    // poslije prve prijave preko Googlea: slika, ime i grad
    path: 'dobrodosli',
    canActivate: [authGuard],
    title: 'Dobro došli',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.Welcome),
  },
  {
    path: 'promjena-lozinke',
    canActivate: [authGuard],
    title: 'Nova lozinka',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.ChangePassword),
  },
  {
    // Okvir je dostupan i gostima: katalog, ponuđač, planer i "Sačuvano" su javni u frontendu.
    // Ako backend za gosta vrati 401, interceptor ga vodi na prijavu i nazad.
    path: '',
    canActivate: [passwordGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: 'istrazi',
        title: 'Istraži ponudu',
        loadComponent: () => import('./pages/explore/explore').then((m) => m.Explore),
      },
      {
        path: 'ponudjaci/:id',
        title: 'Ponuđač',
        loadComponent: () => import('./pages/vendor-detail/vendor-detail').then((m) => m.VendorDetail),
      },
      {
        path: 'sacuvano',
        title: 'Sačuvano',
        loadComponent: () => import('./pages/saved/saved').then((m) => m.Saved),
      },
      {
        path: 'planiranje',
        title: 'Planiranje vjenčanja',
        loadComponent: () => import('./pages/planning/planning').then((m) => m.Planning),
      },
      {
        path: 'uslovi',
        title: 'Uslovi korištenja',
        loadComponent: () => import('./pages/legal/legal').then((m) => m.Terms),
      },
      {
        path: 'privatnost',
        title: 'Privatnost',
        loadComponent: () => import('./pages/legal/legal').then((m) => m.Privacy),
      },
      {
        path: 'moje-rezervacije',
        canActivate: [roleGuard('Couple')],
        title: 'Moje rezervacije',
        loadComponent: () => import('./pages/my/my-pages').then((m) => m.MyBookings),
      },
      {
        path: 'moje-recenzije',
        canActivate: [roleGuard('Couple')],
        title: 'Moje recenzije',
        loadComponent: () => import('./pages/my/my-pages').then((m) => m.MyReviews),
      },
      {
        matcher: inboxMatcher(true),
        canActivate: [roleGuard('Couple')],
        title: 'Poruke',
        loadComponent: () => import('./pages/messages/messages').then((m) => m.Messages),
      },
      {
        path: 'salon',
        canActivate: [roleGuard('Vendor')],
        children: [
          {
            path: '',
            title: 'Moj salon',
            loadComponent: () => import('./pages/salon/salon-home').then((m) => m.SalonHome),
          },
          {
            path: 'postavljanje',
            title: 'Postavljanje salona',
            loadComponent: () => import('./pages/salon/vendor-setup').then((m) => m.VendorSetup),
          },
          {
            path: 'rezervacije',
            title: 'Rezervacije',
            loadComponent: () => import('./pages/salon/salon-bookings').then((m) => m.SalonBookings),
          },
          {
            // prije ':id', da "poruke" ne bude Id salona
            matcher: inboxMatcher(false),
            title: 'Poruke',
            loadComponent: () => import('./pages/messages/messages').then((m) => m.Messages),
          },
          {
            path: ':id',
            title: 'Uređivanje salona',
            loadComponent: () => import('./pages/salon/vendor-manage').then((m) => m.VendorManage),
          },
        ],
      },
      {
        path: 'admin',
        canActivate: [roleGuard('Admin')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'ponudjaci' },
          {
            path: 'ponudjaci',
            title: 'Ponuđači · Admin',
            loadComponent: () => import('./pages/admin/admin-vendors').then((m) => m.AdminVendors),
          },
          {
            path: 'ponudjaci/:id',
            title: 'Uređivanje ponuđača · Admin',
            loadComponent: () => import('./pages/salon/vendor-manage').then((m) => m.VendorManage),
          },
          {
            path: 'recenzije',
            title: 'Recenzije · Admin',
            loadComponent: () => import('./pages/admin/admin-reviews').then((m) => m.AdminReviews),
          },
          {
            path: 'korisnici',
            title: 'Korisnici · Admin',
            loadComponent: () => import('./pages/admin/admin-users').then((m) => m.AdminUsers),
          },
          {
            path: 'sifarnici',
            title: 'Šifarnici · Admin',
            loadComponent: () => import('./pages/admin/admin-lookups').then((m) => m.AdminLookups),
          },
        ],
      },
      {
        path: 'profil',
        canActivate: [authGuard],
        title: 'Profil',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
      {
        path: '**',
        title: 'Stranica nije pronađena',
        loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
