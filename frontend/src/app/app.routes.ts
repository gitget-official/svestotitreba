import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth';

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
