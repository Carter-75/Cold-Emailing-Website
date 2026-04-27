import { Component, inject, signal, afterNextRender, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OutreachService } from '../../../services/outreach.service';
import { LucideAngularModule } from 'lucide-angular';
import { gsap } from 'gsap';

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.css'
})
export class LeadsComponent {
  outreach = inject(OutreachService);
  leads = signal<any[]>([]);
  container = viewChild<ElementRef<HTMLDivElement>>('container');

  constructor() {
    afterNextRender(() => {
      this.animateIn();
      this.fetchLeads();
    });
  }

  private animateIn() {
    const el = this.container()?.nativeElement;
    if (el) {
      gsap.to(el, {
        opacity: 0.15,
        y: 0,
        duration: 0.8,
        ease: 'power4.out'
      });
    }
  }

  fetchLeads() {
    this.outreach.getLeads().subscribe(leads => {
      this.leads.set(leads.map(l => ({ ...l, isExpanded: false })));
    });
  }
}
