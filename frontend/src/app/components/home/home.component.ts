import { Component, OnInit, inject, signal, viewChild, ElementRef, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { MeshGradientComponent } from '../shared/mesh-gradient/mesh-gradient.component';
import anime from 'animejs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MeshGradientComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
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
    const timeline = anime.timeline({
      easing: 'easeOutQuart',
      duration: 1200
    });

    timeline
      .add({
        targets: '.hero-content',
        opacity: [0, 1],
        translateY: [40, 0],
        delay: 300
      })
      .add({
        targets: '.activity-strip .activity-item',
        opacity: [0, 1],
        translateY: [20, 0],
        delay: anime.stagger(100),
      }, '-=800')
      .add({
        targets: '.feature-card',
        opacity: [0, 1],
        translateY: [30, 0],
        scale: [0.95, 1],
        delay: anime.stagger(150),
      }, '-=600');
  }
}
