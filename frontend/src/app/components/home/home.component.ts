import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { MeshGradientComponent } from '../shared/mesh-gradient/mesh-gradient.component';
import { gsap } from 'gsap';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MeshGradientComponent],
  template: `
    <div class="relative min-h-screen w-full overflow-hidden bg-charcoal text-white">
      <!-- Stripe-Inspired Animated Background -->
      <div class="absolute inset-0 z-0">
        <app-mesh-gradient></app-mesh-gradient>
      </div>
      
      <!-- Hero Section -->
      <main class="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center">
        <div class="hero-content max-w-5xl opacity-0">
          <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-accent-vibrant backdrop-blur-md">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-vibrant opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-accent-vibrant"></span>
            </span>
            Next-Gen Outreach Engine
          </div>
          
          <h1 class="mb-8 text-7xl font-black leading-[1.1] tracking-tighter md:text-9xl">
            Automate Your <br/>
            <span class="text-gradient-stripe">
              Networking Physics
            </span>
          </h1>
          
          <p class="mx-auto mb-12 max-w-2xl text-xl font-medium text-white/50 md:text-2xl">
            Scale personalized outreach with gravitational precision. <br class="hidden md:block"/>
            The platform that turns cold emails into high-velocity connections.
          </p>
          
          <div class="flex flex-col items-center justify-center gap-6 sm:flex-row">
            <button (click)="handleAction()" 
                    class="btn-premium group bg-white text-charcoal hover:bg-white/90">
              <span class="relative z-10 flex items-center gap-2">
                Get Started Free
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transition-transform group-hover:translate-x-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </span>
            </button>
            
            <button (click)="handleAction()" 
                    class="btn-premium border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10">
              View Showcase
            </button>
          </div>
        </div>

        <!-- Floating Feature Cards -->
        <div class="features-grid mt-32 grid max-w-6xl gap-8 opacity-0 sm:grid-cols-3">
          <div *ngFor="let f of features" (click)="handleAction()" 
               class="group relative cursor-pointer overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 transition-all hover:border-accent-purple/30 hover:bg-white/[0.05]">
            <div class="absolute -right-4 -top-4 text-8xl opacity-10 transition-transform group-hover:scale-110 group-hover:opacity-20">{{ f.icon }}</div>
            <div class="relative z-10">
              <div class="mb-6 text-4xl">{{ f.icon }}</div>
              <h3 class="mb-4 text-2xl font-black tracking-tight">{{ f.title }}</h3>
              <p class="text-lg leading-relaxed text-white/40 group-hover:text-white/60 transition-colors">{{ f.desc }}</p>
            </div>
          </div>
        </div>
      </main>

      <!-- Glass Footer -->
      <footer class="relative z-10 border-t border-white/5 bg-charcoal/40 py-12 text-center backdrop-blur-md">
        <p class="text-sm font-bold uppercase tracking-widest text-white/20">© 2024 Networking Physics Engine. Built for Hyper-Growth.</p>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class HomeComponent implements OnInit {
  auth = inject(AuthService);
  router = inject(Router);

  features = [
    { icon: '🎯', title: 'Gravitational Target', desc: 'Auto-find high-intent leads using real-time search signals.' },
    { icon: '⚛️', title: 'Atomic Personalization', desc: 'AI-driven messaging that feels human-to-human.' },
    { icon: '🚀', title: 'Escape Velocity', desc: 'Automated follow-ups that break through the noise.' }
  ];

  ngOnInit() {
    this.animateContent();
  }

  handleAction() {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    } else {
      this.auth.openAuthModal();
    }
  }

  private animateContent() {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    tl.to('.hero-content', {
      opacity: 1,
      y: 0,
      duration: 1.5,
      delay: 0.5,
      startAt: { y: 40 }
    })
    .to('.features-grid', {
      opacity: 1,
      y: 0,
      duration: 1,
      startAt: { y: 20 }
    }, '-=1');
  }
}
