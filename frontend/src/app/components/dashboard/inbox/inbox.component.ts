import { Component, OnInit, signal, inject, ViewChild, ElementRef, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { QuillModule } from 'ngx-quill';
import { AuthService } from '../../../services/auth.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { InboxDataSource } from '../../../models/inbox.datasource';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, QuillModule, ScrollingModule],
  templateUrl: './inbox.component.html'
})
export class InboxComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  public auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);
  
  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;

  dataSource!: InboxDataSource;
  stats = signal<any>({ all: { total: 0, unread: 0 } });

  selectedMessage = signal<any>(null);
  replyText = signal<string>('');
  loading = signal(false);
  
  selectedIds = signal<Set<string>>(new Set());
  pendingReplyId = signal<string | null>(null);
  currentDraftId = signal<string | null>(null);
  countdown = signal<number>(0);
  includeSignature = signal<boolean>(true);
  private countdownInterval: any;

  private scrollInterval: any;
  private mouseY: number = 0;
  private mouseX: number = 0;

  viewMode = signal<'inbox'|'trash'|'drafts'|'unsubbed'|'pending'|'contacted'|'warm-up'|'dmarc'>('inbox');
  selectedAccount = signal<string>('all');
  primaryEmail = signal<string>('');
  showLeadRepliesOnly = signal<boolean>(false);
  isComposing = signal<boolean>(false);
  isReplying = signal<boolean>(false);
  isFullscreen = signal<boolean>(false);
  isGeneratingAI = signal<boolean>(false);
  aiPrompt = signal<string>('');
  composeFrom = signal('');
  composeTo = signal('');
  composeSubject = signal('');
  availableEmails = signal<string[]>([]);
  searchQuery = signal('');

  isDragging = false;
  
  // Custom scrollbar
  isScrollDragging = false;
  thumbTop = 0;
  thumbHeight = 50;
  private _scrollDragStartY = 0;
  private _scrollDragStartOffset = 0;

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
    this.dataSource = new InboxDataSource(this.http);
    
    this.fetchStats();
    
    // Auto-sync IMAP with remote server on load
    this.syncIMAP();
    
    this.http.get<{primary: string, emails: string[]}>('/api/v1/inbox/connected-emails').subscribe({
      next: (res) => {
        this.availableEmails.set(res.emails);
        this.primaryEmail.set(res.primary || '');
        if (res.emails.length > 0 && !this.composeFrom()) {
          this.composeFrom.set(res.emails[0]);
        }
      }
    });
  }

  fetchStats() {
    this.http.get<any>('/api/v1/inbox/stats').subscribe({
      next: (data) => this.stats.set(data)
    });
  }

  onFiltersChanged() {
    this.dataSource.updateFilters({
      viewMode: this.viewMode(),
      account: this.selectedAccount(),
      search: this.searchQuery(),
      repliesOnly: this.showLeadRepliesOnly()
    });
  }

  syncIMAP() {
    this.loading.set(true);
    this.http.post('/api/v1/inbox/syncs', {}).subscribe({
      next: (res: any) => {
        console.log('Sync result:', res.summary);
        this.dataSource.reload();
        this.fetchStats();
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

  getTotalCount(email: string | 'all'): number {
    const s = this.stats();
    if (!s) return 0;
    return s[email]?.total || 0;
  }

  getUnreadCount(email: string | 'all'): number {
    const s = this.stats();
    if (!s) return 0;
    return s[email]?.unread || 0;
  }

  switchView(mode: 'inbox'|'trash'|'drafts'|'unsubbed'|'pending'|'contacted'|'warm-up'|'dmarc') {
    this.viewMode.set(mode);
    this.onFiltersChanged();
    this.selectedIds.set(new Set());
    this.selectedMessage.set(null);
    this.isComposing.set(false);
    this.isReplying.set(false);
    this.currentDraftId.set(null);
  }

  public getSignatureHTML(): string {
    const config = this.auth.user()?.config;
    if (!config) return '';
    return config.signature || `<p>${config.senderName || ''}<br>${config.senderTitle || ''}</p>`;
  }

  public getSafeSignatureHTML(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.getSignatureHTML());
  }

  openCompose() {
    this.isComposing.set(true);
    this.isReplying.set(false);
    this.selectedMessage.set(null);
    this.replyText.set('');
    this.includeSignature.set(true);
    this.composeTo.set('');
    this.composeSubject.set('');
  }

  openReply() {
    this.isReplying.set(true);
    this.isComposing.set(false);
    this.replyText.set('');
    this.includeSignature.set(true);
  }

  selectMessage(msg: any) {
    this.selectedMessage.set(msg);
    if (this.viewMode() === 'drafts') {
      this.isComposing.set(true);
      this.isReplying.set(false);
      this.currentDraftId.set(msg._id);
      this.composeFrom.set(msg.inboxEmail);
      this.composeTo.set(msg.to);
      this.composeSubject.set(msg.subject);
      this.replyText.set(msg.textBody);
      return;
    }
    
    // Reset compose state
    this.replyText.set('');
    this.includeSignature.set(true);
    this.isComposing.set(false);
    this.isReplying.set(false);
    
    this.currentDraftId.set(null);
    if (!msg.isRead && (this.viewMode() === 'inbox' || this.viewMode() === 'trash')) {
      // Mark as read locally (optimistic mutate)
      msg.isRead = true;
      this.fetchStats();
      
      // Fire request to backend
      this.http.patch(`/api/v1/inbox/${msg._id}`, { isRead: true }).subscribe();
    }
  }

  sendReply() {
    if (this.isComposing()) {
      return this.sendCompose();
    }

    const msg = this.selectedMessage();
    if (!msg || !this.replyText().trim()) return;

    let finalBody = this.replyText();
    if (this.includeSignature()) {
      finalBody += `<br><br>${this.getSignatureHTML()}`;
    }

    this.loading.set(true);
    this.http.post(`/api/v1/inbox/${msg._id}/replies`, { textBody: finalBody }).subscribe({
      next: (res: any) => this.handleDelayedSendSuccess(res),
      error: () => {
        alert('Failed to send reply');
        this.loading.set(false);
      }
    });
  }

  sendCompose() {
    if (!this.composeTo().trim() || !this.composeSubject().trim() || !this.replyText().trim()) return;
    
    let finalBody = this.replyText();
    if (this.includeSignature()) {
      finalBody += `<br><br>${this.getSignatureHTML()}`;
    }

    this.loading.set(true);
    this.http.post('/api/v1/inbox/messages', {
      fromEmail: this.composeFrom(),
      to: this.composeTo(),
      subject: this.composeSubject(),
      textBody: finalBody
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
          this.isReplying.set(false);
          this.currentDraftId.set(null);
          this.dataSource.reload();
        }
      }, 1000);
    } else {
      this.isComposing.set(false);
      this.currentDraftId.set(null);
      this.dataSource.reload();
    }
  }

  cancelReply() {
    const sendId = this.pendingReplyId();
    if (!sendId) return;

    this.loading.set(true);
    this.http.delete(`/api/v1/inbox/${this.selectedMessage()._id}/replies/${sendId}`).subscribe({
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
    // We rely on the datasource to fetch the new status
    let newStatus = false; // We can't know the exact new status without the current item state, but the server handles toggle or sets.
    // Wait, the API might expect isStarred to be passed, but the old code grabbed it from the local signal.
    // Let's just find the item in currentData
    const item = this.dataSource.currentData.find(m => m._id === msgId);
    newStatus = item ? !item.isStarred : true;

    this.http.patch(`/api/v1/inbox/${msgId}`, { isStarred: newStatus }).subscribe({
      next: () => this.dataSource.reload(),
      error: () => this.dataSource.reload() // revert on error
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
      if (!this.isDragging || !this.viewport) {
        this.animationFrameId = null;
        return;
      }
      
      const container = this.viewport.elementRef.nativeElement;
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
    if (this.selectedIds().size === this.dataSource.currentData.length && this.dataSource.currentData.length > 0) {
      this.selectedIds.set(new Set());
    } else {
      const allIds = new Set(this.dataSource.currentData.map(m => m._id));
      this.selectedIds.set(allIds);
    }
  }

  deleteSelected() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    
    if (this.viewMode() === 'drafts') {
      if (!confirm(`Delete ${ids.length} drafts?`)) return;
      
      // UI update
      this.dataSource.reload();
      this.selectedIds.set(new Set());
      this.selectedMessage.set(null);
      this.isComposing.set(false);
      this.currentDraftId.set(null);

      // Background process
      Promise.all(ids.map(id => this.http.delete(`/api/v1/inbox/drafts/${id}`).toPromise()))
        .catch(err => console.error('Failed to delete some drafts in background', err));
      return;
    }
    
    if (this.viewMode() === 'unsubbed' || this.viewMode() === 'pending' || this.viewMode() === 'contacted') return;

    const endpoint = this.viewMode() === 'trash' ? '/api/v1/inbox/permanent' : '/api/v1/inbox/trash';
    const action = this.viewMode() === 'trash' ? 'permanently delete' : 'move to trash';
    if (!confirm(`Are you sure you want to ${action} ${ids.length} emails?`)) return;

    // UI update
    this.dataSource.reload();

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
    const allIds = this.dataSource.currentData.map(m => m._id);
    if (allIds.length === 0) return;

    const endpoint = this.viewMode() === 'trash' ? '/api/v1/inbox/permanent' : '/api/v1/inbox/trash';

    // UI update
    this.dataSource.reload();

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

    this.http.post('/api/v1/inbox/ai-draft', { intent, threadContext: context }).subscribe({
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

    const request = this.currentDraftId() 
      ? this.http.put(`/api/v1/inbox/drafts/${this.currentDraftId()}`, payload)
      : this.http.post('/api/v1/inbox/drafts', payload);

    request.subscribe({
      next: (res: any) => {
        this.currentDraftId.set(res._id);
        this.dataSource.reload();
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
    // UI update
    this.dataSource.reload();
    if (this.currentDraftId() === id) {
      this.currentDraftId.set(null);
      this.isComposing.set(false);
      this.selectedMessage.set(null);
    }
    
    // Background request
    this.http.delete(`/api/v1/inbox/drafts/${id}`).subscribe({
      error: () => console.error('Failed to delete draft in background')
    });
  }

  // --- Custom Scrollbar Logic ---

  onRawScroll() {
    if (this.viewport) {
      this.updateThumbPosition();
    }
  }

  private updateThumbPosition() {
    if (!this.viewport || !this.dataSource) return;

    const offset = this.viewport.measureScrollOffset();
    const totalHeight = this.dataSource.totalLength * 125; // itemSize is 125
    const viewportHeight = this.viewport.getViewportSize();

    if (totalHeight <= viewportHeight) {
      this.thumbHeight = 0;
      return;
    }

    const ratio = viewportHeight / totalHeight;
    this.thumbHeight = Math.max(viewportHeight * ratio, 40);

    const maxScroll = totalHeight - viewportHeight;
    const scrollRatio = maxScroll > 0 ? offset / maxScroll : 0;
    const maxThumbTop = viewportHeight - this.thumbHeight; 
    this.thumbTop = scrollRatio * maxThumbTop;
  }

  startScrollDrag(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isScrollDragging = true;
    this._scrollDragStartY = event.clientY;
    this._scrollDragStartOffset = this.viewport?.measureScrollOffset() || 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isScrollDragging || !this.viewport) return;

      const deltaY = moveEvent.clientY - this._scrollDragStartY;
      const viewportHeight = this.viewport.getViewportSize();
      const totalHeight = this.dataSource.totalLength * 125;
      const maxScroll = totalHeight - viewportHeight;
      const maxThumbTop = viewportHeight - this.thumbHeight;

      if (maxThumbTop <= 0) return;
      const scrollRatio = deltaY / maxThumbTop;
      const scrollDelta = scrollRatio * maxScroll;

      this.viewport.scrollToOffset(this._scrollDragStartOffset + scrollDelta);
    };

    const onMouseUp = () => {
      this.isScrollDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseup', onMouseUp, { passive: true });
  }

  onTrackClick(event: MouseEvent) {
    if (!this.viewport || !this.dataSource) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    
    // Center the thumb on the click
    const viewportHeight = this.viewport.getViewportSize();
    const totalHeight = this.dataSource.totalLength * 125;
    const maxScroll = totalHeight - viewportHeight;
    const maxThumbTop = viewportHeight - this.thumbHeight;
    
    if (maxThumbTop <= 0) return;
    
    let targetThumbTop = clickY - (this.thumbHeight / 2);
    targetThumbTop = Math.max(0, Math.min(targetThumbTop, maxThumbTop));
    
    const scrollRatio = targetThumbTop / maxThumbTop;
    const targetOffset = scrollRatio * maxScroll;
    
    // Smooth scroll to it
    this.fastScrollToOffset(targetOffset);
  }

  fastScrollToOffset(targetOffset: number, duration: number = 300) {
    if (!this.viewport) return;

    const startOffset = this.viewport.measureScrollOffset();
    const distance = targetOffset - startOffset;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      this.viewport?.scrollToOffset(startOffset + distance * easeOut);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}
