import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  auth = inject(AuthService);
  router = inject(Router);

  authMode = signal<'login' | 'signup'>('login');
  authError = signal<string | null>(null);
  
  credentials = {
    email: '',
    password: '',
    displayName: ''
  };

  marketNiches = [
    'SaaS Growth', 'Agency Scaling', 'Selling Apps', 'B2B Sales', 'Recruiting', 'Startups'
  ];
  currentNicheIndex = signal(0);
  private wordInterval: any;

  ngOnInit() {
    this.wordInterval = setInterval(() => {
      this.currentNicheIndex.update(i => (i + 1) % this.marketNiches.length);
    }, 2500);
  }

  ngOnDestroy() {
    if (this.wordInterval) clearInterval(this.wordInterval);
  }

  onAuthSubmit() {
    this.authError.set(null);
    const obs = this.authMode() === 'login' 
      ? this.auth.login(this.credentials) 
      : this.auth.signup(this.credentials);

    obs.subscribe({
      next: () => {
        this.credentials = { email: '', password: '', displayName: '' };
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.authError.set(err.error?.message || 'Authentication failed');
      }
    });
  }

  loginWithGoogle() {
    this.auth.loginWithGoogle();
  }
}
