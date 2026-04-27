import { Component, inject, signal, afterNextRender, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { OutreachService } from '../../../services/outreach.service';
import { BillingService } from '../../../services/billing.service';
import { LucideAngularModule } from 'lucide-angular';
import { gsap } from 'gsap';
import { computed } from '@angular/core';

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

  leads = signal<any[]>([]);
  
  realStats = computed(() => {
    const list = this.leads();
    if (!list.length) return [
      { label: 'Active Streams', value: '0', trend: '0' },
      { label: 'Success Velocity', value: '0%', trend: '0' },
      { label: 'Network Reach', value: '0', trend: '0' }
    ];

    const active = list.filter(l => l.status === 'emailed').length;
    const replied = list.filter(l => l.status === 'replied').length;
    const velocity = ((replied / list.length) * 100).toFixed(0);

    return [
      { label: 'Active Streams', value: active.toString(), trend: '0' },
      { label: 'Success Velocity', value: `${velocity}%`, trend: '0' },
      { label: 'Network Reach', value: list.length.toString(), trend: '0' }
    ];
  });

  realLogs = computed(() => {
    const list = this.leads();
    return list.slice(0, 5).map(l => {
      let icon = 'mail';
      let msg = `Contacted ${l.businessName}`;
      if (l.status === 'replied') { icon = 'message-square'; msg = `Reply from ${l.businessName}`; }
      if (l.status === 'discovery') { icon = 'search'; msg = `Discovered ${l.businessName}`; }
      
      const date = new Date(l.updatedAt);
      const diff = Math.floor((new Date().getTime() - date.getTime()) / 60000);
      let time = diff < 60 ? `${diff}m ago` : `${Math.floor(diff/60)}h ago`;
      if (diff < 1) time = 'Just now';

      return { icon, msg, time };
    });
  });

  constructor() {
    afterNextRender(() => {
      this.animateIn();
      this.fetchLeads();
    });
  }


  fetchLeads() {
    this.outreach.getLeads().subscribe(leads => {
      this.leads.set(leads);
    });
  }

  private animateIn() {
    const el = this.container()?.nativeElement;
    if (el) {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power4.out',
        clearProps: 'opacity,transform'
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
