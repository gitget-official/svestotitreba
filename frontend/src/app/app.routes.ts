import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    title: 'Planiraj — sve za vaše vjenčanje',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'prijava',
    canActivate: [guestGuard],
    title: 'Prijava · Planiraj',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.Login),
  },
  {
    path: 'registracija',
    canActivate: [guestGuard],
    title: 'Registracija · Planiraj',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.Register),
  },
  {
    path: 'promjena-lozinke',
    canActivate: [authGuard],
    title: 'Nova lozinka · Planiraj',
    loadComponent: () => import('./pages/auth/auth-pages').then((m) => m.ChangePassword),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: 'istrazi',
        title: 'Istraži · Planiraj',
        loadComponent: () => import('./pages/explore/explore').then((m) => m.Explore),
      },
      {
        path: 'ponudjaci/:id',
        title: 'Ponuđač · Planiraj',
        loadComponent: () => import('./pages/vendor-detail/vendor-detail').then((m) => m.VendorDetail),
      },
      {
        path: 'moje-rezervacije',
        canActivate: [roleGuard('Couple')],
        title: 'Moje rezervacije · Planiraj',
        loadComponent: () => import('./pages/my/my-pages').then((m) => m.MyBookings),
      },
      {
        path: 'moje-recenzije',
        canActivate: [roleGuard('Couple')],
        title: 'Moje recenzije · Planiraj',
        loadComponent: () => import('./pages/my/my-pages').then((m) => m.MyReviews),
      },
      {
        path: 'salon',
        canActivate: [roleGuard('Vendor')],
        children: [
          {
            path: '',
            title: 'Moj salon · Planiraj',
            loadComponent: () => import('./pages/salon/salon-home').then((m) => m.SalonHome),
          },
          {
            path: 'rezervacije',
            title: 'Rezervacije · Planiraj',
            loadComponent: () => import('./pages/salon/salon-bookings').then((m) => m.SalonBookings),
          },
          {
            path: ':id',
            title: 'Uređivanje salona · Planiraj',
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
        title: 'Profil · Planiraj',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'planiranje',
        title: 'Planiranje vjenčanja · Planiraj',
        loadComponent: () => import('./pages/planning/planning').then((m) => m.Planning),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
