import { Component, inject, signal, afterNextRender, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { OutreachService } from '../../../services/outreach.service';
import { LucideAngularModule, Shield, AlertTriangle, Play, RefreshCw, AlertCircle } from 'lucide-angular';
import { gsap } from 'gsap';

@Component({
  selector: 'app-infrastructure',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    LucideAngularModule
  ],
  templateUrl: './infrastructure.component.html',
  styleUrl: './infrastructure.component.css'
})
export class InfrastructureComponent {
  auth = inject(AuthService);
  outreach = inject(OutreachService);
  container = viewChild<ElementRef<HTMLDivElement>>('container');

  config: any = {
    openaiKey: '',
    serpapiKey: '',
    apolloKey: '',
    verifaliaUsername: '',
    verifaliaPassword: '',
    senderEmail: '',
    appPassword: '',
    smtpHost: '',
    smtpPort: 465,
    imapHost: '',
    imapPort: 993,
    testRecipientEmail: '',
    dailyLeadLimit: 3,
    timezone: 'America/Chicago',
    outreachPaused: false,
    outreachPausedReason: ''
  };

  isUnsubscribed = signal(false);

  constructor() {
    const user = this.auth.user();
    if (user?.config) {
      this.config = { ...this.config, ...user.config };
    }

    afterNextRender(() => {
      this.animateIn();
      this.checkUnsubStatus();
    });
  }

  private animateIn() {
    const el = this.container()?.nativeElement;
    if (el) {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power4.out'
      });
    }
  }

  saveConfig() {
    this.outreach.saveConfig(this.config).subscribe((res: any) => {
      if (res && res.token) localStorage.setItem('auth_token', res.token);
      alert('Infrastructure Synchronized!');
      this.auth.checkAuth();
    });
  }

  /** Re-enables the engine after the user has fixed the underlying API issue */
  clearPause() {
    this.config.outreachPaused = false;
    this.config.outreachPausedReason = '';
    this.outreach.saveConfig({
      outreachPaused: false,
      outreachPausedReason: '',
      outreachEnabled: true
    }).subscribe((res: any) => {
      if (res && res.token) localStorage.setItem('auth_token', res.token);
      this.auth.checkAuth();
      alert('Engine re-enabled. It will resume on the next business-hours cron tick.');
    });
  }

  checkUnsubStatus() {
    if (this.config.testRecipientEmail) {
      this.outreach.getUnsubStatus().subscribe((res: any) => {
        this.isUnsubscribed.set(res.isUnsubscribed);
      });
    }
  }

  clearUnsub() {
    this.outreach.clearUnsub().subscribe((res: any) => {
      alert(res.message);
      this.checkUnsubStatus();
    });
  }
}
