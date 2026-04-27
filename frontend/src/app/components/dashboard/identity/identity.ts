import { Component, inject, signal, afterNextRender, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { OutreachService } from '../../../services/outreach.service';
import { LucideAngularModule } from 'lucide-angular';
import { gsap } from 'gsap';

@Component({
  selector: 'app-identity',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div #container class="max-w-5xl mx-auto opacity-0 translate-y-4">
      <div class="glass-premium p-12">
        <h2 class="text-4xl font-black uppercase tracking-tighter mb-4 italic">AI Identity</h2>
        <p class="text-white/40 mb-12">Fine-tune the persona and messaging logic the engine uses for outreach.</p>

        <form (ngSubmit)="saveConfig()" class="space-y-12">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div class="space-y-6">
              <div class="space-y-2">
                <label class="text-[10px] font-black uppercase tracking-widest text-indigo-400/80">Primary Sender</label>
                <input type="text" [(ngModel)]="config.senderName" name="senderName" class="glass-input w-full" placeholder="e.g. John Doe">
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-black uppercase tracking-widest text-white/30">Professional Role</label>
                <input type="text" [(ngModel)]="config.senderTitle" name="senderTitle" class="glass-input w-full" placeholder="e.g. Founder">
              </div>
            </div>
            <div class="space-y-6">
              <div class="space-y-2">
                <label class="text-[10px] font-black uppercase tracking-widest text-white/30">Organization Name</label>
                <input type="text" [(ngModel)]="config.companyName" name="companyName" class="glass-input w-full">
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-black uppercase tracking-widest text-white/30">HQ Address</label>
                <input type="text" [(ngModel)]="config.physicalAddress" name="physicalAddress" class="glass-input w-full">
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <label class="text-[10px] font-black uppercase tracking-widest text-indigo-400">Knowledge Base & Context</label>
            <textarea [(ngModel)]="config.personaContext" name="personaContext" rows="5" class="glass-input w-full !py-4 text-sm leading-relaxed" placeholder="Explain your core value proposition and what makes you unique..."></textarea>
            <p class="text-[10px] text-white/20 italic">This context is used by the AI to synthesize every single email generated.</p>
          </div>

          <div class="space-y-6 pt-12 border-t border-white/5">
            <h3 class="text-xs font-black uppercase tracking-widest text-indigo-400">Offer Architecture</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
               <div class="space-y-2">
                 <label class="text-[10px] font-black uppercase text-white/30 tracking-widest">Entry Tier</label>
                 <input type="text" [(ngModel)]="config.priceTier1" name="priceTier1" class="glass-input w-full text-xs" placeholder="Basic Setup">
               </div>
               <div class="space-y-2">
                 <label class="text-[10px] font-black uppercase text-white/30 tracking-widest">Standard Tier</label>
                 <input type="text" [(ngModel)]="config.priceTier2" name="priceTier2" class="glass-input w-full text-xs" placeholder="Full Build">
               </div>
               <div class="space-y-2">
                 <label class="text-[10px] font-black uppercase text-white/30 tracking-widest">Premium Tier</label>
                 <input type="text" [(ngModel)]="config.priceTier3" name="priceTier3" class="glass-input w-full text-xs" placeholder="Enterprise">
               </div>
            </div>
          </div>

          <div class="space-y-3">
            <label class="text-[10px] font-black uppercase tracking-widest text-indigo-400">Digital Signature (HTML)</label>
            <textarea [(ngModel)]="config.signature" name="signature" rows="5" class="glass-input w-full font-mono text-[11px] leading-tight" placeholder="<table...>...</table>"></textarea>
          </div>

          <button type="submit" class="w-full btn-primary !py-6 !text-lg uppercase tracking-[0.2em]">Update AI Identity</button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class IdentityComponent {
  auth = inject(AuthService);
  outreach = inject(OutreachService);
  container = viewChild<ElementRef<HTMLDivElement>>('container');

  config = {
    senderName: '',
    senderTitle: '',
    companyName: '',
    physicalAddress: '',
    personaContext: '',
    priceTier1: '',
    priceTier2: '',
    priceTier3: '',
    signature: ''
  };

  constructor() {
    const user = this.auth.user();
    if (user?.config) {
      this.config = { ...this.config, ...user.config };
    }

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

  saveConfig() {
    this.outreach.saveConfig(this.config).subscribe((res: any) => {
      if (res && res.token) localStorage.setItem('auth_token', res.token);
      alert('AI Identity Optimized!');
      this.auth.checkAuth();
    });
  }
}
