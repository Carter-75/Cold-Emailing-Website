import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { SocialAuthService, GoogleLoginProvider } from '@abacritt/angularx-social-login';

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

    // Listen to Google Identity Services state changes
    this.socialAuthService.authState.subscribe((socialUser) => {
      if (socialUser && socialUser.idToken) {
        this.verifyGoogleToken(socialUser.idToken);
      }
    });
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

  // Used if custom button is used instead of <asl-google-signin-button>
  // However, modern GSI recommends rendering the button directly in HTML.
  loginWithGoogle() {
    this.socialAuthService.signIn(GoogleLoginProvider.PROVIDER_ID).catch(err => console.error(err));
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
