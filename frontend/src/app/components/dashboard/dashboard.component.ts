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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    LucideAngularModule
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

    afterNextRender(() => {
      this.initBackgroundMotion();
      this.animateEntrance();
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
    this.activeTab.set(tab);
    if (tab === 'leads') {
      this.fetchLeads();
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
    if (!el) return;

    // Create floating orbs or lines
    for (let i = 0; i < 5; i++) {
      const orb = document.createElement('div');
      orb.className = 'absolute rounded-full blur-[100px] opacity-20 pointer-events-none';
      orb.style.width = `${Math.random() * 400 + 200}px`;
      orb.style.height = orb.style.width;
      orb.style.background = i % 2 === 0 ? 'var(--accent-blue)' : 'var(--accent-purple)';
      el.appendChild(orb);

      gsap.to(orb, {
        x: 'random(-100, 100)%',
        y: 'random(-100, 100)%',
        duration: 'random(10, 20)',
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    }
  }

  private animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out', duration: 1.2 } });

    tl.from('aside', { x: -100, opacity: 0 })
      .from('header', { y: -50, opacity: 0 }, '-=0.8')
      .from('.glass-premium', { 
        y: 50, 
        opacity: 0, 
        stagger: 0.1,
        clearProps: 'all' 
      }, '-=1');
  }
}
