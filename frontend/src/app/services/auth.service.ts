import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { SocialAuthService, GoogleLoginProvider } from '@abacritt/angularx-social-login';
import { tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);
  private socialAuthService = inject(SocialAuthService);
  
  user = signal<any>(null);
  isAuthenticated = signal<boolean>(false);

  constructor() {
    this.checkAuth();
    this.handleUrlToken();

    // Legacy: Still listening to socialAuthService for potential popup usage
    this.socialAuthService.authState.subscribe((socialUser) => {
      if (socialUser && socialUser.idToken) {
        this.verifyGoogleToken(socialUser.idToken);
      }
    });
  }

  // Handle token passed via URL query (Google Redirect Flow)
  private handleUrlToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      localStorage.setItem('auth_token', token);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      this.checkAuth();
    }
  }

  // Local Login
  login(credentials: any) {
    return this.api.postData<any>('auth/login', credentials).pipe(
      tap(res => {
        if (res.token) {
          localStorage.setItem('auth_token', res.token);
          this.user.set(res.user);
          this.isAuthenticated.set(true);
        }
      })
    );
  }

  // Local Signup
  signup(data: any) {
    return this.api.postData<any>('auth/signup', data).pipe(
      tap(res => {
        if (res.token) {
          localStorage.setItem('auth_token', res.token);
          this.user.set(res.user);
          this.isAuthenticated.set(true);
        }
      })
    );
  }

  // Trigger Google Redirect
  loginWithGoogle() {
    window.location.href = `${this.api.apiUrl}/auth/google`;
  }

  // Attempt to load current user from local token
  checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      this.user.set(null);
      this.isAuthenticated.set(false);
      return;
    }

    this.api.getData<any>('auth/user').subscribe({
      next: (user) => {
        this.user.set(user);
        this.isAuthenticated.set(true);
      },
      error: () => {
        // Token is invalid or expired
        this.logoutLocal();
      }
    });
  }

  // Verify token securely on backend
  private verifyGoogleToken(idToken: string) {
    this.api.postData<any>('auth/google/verify', { idToken }).subscribe({
      next: (res) => {
        if (res.token) {
          localStorage.setItem('auth_token', res.token);
          this.user.set(res.user);
          this.isAuthenticated.set(true);
        }
      },
      error: (err) => {
        console.error('Failed to verify Google token', err);
        this.logoutLocal();
      }
    });
  }

  logout() {
    this.logoutLocal();
    // Optional backend logout if needed (but JWT is mostly stateless locally)
  }

  private logoutLocal() {
    localStorage.removeItem('auth_token');
    this.user.set(null);
    this.isAuthenticated.set(false);
    this.socialAuthService.signOut().catch(() => {});
  }
}
