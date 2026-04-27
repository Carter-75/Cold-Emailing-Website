import { Component, OnInit, inject, signal, viewChild, ElementRef, effect } from '@angular/core';
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
    <div class="relative min-h-screen w-full overflow-hidden bg-charcoal text-white selection:bg-accent-blue/30">
      <!-- Network Motion Background -->
      <div #motionContainer class="absolute inset-0 z-0 opacity-40 pointer-events-none"></div>
      
      <!-- Mesh Gradient Glows -->
      <div class="absolute inset-0 z-0">
        <app-mesh-gradient></app-mesh-gradient>
      </div>

      <!-- Navigation -->
      <nav class="fixed top-0 left-0 right-0 z-50 px-8 py-6 flex items-center justify-between backdrop-blur-md bg-black/10 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center text-xl shadow-lg shadow-accent-blue/20">⚛️</div>
          <span class="text-xl font-black uppercase tracking-tighter italic">Outreach.AI</span>
        </div>
        <div class="flex items-center gap-8">
          <button (click)="handleAction()" class="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Documentation</button>
          <button (click)="handleAction()" class="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">Pricing</button>
          <button (click)="handleAction()" class="btn-nav">
            {{ auth.isAuthenticated() ? 'Command Center' : 'Initialize Session' }}
          </button>
        </div>
      </nav>
      
      <!-- Hero Section -->
      <main class="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-32 text-center overflow-hidden">
        <div class="hero-content max-w-6xl opacity-0">
          <div class="mb-10 inline-flex items-center gap-2 rounded-full border border-accent-blue/20 bg-accent-blue/5 px-6 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-accent-blue backdrop-blur-xl animate-pulse">
            System Online: Phase 3 Stabilization Complete
          </div>
          
          <h1 class="mb-8 text-7xl font-black leading-[0.9] tracking-tighter md:text-[11rem] italic uppercase">
            Hyper <br/>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue via-white to-accent-purple">
              Velocity
            </span>
          </h1>
          
          <p class="mx-auto mb-16 max-w-2xl text-lg font-medium text-white/40 md:text-xl leading-relaxed tracking-wide">
            The world's first autonomous outreach engine that mimics human physics. 
            Connect with precision, scale with gravity.
          </p>
          
          <div class="flex flex-col items-center justify-center gap-8 sm:flex-row mb-32">
            <button (click)="handleAction()" 
                    class="btn-mega group">
              <span class="relative z-10">Start Optimization</span>
              <div class="absolute inset-0 bg-white group-hover:bg-accent-blue transition-colors duration-500"></div>
            </button>
            
            <button (click)="handleAction()" 
                    class="btn-mega-outline group">
              <span class="relative z-10">View Architecture</span>
            </button>
          </div>
        </div>

        <!-- Live Activity Tracker -->
        <div class="activity-strip opacity-0 translate-y-10 w-full max-w-4xl mx-auto mb-32">
          <div class="glass-premium p-6 flex items-center justify-between gap-8 border-accent-blue/10">
            <div class="flex items-center gap-4">
              <div class="w-2 h-2 rounded-full bg-green-500 animate-ping"></div>
              <span class="text-[10px] font-black uppercase tracking-widest text-white/60">Live Engine Pulse</span>
            </div>
            <div class="flex gap-12 overflow-hidden whitespace-nowrap">
              <div *ngFor="let m of messages" class="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                <span class="text-accent-blue">#</span> {{ m }}
              </div>
            </div>
          </div>
        </div>

        <!-- Tech Cards -->
        <div class="features-grid grid max-w-7xl gap-10 opacity-0 md:grid-cols-3 mb-40">
          <div *ngFor="let f of features; let i = index" (click)="handleAction()" 
               class="feature-card group" [ngClass]="'delay-' + (i * 200)" style="animation: float 6s ease-in-out infinite" [style.animation-delay]="i * 0.5 + 's'">
            <div class="card-inner">
              <div class="mb-10 text-6xl transform group-hover:scale-110 transition-transform duration-700">{{ f.icon }}</div>
              <h3 class="mb-6 text-3xl font-black tracking-tighter uppercase italic">{{ f.title }}</h3>
              <p class="text-sm font-medium leading-relaxed text-white/30 group-hover:text-white/60 transition-colors tracking-wide">{{ f.desc }}</p>
              
              <div class="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-[0.2em] text-accent-blue">Active Deployment</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white/20 group-hover:text-accent-blue transition-colors" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </div>
            </div>
            <div class="absolute inset-0 bg-gradient-to-br from-accent-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          </div>
        </div>
      </main>

      <!-- Glass Footer -->
      <footer class="relative z-10 border-t border-white/5 bg-black/20 py-20 text-center backdrop-blur-2xl">
        <div class="max-w-4xl mx-auto px-6">
          <div class="text-5xl font-black uppercase tracking-tighter italic mb-8 opacity-20">Outreach.AI</div>
          <p class="text-[10px] font-black uppercase tracking-[0.5em] text-white/10 mb-12">Authorized Personnel Only. Systems monitored for integrity.</p>
          <div class="flex justify-center gap-10">
            <a href="#" class="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-accent-blue transition-colors">Privacy Protocal</a>
            <a href="#" class="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-accent-blue transition-colors">Terms of Engagement</a>
            <a href="#" class="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-accent-blue transition-colors">Security Audit</a>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .btn-nav {
      @apply px-6 py-2 rounded-xl bg-white text-charcoal text-[10px] font-black uppercase tracking-widest hover:bg-accent-blue hover:text-white transition-all active:scale-95;
    }
    .btn-mega {
      @apply relative px-12 py-6 rounded-2xl overflow-hidden text-charcoal text-xs font-black uppercase tracking-[0.3em] transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-white/5;
    }
    .btn-mega-outline {
      @apply relative px-12 py-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-white text-xs font-black uppercase tracking-[0.3em] transition-all hover:bg-white/10 active:scale-95 hover:border-white/20;
    }
    .feature-card {
      @apply relative overflow-hidden rounded-[3rem] border border-white/5 bg-white/[0.02] backdrop-blur-md transition-all duration-700 cursor-pointer text-left hover:-translate-y-2;
    }
    .card-inner {
      @apply relative z-10 p-12;
    }
    .glass-premium {
      @apply bg-white/[0.03] backdrop-blur-3xl border border-white/5 rounded-3xl shadow-2xl;
    }
  `]
})
export class HomeComponent implements OnInit {
  auth = inject(AuthService);
  router = inject(Router);
  motionContainer = viewChild<ElementRef<HTMLDivElement>>('motionContainer');

  features = [
    { icon: '🎯', title: 'Dynamic Targeting', desc: 'Real-time signal processing to identify high-velocity leads before the competition.' },
    { icon: '⚛️', title: 'Neural Response', desc: 'AI engines that generate context-aware messaging with a 98% human-mimicry score.' },
    { icon: '🚀', title: 'Auto Sequence', desc: 'Gravitational follow-up loops that ensure your message reaches escape velocity.' }
  ];

  messages = [
    'Lead Identified: SpaceX',
    'Enriching Metadata...',
    'Email Verified: SUCCESS',
    'Sequence Step 1: ENGAGED',
    'AI Response Optimized',
    'Deployment Status: STABLE'
  ];

  constructor() {
    afterNextRender(() => {
      this.initMotion();
      this.animateContent();
    });
  }

  ngOnInit() {}

  private initMotion() {
    const el = this.motionContainer()?.nativeElement;
    if (!el) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'w-full h-full';
    el.appendChild(canvas);
    
    const ctx = canvas.getContext('2d')!;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const points: any[] = [];
    for(let i=0; i<60; i++) {
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 1
      });
    }

    const animate = () => {
      if (!document.contains(canvas)) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(79, 70, 229, 0.1)';
      ctx.fillStyle = 'rgba(79, 70, 229, 0.2)';

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
          if (dist < 200) {
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

  handleAction() {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    } else {
      this.auth.openAuthModal();
    }
  }

  private animateContent() {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out', duration: 1.5 } });

    tl.to('.hero-content', {
      opacity: 1,
      y: 0,
      startAt: { y: 60 }
    })
    .to('.activity-strip', {
      opacity: 1,
      y: 0,
      startAt: { y: 40 }
    }, '-=1')
    .to('.features-grid', {
      opacity: 1,
      y: 0,
      stagger: 0.2,
      startAt: { y: 60 }
    }, '-=1');
  }
}

import { afterNextRender } from '@angular/core';
