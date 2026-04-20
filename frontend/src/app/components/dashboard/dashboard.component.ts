import { Component, signal, inject, OnInit, viewChild, ElementRef, afterNextRender, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { OutreachService } from '../../services/outreach.service';
import { GoogleSigninButtonModule } from '@abacritt/angularx-social-login';
import * as Matter from 'matter-js';
import anime from 'animejs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, GoogleSigninButtonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  outreach = inject(OutreachService);
  
  activeTab = signal<'overview' | 'infra' | 'identity'>('overview');

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
    testModeActive: false,
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
      this.initPhysics();
      this.animateHeader();
    });
  }

  ngOnInit() {
    const user = this.auth.user();
    if (user && user.config) {
      this.config = { ...this.config, ...user.config };
    }
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

  sendTestEmail() {
    this.outreach.sendTestEmail().subscribe({
      next: () => alert('Test email sent! Check your inbox.'),
      error: (err) => alert('Test failed: ' + err.message)
    });
  }

  private initPhysics() {
    const el = this.sceneContainer()?.nativeElement;
    if (!el) return;

    this.engine = Matter.Engine.create();
    this.render = Matter.Render.create({
      element: el,
      engine: this.engine,
      options: {
        width: el.clientWidth,
        height: 150,
        background: 'transparent',
        wireframes: false
      }
    });

    const ground = Matter.Bodies.rectangle(el.clientWidth / 2, 140, el.clientWidth, 20, { 
      isStatic: true,
      render: { fillStyle: 'transparent' }
    });
    
    const createParticle = () => {
      const color = this.config.testModeActive ? '#f59e0b' : '#4f46e5';
      const particle = Matter.Bodies.circle(Math.random() * el.clientWidth, -10, 5, {
        restitution: 0.5,
        render: { fillStyle: color }
      });
      Matter.World.add(this.engine!.world, particle);
    };

    this.physicsInterval = setInterval(() => {
      if (this.outreach.status() === 'running') {
        createParticle();
      }
    }, 2000);

    Matter.World.add(this.engine.world, [ground]);
    
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, this.engine);
    Matter.Render.run(this.render);
  }

  private animateHeader() {
    anime({
      targets: '.pro-badge',
      rotate: '1turn',
      duration: 5000,
      loop: true,
      easing: 'linear'
    });
  }
}
