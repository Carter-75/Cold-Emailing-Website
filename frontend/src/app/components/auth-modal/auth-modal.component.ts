import { Component, inject, signal, viewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import anime from 'animejs/lib/anime.es.js';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.css'
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
