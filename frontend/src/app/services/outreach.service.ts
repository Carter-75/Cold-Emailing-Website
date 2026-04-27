import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { tap } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface LogEntry {
  message: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class OutreachService {
  private api = inject(ApiService);
  private socket: Socket | null = null;
  
  status = signal<string>('stopped');
  logs = signal<LogEntry[]>([]);
  stats = signal<any>({ sent: 0 });

  constructor() {
    if (this.isSocketSupported()) {
      this.initSocket();
    }
  }

  private initSocket() {
    const baseUrl = window.location.origin;
    this.socket = io(baseUrl);

    this.socket.on('engine-status', (data) => {
      this.status.set(data.status);
      this.addLog(`System: ${data.message}`);
    });

    this.socket.on('engine-log', (msg) => {
      this.addLog(msg);
    });

    this.socket.on('engine-stats', (data) => {
      this.stats.set(data);
    });
  }

  private isSocketSupported() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }

  private addLog(msg: string) {
    const entry: LogEntry = {
      message: msg,
      timestamp: new Date()
    };
    this.logs.update(prev => [entry, ...prev].slice(0, 100));
  }

  startOutreach() {
    return this.api.postData<{ message?: string }>('outreach/start', {}).pipe(
      tap((response) => {
        this.status.set('running');
        this.addLog(`System: ${response.message || 'Automation enabled'}`);
      })
    );
  }

  stopOutreach() {
    return this.api.postData<{ message?: string }>('outreach/stop', {}).pipe(
      tap((response) => {
        this.status.set('stopped');
        this.addLog(`System: ${response.message || 'Automation disabled'}`);
      })
    );
  }

  sendTestEmail() {
    return this.api.postData('outreach/test-send', {});
  }

  getUnsubStatus() {
    return this.api.getData<{ isUnsubscribed: boolean; email: string }>('outreach/unsub-status');
  }

  getUnsubList() {
    return this.api.getData<any[]>('outreach/unsub-list');
  }

  clearUnsub() {
    return this.api.postData<{ message: string }>('outreach/unsub-clear', {});
  }

  syncInbox() {
    return this.api.postData<{ message: string }>('outreach/sync-inbox', {});
  }

  saveConfig(config: any) {
    return this.api.postData('config', config);
  }

  getLeads() {
    return this.api.getData<any[]>('leads');
  }

  replyToLead(leadId: string, body: string) {
    return this.api.postData(`leads/${leadId}/reply`, { body });
  }

  refineReply(leadId: string, draft: string) {
    return this.api.postData<{ refinedText: string }>(`leads/${leadId}/refine-reply`, { draft });
  }

  cleanThread(leadId: string) {
    return this.api.postData<{ message: string, lead: any }>(`leads/${leadId}/clean-thread`, {});
  }
}
