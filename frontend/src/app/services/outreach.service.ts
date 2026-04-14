import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class OutreachService {
  private api = inject(ApiService);
  private socket: Socket | null = null;
  
  status = signal<string>('stopped');
  logs = signal<string[]>([]);
  stats = signal<any>({ sent: 0 });

  constructor() {
    this.initSocket();
  }

  private initSocket() {
    const baseUrl = (this.api as any).apiUrl.replace('/api', '');
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

  private addLog(msg: string) {
    this.logs.update(prev => [msg, ...prev].slice(0, 100));
  }

  startOutreach() {
    return this.api.postData('outreach/start', {});
  }

  stopOutreach() {
    return this.api.postData('outreach/stop', {});
  }

  sendTestEmail() {
    return this.api.postData('outreach/test-send', {});
  }

  saveConfig(config: any) {
    return this.api.postData('config', config);
  }
}
