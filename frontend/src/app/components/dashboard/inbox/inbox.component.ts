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
  selectedMessage = signal<any>(null);
  replyText = signal<string>('');
  loading = signal(false);
  
  selectedIds = signal<Set<string>>(new Set());
  pendingReplyId = signal<string | null>(null);
  countdown = signal<number>(0);
  private countdownInterval: any;

  viewMode = signal<'inbox'|'trash'>('inbox');
  selectedAccount = signal<string>('all');
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

    this.http.get<string[]>('/api/inbox/connected-emails').subscribe({
      next: (emails) => {
        this.availableEmails.set(emails);
        if (emails.length > 0 && !this.composeFrom()) {
          this.composeFrom.set(emails[0]);
        }
      }
    });
  }

  syncIMAP() {
    this.loading.set(true);
    this.http.post('/api/inbox/sync', {}).subscribe({
      next: (res: any) => {
        console.log('Sync result:', res.summary);
        this.fetchMessages();
      },
      error: () => {
        alert('Failed to sync emails. Check server logs.');
        this.loading.set(false);
      }
    });
  }

  get filteredMessages() {
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

  switchView(mode: 'inbox'|'trash') {
    this.viewMode.set(mode);
    this.selectedIds.set(new Set());
    this.selectedMessage.set(null);
    this.isComposing.set(false);
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
    if (!msg.isRead) {
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
          this.fetchMessages();
        }
      }, 1000);
    } else {
      this.isComposing.set(false);
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
}
