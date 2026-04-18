import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);
  
  user = signal<any>(null);
  isAuthenticated = signal<boolean>(false);

  constructor() {
    this.checkAuth();
  }

  checkAuth() {
    this.api.getData<any>('auth/user').subscribe({
      next: (user) => {
        this.user.set(user);
        this.isAuthenticated.set(true);
      },
      error: () => {
        this.user.set(null);
        this.isAuthenticated.set(false);
      }
    });
  }

  loginWithGoogle() {
    window.location.assign('/api/auth/google');
  }

  logout() {
    this.api.getData<any>('auth/logout').subscribe(() => {
      this.user.set(null);
      this.isAuthenticated.set(false);
      window.location.reload();
    });
  }
}
