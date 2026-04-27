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
  template: `
    <div #container class="opacity-0 translate-y-4">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div class="lg:col-span-8 space-y-8">
          <!-- Command Center Hero -->
          <div class="glass-premium p-1 relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-accent-blue/10 to-accent-purple/10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            
            <div class="relative p-12 flex flex-col md:flex-row items-center gap-10">
              <div class="flex-1 text-center md:text-left">
                <div class="mb-6 inline-flex items-center gap-2 rounded-full bg-accent-blue/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-accent-blue border border-accent-blue/20">
                  Mission Status: {{ outreach.status() === 'running' ? 'NOMINAL' : 'INITIALIZING' }}
                </div>
                <h1 class="text-6xl font-black uppercase tracking-tighter italic leading-none mb-6">
                  Quantum <br/>
                  <span class="text-gradient-stripe">Outreach</span>
                </h1>
                <p class="text-white/40 max-w-sm mb-10 leading-relaxed font-medium">
                  Autonomous networking engine is calibrated and ready for high-velocity deployment.
                </p>
                <div class="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                  <button (click)="toggleOutreach()" 
                          [ngClass]="outreach.status() === 'running' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'"
                          class="px-8 py-4 rounded-2xl text-black font-black uppercase tracking-widest text-[10px] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-emerald-500/20">
                    {{ outreach.status() === 'running' ? 'Halt Engine' : 'Ignite Sequences' }}
                  </button>
                  <button (click)="sendTestEmail()" class="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all">
                    Dry Run Test
                  </button>
                </div>
              </div>
              
              <div class="w-full md:w-64 aspect-square glass-premium border-white/5 flex items-center justify-center relative">
                 <div class="absolute inset-0 bg-accent-blue/5 animate-pulse rounded-[2.5rem]"></div>
                 <div class="text-6xl animate-float">⚛️</div>
              </div>
            </div>
          </div>

          <!-- Statistics Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div *ngFor="let stat of stats" class="glass-premium p-8 group hover:border-accent-blue/30 transition-all">
              <p class="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-4">{{ stat.label }}</p>
              <div class="flex items-end justify-between">
                <h3 class="text-4xl font-black italic">{{ stat.value }}</h3>
                <div class="text-[10px] font-bold text-emerald-500 mb-1">+{{ stat.trend }}%</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar / Recent Logs -->
        <div class="lg:col-span-4 space-y-8">
          <div class="glass-premium p-8 h-full min-h-[500px] flex flex-col">
            <div class="flex items-center justify-between mb-8">
              <h3 class="text-xs font-black uppercase tracking-widest italic">Live Telemetry</h3>
              <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>

            <div class="flex-1 space-y-6 overflow-y-auto no-scrollbar">
               <div *ngFor="let log of logs" class="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex gap-4 hover:bg-white/[0.04] transition-all">
                 <div class="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center shrink-0">
                   <lucide-icon [name]="log.icon" class="w-3.5 h-3.5 text-accent-blue"></lucide-icon>
                 </div>
                 <div>
                   <p class="text-[11px] font-bold leading-tight mb-1">{{ log.msg }}</p>
                   <p class="text-[9px] text-white/20 uppercase font-black">{{ log.time }}</p>
                 </div>
               </div>
            </div>

            <button class="w-full mt-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
              View Full History
            </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
  `]
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
