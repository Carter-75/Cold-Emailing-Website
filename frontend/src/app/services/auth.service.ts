import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  
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
    // Redirect to backend auth
    const baseUrl = (this.api as any).apiUrl.replace('/api', '');
    window.location.href = `${baseUrl}/api/auth/google`;
  }

  logout() {
    this.api.getData<any>('auth/logout').subscribe(() => {
      this.user.set(null);
      this.isAuthenticated.set(false);
      window.location.reload();
    });
  }
}
