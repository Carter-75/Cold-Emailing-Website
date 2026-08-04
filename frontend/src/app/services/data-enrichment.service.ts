import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface DataRecord {
  _id: string;
  sourceType: string;
  sourceId: string;
  sourceUrl: string;
  structured?: {
    companyName?: string;
    estimatedBudget?: number;
    projectType?: string;
    location?: {
      city?: string;
      state?: string;
      zip?: string;
      fullAddress?: string;
    };
    contactInfo?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    executiveSummary?: string;
    tags?: string[];
  };
  status: string;
  failureReason?: string;
  linkedLeadId?: string;
  createdAt: string;
  processedAt?: string;
}

export interface DataRecordResponse {
  records: DataRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DataStats {
  totalRecords: number;
  processedToday: number;
  processedThisWeek: number;
  rawPending: number;
  failedRecords: number;
  sentToOutreach: number;
  bySource: { [key: string]: number };
}

export interface DataSource {
  name: string;
  displayName: string;
  description: string;
  updateFrequency: string;
  availableRegions?: string[];
  available: boolean;
}

export interface DataEnrichmentConfig {
  enabled: boolean;
  activeSources: string[];
  aiInstructions: string;
  targetRegions: string[];
  autoOutreach: boolean;
  publishSEO: boolean;
  dailyProcessLimit: number;
  lastRunAt?: string;
}

@Injectable({ providedIn: 'root' })
export class DataEnrichmentService {
  private api = inject(ApiService);
  private http = inject(HttpClient);

  pipelineRunning = signal(false);

  private get baseUrl() {
    return this.api.apiUrl + '/data-enrichment';
  }

  getSources(): Observable<DataSource[]> {
    return this.http.get<DataSource[]>(`${this.baseUrl}/sources`, { withCredentials: true });
  }

  getStats(): Observable<DataStats> {
    return this.http.get<DataStats>(`${this.baseUrl}/stats`, { withCredentials: true });
  }

  getRecords(params: {
    page?: number;
    limit?: number;
    status?: string;
    source?: string;
    search?: string;
    city?: string;
    minBudget?: number;
    maxBudget?: number;
    sort?: string;
  } = {}): Observable<DataRecordResponse> {
    const queryParams: any = {};
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        queryParams[key] = val;
      }
    });
    return this.http.get<DataRecordResponse>(`${this.baseUrl}/records`, { 
      params: queryParams, 
      withCredentials: true 
    });
  }

  getRecord(id: string): Observable<DataRecord> {
    return this.http.get<DataRecord>(`${this.baseUrl}/records/${id}`, { withCredentials: true });
  }

  triggerPipeline(): Observable<any> {
    this.pipelineRunning.set(true);
    return this.http.post(`${this.baseUrl}/trigger`, {}, { withCredentials: true });
  }

  sendToOutreach(recordId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/records/${recordId}/send-to-outreach`, {}, { withCredentials: true });
  }

  updateConfig(config: Partial<DataEnrichmentConfig>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/config`, config, { withCredentials: true });
  }

  deleteRecords(status?: string): Observable<any> {
    const params: Record<string, string> = status ? { status } : {};
    return this.http.delete(`${this.baseUrl}/records`, { params, withCredentials: true });
  }

  exportCsv(): void {
    window.open(`${this.baseUrl}/records/export`, '_blank');
  }
}
