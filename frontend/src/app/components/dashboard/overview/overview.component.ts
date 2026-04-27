import { Component, inject, signal, afterNextRender, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { OutreachService } from '../../../services/outreach.service';
import { BillingService } from '../../../services/billing.service';
import { LucideAngularModule } from 'lucide-angular';
import { gsap } from 'gsap';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent {
  auth = inject(AuthService);
  outreach = inject(OutreachService);
  billing = inject(BillingService);
  container = viewChild<ElementRef<HTMLDivElement>>('container');

  stats = [
    { label: 'Active Streams', value: '42', trend: '12' },
    { label: 'Success Velocity', value: '98%', trend: '4' },
    { label: 'Network Reach', value: '1.2k', trend: '28' }
  ];

  logs = [
    { icon: 'search', msg: 'Lead Signal Detected: Acme Corp', time: '2m ago' },
    { icon: 'zap', msg: 'AI Sequence Optimized', time: '14m ago' },
    { icon: 'send', msg: 'Deployment Successful', time: '1h ago' },
    { icon: 'check-circle', msg: 'Verification Complete', time: '3h ago' }
  ];

  constructor() {
    afterNextRender(() => {
      this.animateIn();
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

  toggleOutreach() {
    if (this.outreach.status() === 'stopped' || this.outreach.status() === 'paused') {
      this.outreach.startOutreach().subscribe();
    } else {
      this.outreach.stopOutreach().subscribe();
    }
  }

  sendTestEmail() {
    this.outreach.sendTestEmail().subscribe((res: any) => alert(res.message));
  }
}
