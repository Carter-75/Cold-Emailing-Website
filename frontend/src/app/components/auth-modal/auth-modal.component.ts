import { Component, inject, signal, viewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import anime from 'animejs/lib/anime.es.js';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="auth.showAuthModal()" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div (click)="close()" class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      
      <!-- Background Motion -->
      <div #motionContainer class="absolute inset-0 z-0 pointer-events-none opacity-40"></div>
      
      <!-- Modal Content -->
      <div class="auth-modal relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-charcoal/80 p-10 shadow-2xl backdrop-blur-2xl z-10">
        <div class="absolute -top-24 -right-24 w-48 h-48 bg-accent-blue/10 rounded-full blur-3xl"></div>
        
        <div class="mb-10 text-center relative z-10">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-purple text-2xl mb-6 shadow-xl shadow-accent-blue/20">
            ⚛️
          </div>
          <h2 class="text-4xl font-black tracking-tighter text-white uppercase italic">{{ isSignup() ? 'Join' : 'Welcome' }}</h2>
          <p class="mt-2 text-white/40 text-sm font-medium tracking-wide">Autonomous Outreach Engine v3.0</p>
        </div>

        <div class="space-y-6 relative z-10">
          <!-- Local Auth Form -->
          <div class="space-y-3">
            <div class="relative">
              <input [(ngModel)]="email" type="email" placeholder="Email Address" 
                     class="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-white placeholder-white/20 outline-none focus:border-accent-blue/50 transition-all">
            </div>
            
            <div class="relative">
              <input [(ngModel)]="password" type="password" placeholder="Password" 
                     class="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-white placeholder-white/20 outline-none focus:border-accent-blue/50 transition-all">
            </div>
            
            <button (click)="onSubmit()" 
                    [disabled]="loading()"
                    class="w-full rounded-2xl bg-gradient-to-r from-accent-blue to-accent-purple py-4 font-black text-xs uppercase tracking-[0.2em] text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-accent-blue/20">
              {{ loading() ? 'Initializing...' : (isSignup() ? 'Create Account' : 'Authorize Session') }}
            </button>
          </div>

          <div class="flex items-center gap-4 py-2">
            <div class="h-px flex-1 bg-white/5"></div>
            <span class="text-[10px] font-black uppercase tracking-widest text-white/20">or sync with</span>
            <div class="h-px flex-1 bg-white/5"></div>
          </div>

          <!-- Google Auth -->
          <button (click)="loginWithGoogle()" 
                  class="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/5 py-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/10">
            <svg class="h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google Infrastructure
          </button>
          
          <p *ngIf="error()" class="mt-4 text-center text-xs font-bold text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">{{ error() }}</p>

          <div class="mt-8 text-center">
            <button (click)="toggleMode()" class="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
              {{ isSignup() ? 'Already have credentials? Sign In' : "New Operator? Create Account" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .auth-modal {
      animation: modal-in 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modal-in {
      from { opacity: 0; transform: scale(0.95) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `]
})
export class AuthModalComponent {
  auth = inject(AuthService);
  
  isSignup = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);

  email = '';
  password = '';

  motionContainer = viewChild<ElementRef<HTMLDivElement>>('motionContainer');

  constructor() {
    effect(() => {
      if (this.auth.showAuthModal()) {
        setTimeout(() => this.initMotion(), 100);
      }
    });
  }

  private initMotion() {
    const el = this.motionContainer()?.nativeElement;
    if (!el || el.getAttribute('data-motion-active')) return;
    el.setAttribute('data-motion-active', 'true');

    const canvas = document.createElement('canvas');
    canvas.className = 'w-full h-full';
    el.appendChild(canvas);
    
    const ctx = canvas.getContext('2d')!;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const points: any[] = [];
    for(let i=0; i<30; i++) {
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1
      });
    }

    const animate = () => {
      if (!document.contains(canvas)) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(79, 70, 229, 0.15)';
      ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';

      points.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();

        for(let j=i+1; j<points.length; j++) {
          const p2 = points[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      });
      requestAnimationFrame(animate);
    };
    animate();
  }

  close() {
    this.auth.closeAuthModal();
  }

  toggleMode() {
    this.isSignup.set(!this.isSignup());
    this.error.set(null);
    
    anime({
      targets: '.auth-modal',
      scale: [0.98, 1],
      opacity: [0.8, 1],
      duration: 300,
      easing: 'easeOutElastic(1, .8)'
    });
  }

  loginWithGoogle() {
    this.auth.loginWithGoogle();
  }

  onSubmit() {
    if (!this.email || !this.password) {
      this.error.set('Please fill in all fields');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const action = this.isSignup() 
      ? this.auth.signup({ email: this.email, password: this.password })
      : this.auth.login({ email: this.email, password: this.password });

    action.subscribe({
      next: () => {
        this.loading.set(false);
        this.close();
        window.location.href = '/dashboard';
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Authentication failed');
      }
    });
  }
}
