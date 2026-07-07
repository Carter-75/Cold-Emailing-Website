import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = localStorage.getItem('auth_token');
  
  if (auth.isAuthenticated() || token) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
