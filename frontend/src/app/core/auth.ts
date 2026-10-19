import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { SKIP_ERROR_TOAST, apiErrorMessage } from './api';
import {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  ProfileUpdateRequest,
  RegisterRequest,
  User,
  UserRole,
} from './models';
import { ToastService } from '../shared/ui/toast';

const STORAGE_KEY = 'planiraj.auth';

interface StoredSession {
  token: string;
  expiresAt: string;
  user: User;
}

/** Sesija prijavljenog korisnika (JWT u localStorage-u, stanje u signalima). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly url = `${environment.apiUrl}/auth`;

  private readonly session = signal<StoredSession | null>(readSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly role = computed(() => this.user()?.role ?? null);

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.url}/login`, request).pipe(tap((r) => this.store(r)));
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.url}/register`, request).pipe(tap((r) => this.store(r)));
  }

  refreshMe(): Observable<User> {
    return this.http.get<User>(`${this.url}/me`).pipe(tap((user) => this.patchUser(user)));
  }

  updateProfile(request: ProfileUpdateRequest): Observable<User> {
    return this.http.put<User>(`${this.url}/me`, request).pipe(tap((user) => this.patchUser(user)));
  }

  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.url}/change-password`, request).pipe(
      tap(() => {
        const user = this.user();
        if (user) this.patchUser({ ...user, mustChangePassword: false });
      }),
    );
  }

  logout(redirect = true): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage nedostupan: sesija ostaje samo u memoriji */
    }
    if (redirect) void this.router.navigateByUrl('/prijava');
  }

  hasRole(...roles: UserRole[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  /** Početna stranica zavisno od uloge. */
  homeUrl(): string {
    switch (this.role()) {
      case 'Admin':
        return '/admin';
      case 'Vendor':
        return '/salon';
      case 'Couple':
        return '/istrazi';
      default:
        return '/';
    }
  }

  private store(response: AuthResponse): void {
    this.persist({ token: response.token, expiresAt: response.expiresAt, user: response.user });
  }

  private patchUser(user: User): void {
    const current = this.session();
    if (current) this.persist({ ...current, user });
  }

  private persist(session: StoredSession): void {
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* storage nedostupan */
    }
  }
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** Dodaje JWT, odjavljuje na 401 i prikazuje greške kao toast (osim kad zahtjev to isključi). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toasts = inject(ToastService);
  const token = auth.token();

  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/register');
        if (error.status === 401 && !isAuthCall) {
          auth.logout();
          toasts.info('Sesija je istekla. Prijavite se ponovo.');
        } else if (!req.context.get(SKIP_ERROR_TOAST)) {
          toasts.error(apiErrorMessage(error));
        }
      }
      return throwError(() => error);
    }),
  );
};

// ---------- Guardovi ----------

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return router.createUrlTree(['/prijava'], { queryParams: { povratak: state.url } });
  // FR-3: nalog koji je kreirao administrator prvo mijenja lozinku.
  if (auth.user()?.mustChangePassword && state.url !== '/promjena-lozinke')
    return router.createUrlTree(['/promjena-lozinke']);
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

export function roleGuard(...roles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    return auth.hasRole(...roles) ? true : inject(Router).parseUrl(auth.homeUrl());
  };
}
