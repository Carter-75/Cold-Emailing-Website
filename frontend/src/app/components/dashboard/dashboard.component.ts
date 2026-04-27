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

    // Create a dynamic grid of moving points
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 w-full h-full opacity-30';
    el.appendChild(canvas);
    
    const ctx = canvas.getContext('2d')!;
    let w = canvas.width = el.clientWidth;
    let h = canvas.height = el.clientHeight;

    const points: any[] = [];
    for(let i=0; i<40; i++) {
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2 + 1
      });
    }

    const animate = () => {
      if (!document.contains(canvas)) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(79, 70, 229, 0.1)';
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
          if (dist < 150) {
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

    window.addEventListener('resize', () => {
      w = canvas.width = el.clientWidth;
      h = canvas.height = el.clientHeight;
    });
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

    if (cards.length > 0) {
      tl.from(cards, { 
        y: 50, 
        opacity: 0, 
        stagger: 0.1,
        clearProps: 'all' 
      }, '-=1');
    }
  }
}
