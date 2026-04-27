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
  templateUrl: './identity.component.html',
  styleUrl: './identity.component.css'
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
