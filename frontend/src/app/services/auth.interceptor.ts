import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('auth_token');
  const isApi = req.url.includes('/api');
  const router = inject(Router);
  const injector = inject(Injector);
  
  console.log(`[Interceptor] Request: ${req.method} ${req.url} | Token Found: ${!!token} | Is API: ${isApi}`);

  let modifiedReq = req;
  if (token && isApi) {
    modifiedReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  
  return next(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 || error.status === 403) {
        console.warn('[Interceptor] Auth error (401/403). Logging out.');
        localStorage.removeItem('auth_token');
        try {
          const auth = injector.get(AuthService);
          auth.user.set(null);
          auth.isAuthenticated.set(false);
        } catch (e) {
          console.warn('[Interceptor] Could not invoke AuthService', e);
        }
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
