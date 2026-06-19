import { Component, OnInit, signal, inject } from '@angular/core';
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
export class InboxComponent implements OnInit {
  private http = inject(HttpClient);
  
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

  // Slide to select logic
  onMouseDown(msgId: string, event: Event) {
    event.stopPropagation();
    this.isDragging = true;
    this.toggleSelection(msgId, event);
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
      this.loading.set(true);
      Promise.all(ids.map(id => this.http.delete(`/api/inbox/drafts/${id}`).toPromise()))
        .then(() => {
          this.selectedIds.set(new Set());
          this.selectedMessage.set(null);
          this.isComposing.set(false);
          this.currentDraftId.set(null);
          this.fetchDrafts();
          this.loading.set(false);
        })
        .catch(() => this.loading.set(false));
      return;
    }
    
    if (this.viewMode() === 'unsubbed' || this.viewMode() === 'pending' || this.viewMode() === 'contacted') return;

    const endpoint = this.viewMode() === 'trash' ? '/api/inbox/permanent-delete' : '/api/inbox/delete';
    const action = this.viewMode() === 'trash' ? 'permanently delete' : 'move to trash';
    if (!confirm(`Are you sure you want to ${action} ${ids.length} emails?`)) return;

    this.loading.set(true);
    this.http.post(endpoint, { messageIds: ids }).subscribe({
      next: () => {
        this.selectedIds.set(new Set());
        if (this.selectedMessage() && ids.includes(this.selectedMessage()._id)) {
          this.selectedMessage.set(null);
        }
        this.fetchMessages();
      },
      error: () => {
        alert(`Failed to ${action} messages`);
        this.loading.set(false);
      }
    });
  }

  emptyInbox() {
    if (this.viewMode() === 'drafts' || this.viewMode() === 'unsubbed' || this.viewMode() === 'pending' || this.viewMode() === 'contacted') return;
    
    const action = this.viewMode() === 'trash' ? 'permanently delete ALL trashed' : 'move ALL messages to trash';
    if (!confirm(`WARNING: Are you sure you want to ${action} messages?`)) return;
    const allIds = this.filteredMessages.map(m => m._id);
    if (allIds.length === 0) return;

    const endpoint = this.viewMode() === 'trash' ? '/api/inbox/permanent-delete' : '/api/inbox/delete';

    this.loading.set(true);
    this.http.post(endpoint, { messageIds: allIds }).subscribe({
      next: () => {
        this.selectedIds.set(new Set());
        this.selectedMessage.set(null);
        this.fetchMessages();
      },
      error: () => {
        alert(`Failed to ${action} messages`);
        this.loading.set(false);
      }
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
    this.http.delete(`/api/inbox/drafts/${id}`).subscribe({
      next: () => {
        if (this.currentDraftId() === id) {
          this.currentDraftId.set(null);
          this.isComposing.set(false);
          this.selectedMessage.set(null);
        }
        this.fetchDrafts();
      }
    });
  }
}
