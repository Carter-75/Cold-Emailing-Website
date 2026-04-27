import { Component, inject, signal, afterNextRender, ElementRef, viewChild, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OutreachService } from '../../../services/outreach.service';
import { AuthService } from '../../../services/auth.service';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.css'
})
export class LeadsComponent {
  outreach = inject(OutreachService);
  auth = inject(AuthService);
  destroyRef = inject(DestroyRef);
  leads = signal<any[]>([]);
  unsubList = signal<any[]>([]);
  activeTab = signal<'pipeline' | 'replied' | 'unsubscribed'>('pipeline');
  replyContent = signal<string>('');
  isReplying = signal<boolean>(false);
  isRefining = signal<boolean>(false);
  isSyncing = signal<boolean>(false);
  isCleaningHistory = signal<boolean>(false);
  lastSynced = signal<Date>(new Date());
  container = viewChild<ElementRef<HTMLDivElement>>('container');

  constructor() {
    afterNextRender(() => {
      this.animateIn();
      this.fetchLeads();
      
      // Auto-sync every minute
      const interval = setInterval(() => {
        this.syncInbox();
      }, 60000);

      this.destroyRef.onDestroy(() => {
        clearInterval(interval);
      });
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

  fetchLeads() {
    this.outreach.getLeads().subscribe(leads => {
      this.leads.set(leads.map(l => ({ ...l, isExpanded: false })));
    });
    this.fetchUnsubList();
  }

  fetchUnsubList() {
    this.outreach.getUnsubList().subscribe(list => {
      this.unsubList.set(list);
    });
  }

  switchTab(tab: 'pipeline' | 'replied' | 'unsubscribed') {
    this.activeTab.set(tab);
    this.animateIn();
  }

  get filteredLeads() {
    const all = this.leads();
    if (this.activeTab() === 'pipeline') {
      return all.filter(l => l.status === 'emailed' || l.status === 'discovery');
    } else if (this.activeTab() === 'replied') {
      return all.filter(l => l.status === 'replied');
    }
    return []; // Unsubscribed handled separately
  }

  sendReply(lead: any) {
    if (!this.replyContent().trim() || this.isReplying()) return;

    this.isReplying.set(true);
    this.outreach.replyToLead(lead._id, this.replyContent()).subscribe({
      next: (res: any) => {
        // Update local lead state
        this.leads.update(prev => prev.map(l => 
          l._id === lead._id ? { ...l, thread: res.lead.thread, updatedAt: res.lead.updatedAt } : l
        ));
        this.replyContent.set('');
        this.isReplying.set(false);
        this.syncInbox(); // Sync immediately after reply
      },
      error: () => {
        this.isReplying.set(false);
      }
    });
  }

  refineReply(lead: any) {
    if (!this.replyContent().trim() || this.isRefining()) return;

    this.isRefining.set(true);
    this.outreach.refineReply(lead._id, this.replyContent()).subscribe({
      next: (res: any) => {
        this.replyContent.set(res.refinedText);
        this.isRefining.set(false);
      },
      error: () => {
        this.isRefining.set(false);
      }
    });
  }

  syncInbox() {
    if (this.isSyncing()) return;
    this.isSyncing.set(true);
    this.outreach.syncInbox().subscribe({
      next: () => {
        this.isSyncing.set(false);
        this.lastSynced.set(new Date());
        this.fetchLeads();
      },
      error: () => {
        this.isSyncing.set(false);
      }
    });
  }

  cleanHistory(lead: any) {
    if (this.isCleaningHistory()) return;
    this.isCleaningHistory.set(true);
    this.outreach.cleanThread(lead._id).subscribe({
      next: (res: any) => {
        this.leads.update(prev => prev.map(l => 
          l._id === lead._id ? { ...l, thread: res.lead.thread } : l
        ));
        this.isCleaningHistory.set(false);
      },
      error: () => {
        this.isCleaningHistory.set(false);
      }
    });
  }
}
