import { Component, OnInit, signal, inject, ViewChild, ElementRef, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { QuillModule } from 'ngx-quill';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, QuillModule],
  templateUrl: './inbox.component.html'
})
export class InboxComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  messages = signal<any[]>([]);
  drafts = signal<any[]>([]);
  unsubbed = signal<any[]>([]);
  pending = signal<any[]>([]);
  contacted = signal<any[]>([]);
  selectedMessage = signal<any>(null);
  replyText = signal<string>('');
  loading = signal(false);
  
  selectedIds = signal<Set<string>>(new Set());
  pendingReplyId = signal<string | null>(null);
  currentDraftId = signal<string | null>(null);
  countdown = signal<number>(0);
  private countdownInterval: any;

  private scrollInterval: any;
  private mouseY: number = 0;
  private mouseX: number = 0;

  viewMode = signal<'inbox'|'trash'|'drafts'|'unsubbed'|'pending'|'contacted'>('inbox');
  selectedAccount = signal<string>('all');
  primaryEmail = signal<string>('');
  showLeadRepliesOnly = signal<boolean>(false);
  isComposing = signal(false);
  composeFrom = signal('');
  composeTo = signal('');
  composeSubject = signal('');
  availableEmails = signal<string[]>([]);
  aiPrompt = signal('');
  isGeneratingAI = signal(false);

  isDragging = false;

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'header': [1, 2, 3, false] }],
      ['link'],
      ['clean']
    ]
  };

  ngOnInit() {
    this.fetchMessages();
    this.fetchDrafts();
    this.fetchUnsubbed();
    this.fetchPending();
    this.fetchContacted();
  }

  fetchMessages() {
    this.loading.set(true);
    this.http.get<any[]>('/api/inbox').subscribe({
      next: (data) => {
        this.messages.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });

    this.http.get<{primary: string, emails: string[]}>('/api/inbox/connected-emails').subscribe({
      next: (res) => {
        this.availableEmails.set(res.emails);
        this.primaryEmail.set(res.primary || '');
        if (res.emails.length > 0 && !this.composeFrom()) {
          this.composeFrom.set(res.emails[0]);
        }
      }
    });
  }

  fetchDrafts() {
    this.http.get<any[]>('/api/inbox/drafts').subscribe({
      next: (data) => this.drafts.set(data)
    });
  }

  fetchUnsubbed() {
    this.http.get<any[]>('/api/inbox/unsubbed').subscribe({
      next: (data) => this.unsubbed.set(data)
    });
  }

  fetchPending() {
    this.http.get<any[]>('/api/inbox/pending').subscribe({
      next: (data) => this.pending.set(data)
    });
  }

  fetchContacted() {
    this.http.get<any[]>('/api/inbox/contacted').subscribe({
      next: (data) => this.contacted.set(data)
    });
  }

  syncIMAP() {
    this.loading.set(true);
    this.http.post('/api/inbox/sync', {}).subscribe({
      next: (res: any) => {
        console.log('Sync result:', res.summary);
        this.fetchMessages();
        if (res.summary?.errors && res.summary.errors.length > 0) {
          alert('IMAP Connection Error:\n\n' + res.summary.errors.join('\n\n') + '\n\nPlease check your App Passwords and IMAP Host/Port settings.');
        }
      },
      error: () => {
        alert('Failed to sync emails. Check server logs.');
        this.loading.set(false);
      }
    });
  }

  get filteredMessages() {
    if (this.viewMode() === 'drafts') {
      return this.drafts().filter(m => {
        if (this.selectedAccount() !== 'all' && m.inboxEmail !== this.selectedAccount()) return false;
        return true;
      });
    }

    if (this.viewMode() === 'unsubbed') {
      // Unsubbed leads don't have inboxEmail natively in the Lead object easily filterable here, 
      // but we just return them all.
      return this.unsubbed();
    }

    if (this.viewMode() === 'pending') {
      return this.pending();
    }

    if (this.viewMode() === 'contacted') {
      return this.contacted();
    }

    return this.messages().filter(m => {
      if (this.viewMode() === 'trash' ? !m.isTrashed : m.isTrashed) return false;
      if (this.selectedAccount() !== 'all' && m.inboxEmail !== this.selectedAccount()) return false;
      if (this.showLeadRepliesOnly() && !m.isReply) return false;
      return true;
    });
  }

  getUnreadCount(email: string | 'all'): number {
    return this.messages().filter(m => {
      if (m.isTrashed) return false;
      if (email !== 'all' && m.inboxEmail !== email) return false;
      if (this.showLeadRepliesOnly() && !m.isReply) return false;
      return !m.isRead;
    }).length;
  }

  switchView(mode: 'inbox'|'trash'|'drafts'|'unsubbed'|'pending'|'contacted') {
    this.viewMode.set(mode);
    this.selectedIds.set(new Set());
    this.selectedMessage.set(null);
    this.isComposing.set(false);
    this.currentDraftId.set(null);
  }

  openCompose() {
    this.isComposing.set(true);
    this.selectedMessage.set(null);
    this.replyText.set('');
    this.composeTo.set('');
    this.composeSubject.set('');
  }

  selectMessage(msg: any) {
    this.selectedMessage.set(msg);
    if (this.viewMode() === 'drafts') {
      this.isComposing.set(true);
      this.currentDraftId.set(msg._id);
      this.composeFrom.set(msg.inboxEmail);
      this.composeTo.set(msg.to);
      this.composeSubject.set(msg.subject);
      this.replyText.set(msg.textBody);
      return;
    }
    this.currentDraftId.set(null);
    if (!msg.isRead && (this.viewMode() === 'inbox' || this.viewMode() === 'trash')) {
      // Mark as read locally
      const updated = this.messages().map(m => m._id === msg._id ? { ...m, isRead: true } : m);
      this.messages.set(updated);
      
      // Fire request to backend
      this.http.post(`/api/inbox/${msg._id}/read`, {}).subscribe();
    }
  }

  sendReply() {
    if (this.isComposing()) {
      return this.sendCompose();
    }

    const msg = this.selectedMessage();
    if (!msg || !this.replyText().trim()) return;

    this.loading.set(true);
    this.http.post(`/api/inbox/${msg._id}/reply`, { textBody: this.replyText() }).subscribe({
      next: (res: any) => this.handleDelayedSendSuccess(res),
      error: () => {
        alert('Failed to send reply');
        this.loading.set(false);
      }
    });
  }

  sendCompose() {
    if (!this.composeTo().trim() || !this.composeSubject().trim() || !this.replyText().trim()) return;
    
    this.loading.set(true);
    this.http.post('/api/inbox/compose', {
      fromEmail: this.composeFrom(),
      to: this.composeTo(),
      subject: this.composeSubject(),
      textBody: this.replyText()
    }).subscribe({
      next: (res: any) => this.handleDelayedSendSuccess(res),
      error: () => {
        alert('Failed to send message');
        this.loading.set(false);
      }
    });
  }

  handleDelayedSendSuccess(res: any) {
    // If it was a draft, delete it after sending
    if (this.currentDraftId()) {
      this.deleteDraft(this.currentDraftId()!);
    }
    
    this.replyText.set('');
    this.loading.set(false);
    if (res.sendId) {
      this.pendingReplyId.set(res.sendId);
      this.countdown.set(30);
      this.countdownInterval = setInterval(() => {
        this.countdown.update(c => c - 1);
        if (this.countdown() <= 0) {
          clearInterval(this.countdownInterval);
          this.pendingReplyId.set(null);
          this.isComposing.set(false);
          this.currentDraftId.set(null);
          this.fetchMessages();
        }
      }, 1000);
    } else {
      this.isComposing.set(false);
      this.currentDraftId.set(null);
      this.fetchMessages();
    }
  }

  cancelReply() {
    const sendId = this.pendingReplyId();
    if (!sendId) return;

    this.loading.set(true);
    this.http.post(`/api/inbox/${this.selectedMessage()._id}/cancel-reply`, { sendId }).subscribe({
      next: () => {
        clearInterval(this.countdownInterval);
        this.pendingReplyId.set(null);
        this.loading.set(false);
      },
      error: () => {
        alert('Failed to cancel or already sent');
        this.loading.set(false);
      }
    });
  }

  toggleStar(msgId: string, event: Event) {
    event.stopPropagation();
    // Optimistic update
    const updated = this.messages().map(m => m._id === msgId ? { ...m, isStarred: !m.isStarred } : m);
    this.messages.set(updated);

    this.http.post(`/api/inbox/${msgId}/star`, {}).subscribe({
      error: () => this.fetchMessages() // revert on error
    });
  }

  ngOnDestroy() {
    this.stopAutoScroll();
  }

  private animationFrameId: number | null = null;
  private lastCheckTime = 0;

  // Slide to select logic
  onMouseDown(msgId: string, event: Event) {
    event.preventDefault(); // Prevents native text selection / drag
    event.stopPropagation();
    this.isDragging = true;
    this.toggleSelection(msgId, event);
    this.startAutoScroll();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
    
    // Find element under cursor to trigger selection if scroll isn't happening but mouse is moving over items
    const now = Date.now();
    if (now - this.lastCheckTime > 50) {
      this.checkHoverSelection();
      this.lastCheckTime = now;
    }
  }

  startAutoScroll() {
    if (this.animationFrameId !== null) return;
    
    const loop = () => {
      if (!this.isDragging || !this.scrollContainer) {
        this.animationFrameId = null;
        return;
      }
      
      const container = this.scrollContainer.nativeElement;
      const rect = container.getBoundingClientRect();
      const threshold = 60; // start scrolling when within 60px of the edge
      const scrollSpeed = 12; // pixels per frame

      let scrolled = false;
      if (this.mouseY > rect.bottom - threshold) {
        container.scrollTop += scrollSpeed;
        scrolled = true;
      } else if (this.mouseY < rect.top + threshold) {
        container.scrollTop -= scrollSpeed;
        scrolled = true;
      }

      if (scrolled) {
        const now = Date.now();
        if (now - this.lastCheckTime > 50) {
          this.checkHoverSelection();
          this.lastCheckTime = now;
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopAutoScroll() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  checkHoverSelection() {
    // During auto-scroll, the mouse might be stationary but elements move under it.
    // elementFromPoint checks what's currently under the stationary cursor.
    const el = document.elementFromPoint(this.mouseX, this.mouseY);
    if (el) {
      const row = el.closest('[data-msg-id]');
      if (row) {
        const id = row.getAttribute('data-msg-id');
        if (id) this.onMouseEnter(id);
      }
    }
  }

  onMouseEnter(msgId: string) {
    if (this.isDragging) {
      const current = new Set(this.selectedIds());
      current.add(msgId);
      this.selectedIds.set(current);
    }
  }

  onMouseUp() {
    this.isDragging = false;
    this.stopAutoScroll();
  }

  toggleSelection(msgId: string, event: Event) {
    event.stopPropagation();
    const current = new Set(this.selectedIds());
    if (current.has(msgId)) {
      current.delete(msgId);
    } else {
      current.add(msgId);
    }
    this.selectedIds.set(current);
  }

  toggleSelectAll() {
    if (this.selectedIds().size === this.filteredMessages.length && this.filteredMessages.length > 0) {
      this.selectedIds.set(new Set());
    } else {
      const allIds = new Set(this.filteredMessages.map(m => m._id));
      this.selectedIds.set(allIds);
    }
  }

  deleteSelected() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    
    if (this.viewMode() === 'drafts') {
      if (!confirm(`Delete ${ids.length} drafts?`)) return;
      
      // Optimistic UI update
      this.drafts.set(this.drafts().filter(d => !ids.includes(d._id)));
      this.selectedIds.set(new Set());
      this.selectedMessage.set(null);
      this.isComposing.set(false);
      this.currentDraftId.set(null);

      // Background process
      Promise.all(ids.map(id => this.http.delete(`/api/inbox/drafts/${id}`).toPromise()))
        .catch(err => console.error('Failed to delete some drafts in background', err));
      return;
    }
    
    if (this.viewMode() === 'unsubbed' || this.viewMode() === 'pending' || this.viewMode() === 'contacted') return;

    const endpoint = this.viewMode() === 'trash' ? '/api/inbox/permanent-delete' : '/api/inbox/delete';
    const action = this.viewMode() === 'trash' ? 'permanently delete' : 'move to trash';
    if (!confirm(`Are you sure you want to ${action} ${ids.length} emails?`)) return;

    // Optimistic UI update
    const isTrash = this.viewMode() === 'trash';
    if (isTrash) {
      this.messages.set(this.messages().filter(m => !ids.includes(m._id)));
    } else {
      this.messages.set(this.messages().map(m => ids.includes(m._id) ? { ...m, isTrashed: true } : m));
    }

    this.selectedIds.set(new Set());
    if (this.selectedMessage() && ids.includes(this.selectedMessage()._id)) {
      this.selectedMessage.set(null);
    }

    // Background process
    this.http.post(endpoint, { messageIds: ids }).subscribe({
      error: () => console.error(`Failed background ${action}`)
    });
  }

  emptyInbox() {
    if (this.viewMode() === 'drafts' || this.viewMode() === 'unsubbed' || this.viewMode() === 'pending' || this.viewMode() === 'contacted') return;
    
    const action = this.viewMode() === 'trash' ? 'permanently delete ALL trashed' : 'move ALL messages to trash';
    if (!confirm(`WARNING: Are you sure you want to ${action} messages?`)) return;
    const allIds = this.filteredMessages.map(m => m._id);
    if (allIds.length === 0) return;

    const endpoint = this.viewMode() === 'trash' ? '/api/inbox/permanent-delete' : '/api/inbox/delete';

    // Optimistic UI update
    const isTrash = this.viewMode() === 'trash';
    if (isTrash) {
      this.messages.set(this.messages().filter(m => !allIds.includes(m._id)));
    } else {
      this.messages.set(this.messages().map(m => allIds.includes(m._id) ? { ...m, isTrashed: true } : m));
    }

    this.selectedIds.set(new Set());
    this.selectedMessage.set(null);

    // Background process
    this.http.post(endpoint, { messageIds: allIds }).subscribe({
      error: () => console.error(`Failed background ${action}`)
    });
  }

  generateAIDraft() {
    const intent = prompt("What do you want to say? (e.g. 'Politely decline the offer', 'Ask for a meeting on Tuesday')");
    if (!intent) return;

    this.isGeneratingAI.set(true);
    let context = '';
    if (!this.isComposing() && this.selectedMessage()) {
      context = `From: ${this.selectedMessage().from}\nSubject: ${this.selectedMessage().subject}\nMessage:\n${this.selectedMessage().textBody}`;
    }

    this.http.post('/api/inbox/ai-draft', { intent, threadContext: context }).subscribe({
      next: (res: any) => {
        if (res.warning) {
          const proceed = confirm(`⚠️ AI WARNING:\n${res.warning}\n\nDo you still want to insert this draft?`);
          if (!proceed) {
            this.isGeneratingAI.set(false);
            return;
          }
        }
        this.replyText.set(res.draft);
        this.isGeneratingAI.set(false);
      },
      error: () => {
        alert('Failed to generate AI Draft. Check if your OpenAI key is configured in settings.');
        this.isGeneratingAI.set(false);
      }
    });
  }

  saveDraft() {
    this.loading.set(true);
    const payload = {
      draftId: this.currentDraftId(),
      inboxEmail: this.isComposing() ? this.composeFrom() : this.selectedMessage()?.inboxEmail,
      to: this.isComposing() ? this.composeTo() : this.selectedMessage()?.from,
      subject: this.isComposing() ? this.composeSubject() : (this.selectedMessage()?.subject?.startsWith('Re:') ? this.selectedMessage().subject : `Re: ${this.selectedMessage()?.subject}`),
      textBody: this.replyText(),
      replyToMessageId: this.isComposing() ? null : this.selectedMessage()?._id
    };

    this.http.post('/api/inbox/drafts', payload).subscribe({
      next: (res: any) => {
        this.currentDraftId.set(res._id);
        this.fetchDrafts();
        this.loading.set(false);
        // show success indicator here if desired
      },
      error: () => {
        alert('Failed to save draft');
        this.loading.set(false);
      }
    });
  }

  deleteDraft(id: string) {
    // Optimistic UI update
    this.drafts.set(this.drafts().filter(d => d._id !== id));
    if (this.currentDraftId() === id) {
      this.currentDraftId.set(null);
      this.isComposing.set(false);
      this.selectedMessage.set(null);
    }
    
    // Background request
    this.http.delete(`/api/inbox/drafts/${id}`).subscribe({
      error: () => console.error('Failed to delete draft in background')
    });
  }
}
