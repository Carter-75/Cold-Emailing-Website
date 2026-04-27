import { Component, signal, inject, OnInit, viewChild, ElementRef, afterNextRender, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { OutreachService } from '../../services/outreach.service';
import { BillingService } from '../../services/billing.service';
import * as Matter from 'matter-js';
import anime from 'animejs';
import { LucideAngularModule } from 'lucide-angular';
import { gsap } from 'gsap';

import { OverviewComponent } from './overview/overview.component';
import { LeadsComponent } from './leads/leads.component';
import { InfrastructureComponent } from './infrastructure/infrastructure.component';
import { IdentityComponent } from './identity/identity.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    LucideAngularModule,
    OverviewComponent,
    LeadsComponent,
    InfrastructureComponent,
    IdentityComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  outreach = inject(OutreachService);
  billing = inject(BillingService);
  
  activeTab = signal<'overview' | 'leads' | 'infra' | 'identity' | 'billing'>('overview');
  leads = signal<any[]>([]);
  tourStep = signal<number | null>(null); // null means no tour active
  
  startTour() {
    this.activeTab.set('overview');
    this.tourStep.set(1);
    this.animateTourStep();
  }

  nextTourStep() {
    const next = (this.tourStep() || 0) + 1;
    if (next > 5) {
      this.tourStep.set(null);
      localStorage.setItem('tour_seen', 'true');
    } else {
      if (next === 3) this.activeTab.set('infra');
      if (next === 4) this.activeTab.set('identity');
      this.tourStep.set(next);
      this.animateTourStep();
    }
  }

  skipTour() {
    this.tourStep.set(null);
    localStorage.setItem('tour_seen', 'true');
  }

  private animateTourStep() {
    setTimeout(() => {
      anime({
        targets: '.tour-highlight',
        scale: [0.9, 1.05, 1],
        opacity: [0, 1],
        duration: 800,
        easing: 'easeOutElastic(1, .8)'
      });
    }, 100);
  }
  authMode = signal<'login' | 'signup'>('login');
  credentials = { email: '', password: '', displayName: '' };
  authError = signal<string | null>(null);

  scrollToLogin() {
    const el = document.getElementById('login-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Advanced Config state
  config = {
    // API Keys
    openaiKey: '',
    serpapiKey: '',
    apolloKey: '',
    verifaliaKey: '',
    
    // SMTP/IMAP
    senderEmail: '',
    appPassword: '',
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: '',
    imapPort: 993,
    
    // Personalization
    senderName: '',
    senderTitle: '',
    companyName: '',
    companyDesc: '',
    serviceDesc: '',
    valueProp: '',
    targetOutcome: '',
    websiteUrl: '',
    physicalAddress: '',
    
    // Persona / AI Spot
    personaContext: '',
    signature: '',
    priceTier1: '',
    priceTier2: '',
    priceTier3: '',
    
    // Logic
    dailyLeadLimit: 3,
    outreachEnabled: false,
    testRecipientEmail: ''
  };

  private sceneContainer = viewChild<ElementRef<HTMLDivElement>>('scene');
  private engine?: Matter.Engine;
  private render?: Matter.Render;
  private physicsInterval: any;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user?.config) {
        this.config = { ...this.config, ...user.config };
        this.outreach.status.set(user.config.outreachEnabled ? 'running' : 'stopped');
      }
    });

    effect(() => {
      if (this.auth.isAuthenticated()) {
        // Wait for DOM to catch up with signal
        setTimeout(() => {
          this.initBackgroundMotion();
          this.animateEntrance();
        }, 100);
      }
    });
  }

  ngOnInit() {
    const user = this.auth.user();
    if (user && user.config) {
      this.config = { ...this.config, ...user.config };
    }
    this.checkUnsubStatus();
    this.fetchLeads();

    // Auto-start tour if not seen
    const tourSeen = localStorage.getItem('tour_seen');
    if (!tourSeen) {
      setTimeout(() => this.startTour(), 1500); // Wait for animations to settle
    }
  }

  fetchLeads() {
    this.outreach.getLeads().subscribe(leads => {
      this.leads.set(leads.map(l => ({ ...l, isExpanded: false })));
    });
  }

  setTab(tab: 'overview' | 'leads' | 'infra' | 'identity' | 'billing') {
    const container = document.getElementById('tab-content-container');
    if (container) {
      gsap.to(container, {
        opacity: 0,
        y: 20,
        duration: 0.2,
        onComplete: () => {
          this.activeTab.set(tab);
          if (tab === 'leads') this.fetchLeads();
          
          setTimeout(() => {
            gsap.to(container, {
              opacity: 1,
              y: 0,
              duration: 0.4,
              ease: 'power2.out'
            });
          }, 50);
        }
      });
    } else {
      this.activeTab.set(tab);
      if (tab === 'leads') this.fetchLeads();
    }
  }

  onAuthSubmit() {
    this.authError.set(null);
    const obs = this.authMode() === 'login' 
      ? this.auth.login(this.credentials) 
      : this.auth.signup(this.credentials);

    obs.subscribe({
      next: () => {
        this.credentials = { email: '', password: '', displayName: '' };
      },
      error: (err) => {
        this.authError.set(err.error?.message || 'Authentication failed');
      }
    });
  }

  loginWithGoogle() {
    this.auth.loginWithGoogle();
  }

  ngOnDestroy() {
    if (this.physicsInterval) clearInterval(this.physicsInterval);
    if (this.render) {
      Matter.Render.stop(this.render);
      if (this.render.canvas.parentNode) {
        this.render.canvas.parentNode.removeChild(this.render.canvas);
      }
    }
    if (this.engine) Matter.Engine.clear(this.engine);
  }

  saveConfig() {
    this.outreach.saveConfig(this.config).subscribe((res: any) => {
      if (res && res.token) localStorage.setItem('auth_token', res.token);
      alert('Configuration saved and engine optimized!');
      this.auth.checkAuth(); // Refresh user data
    });
  }

  toggleOutreach() {
    if (this.outreach.status() === 'stopped' || this.outreach.status() === 'paused') {
      this.outreach.startOutreach().subscribe((res: any) => {
        if (res && res.token) localStorage.setItem('auth_token', res.token);
      });
    } else {
      this.outreach.stopOutreach().subscribe((res: any) => {
        if (res && res.token) localStorage.setItem('auth_token', res.token);
      });
    }
  }

  isUnsubscribed = signal<boolean>(false);

  sendTestEmail() {
    this.outreach.sendTestEmail().subscribe({
      next: (res: any) => {
        alert(res.message);
        this.checkUnsubStatus();
      },
      error: (err) => {
        alert('Test failed: ' + (err.error?.message || err.message));
        this.checkUnsubStatus();
      }
    });
  }

  checkUnsubStatus() {
    this.outreach.getUnsubStatus().subscribe(res => {
      this.isUnsubscribed.set(res.isUnsubscribed);
    });
  }

  clearUnsub() {
    this.outreach.clearUnsub().subscribe(res => {
      alert(res.message);
      this.checkUnsubStatus();
    });
  }

  upgradeAccount() {
    this.billing.createCheckoutSession().subscribe({
      next: (res) => {
        if (res.url) window.location.href = res.url;
      },
      error: (err) => alert('Billing error: ' + (err.error?.message || err.message))
    });
  }

  private initBackgroundMotion() {
    const el = this.sceneContainer()?.nativeElement;
    if (!el || el.getAttribute('data-motion-active')) return;
    el.setAttribute('data-motion-active', 'true');

    this.engine = Matter.Engine.create();
    this.engine.gravity.y = 0; // No gravity for floating effect

    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 w-full h-full opacity-60';
    canvas.style.zIndex = '-1';
    el.appendChild(canvas);
    
    const ctx = canvas.getContext('2d')!;
    let w = canvas.width = el.clientWidth;
    let h = canvas.height = el.clientHeight;

    const bodies: Matter.Body[] = [];
    const count = 35;
    
    for (let i = 0; i < count; i++) {
      const body = Matter.Bodies.circle(
        Math.random() * w,
        Math.random() * h,
        Math.random() * 3 + 1,
        {
          frictionAir: 0.02,
          restitution: 1,
          velocity: { x: (Math.random() - 0.5) * 1.5, y: (Math.random() - 0.5) * 1.5 },
          render: { fillStyle: 'rgba(139, 92, 246, 0.5)' } // accent-vibrant
        }
      );
      bodies.push(body);
    }

    Matter.Composite.add(this.engine.world, bodies);

    const animate = () => {
      if (!document.contains(canvas)) return;
      Matter.Engine.update(this.engine!, 1000 / 60);
      
      ctx.clearRect(0, 0, w, h);
      
      // Draw Connections
      ctx.lineWidth = 1;
      for (let i = 0; i < bodies.length; i++) {
        const b1 = bodies[i];
        
        // Bounce off walls manually since we don't have walls
        if (b1.position.x < 0 || b1.position.x > w) Matter.Body.setVelocity(b1, { x: -b1.velocity.x, y: b1.velocity.y });
        if (b1.position.y < 0 || b1.position.y > h) Matter.Body.setVelocity(b1, { x: b1.velocity.x, y: -b1.velocity.y });

        for (let j = i + 1; j < bodies.length; j++) {
          const b2 = bodies[j];
          const dist = Math.hypot(b1.position.x - b2.position.x, b1.position.y - b2.position.y);
          
          if (dist < 180) {
            const opacity = 1 - (dist / 180);
            ctx.strokeStyle = `rgba(30, 58, 138, ${opacity * 0.2})`; // accent-blue
            ctx.beginPath();
            ctx.moveTo(b1.position.x, b1.position.y);
            ctx.lineTo(b2.position.x, b2.position.y);
            ctx.stroke();
          }
        }

        // Draw Dot
        ctx.fillStyle = (b1.render as any).fillStyle;
        ctx.beginPath();
        ctx.arc(b1.position.x, b1.position.y, (b1 as any).circleRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      
      requestAnimationFrame(animate);
    };

    animate();

    const resize = () => {
      w = canvas.width = el.clientWidth;
      h = canvas.height = el.clientHeight;
    };
    resize();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(el);

    window.addEventListener('resize', resize);
  }

  private animateEntrance() {
    // Only animate if elements exist
    const aside = document.querySelector('aside');
    const header = document.querySelector('header');
    const cards = document.querySelectorAll('.glass-premium');

    if (!aside || !header) return;

    const tl = gsap.timeline({ defaults: { ease: 'power4.out', duration: 1.2 } });

    tl.from(aside, { x: -100, opacity: 0 })
      .from(header, { y: -50, opacity: 0 }, '-=0.8');

  }
}
