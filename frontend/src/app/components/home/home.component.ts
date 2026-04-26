import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import * as Matter from 'matter-js';
import anime from 'animejs/lib/anime.es.js';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative min-h-screen w-full overflow-hidden bg-[#050505] text-white">
      <!-- Matter.js Background -->
      <div #canvasContainer class="absolute inset-0 z-0 opacity-40"></div>
      
      <!-- Hero Section -->
      <main class="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div class="hero-content max-w-4xl opacity-0 translate-y-10">
          <span class="mb-4 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-400">
            Next-Gen Outreach Engine
          </span>
          
          <h1 class="mb-6 text-6xl font-black leading-tight tracking-tight md:text-8xl">
            Automate Your <br/>
            <span class="bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-600 bg-clip-text text-transparent">
              Networking Physics
            </span>
          </h1>
          
          <p class="mb-10 text-xl text-white/60 md:text-2xl">
            Scale your personalized outreach with gravitational precision. <br class="hidden md:block"/>
            The only tool that turns cold emails into warm connections.
          </p>
          
          <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button (click)="handleAction()" 
                    class="group relative overflow-hidden rounded-full bg-blue-600 px-8 py-4 text-lg font-bold transition-all hover:bg-blue-500 active:scale-95">
              <span class="relative z-10">Get Started Free</span>
              <div class="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform group-hover:translate-x-full duration-1000"></div>
            </button>
            
            <button (click)="handleAction()" 
                    class="rounded-full border border-white/10 bg-white/5 px-8 py-4 text-lg font-bold backdrop-blur-sm transition-all hover:bg-white/10">
              View Showcase
            </button>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="features-grid mt-24 grid max-w-6xl gap-6 opacity-0 sm:grid-cols-3">
          <div *ngFor="let f of features" (click)="handleAction()" 
               class="group cursor-pointer rounded-2xl border border-white/5 bg-white/[0.02] p-8 transition-all hover:border-blue-500/30 hover:bg-white/[0.05]">
            <div class="mb-4 text-3xl">{{ f.icon }}</div>
            <h3 class="mb-2 text-xl font-bold">{{ f.title }}</h3>
            <p class="text-sm text-white/50">{{ f.desc }}</p>
          </div>
        </div>
      </main>

      <!-- Glass Footer -->
      <footer class="relative z-10 border-t border-white/5 bg-white/[0.02] py-8 text-center text-white/40 backdrop-blur-md">
        <p>© 2024 Networking Physics Engine. Built for Hyper-Growth.</p>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }
    canvas { pointer-events: none; }
  `]
})
export class HomeComponent implements OnInit {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;
  
  auth = inject(AuthService);
  router = inject(Router);

  features = [
    { icon: '🎯', title: 'Gravitational Target', desc: 'Auto-find high-intent leads using real-time search signals.' },
    { icon: '⚛️', title: 'Atomic Personalization', desc: 'AI-driven messaging that feels human-to-human.' },
    { icon: '🚀', title: 'Escape Velocity', desc: 'Automated follow-ups that break through the noise.' }
  ];

  ngOnInit() {
    this.initPhysics();
    this.animateContent();
  }

  handleAction() {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    } else {
      this.auth.openAuthModal();
    }
  }

  private initPhysics() {
    const { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint } = Matter;
    
    const engine = Engine.create();
    const world = engine.world;

    const render = Render.create({
      element: this.canvasContainer.nativeElement,
      engine: engine,
      options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: 'transparent'
      }
    });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    // Add boundaries
    const ground = Bodies.rectangle(window.innerWidth/2, window.innerHeight + 50, window.innerWidth, 100, { isStatic: true });
    const wallLeft = Bodies.rectangle(-50, window.innerHeight/2, 100, window.innerHeight, { isStatic: true });
    const wallRight = Bodies.rectangle(window.innerWidth + 50, window.innerHeight/2, 100, window.innerHeight, { isStatic: true });
    
    Composite.add(world, [ground, wallLeft, wallRight]);

    // Add floating "Email" particles
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * -500;
      const particle = Bodies.circle(x, y, Math.random() * 20 + 10, {
        restitution: 0.8,
        friction: 0.1,
        render: {
          fillStyle: Math.random() > 0.5 ? '#3b82f633' : '#8b5cf633',
          strokeStyle: '#ffffff22',
          lineWidth: 1
        }
      });
      Composite.add(world, particle);
    }

    // Interactive mouse
    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: { visible: false }
      }
    });

    Composite.add(world, mouseConstraint);
  }

  private animateContent() {
    anime.timeline({
      easing: 'easeOutExpo',
    })
    .add({
      targets: '.hero-content',
      opacity: [0, 1],
      translateY: [40, 0],
      duration: 1200,
      delay: 500
    })
    .add({
      targets: '.features-grid',
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 800,
      offset: '-=600'
    });
  }
}
