import { Component, inject, signal, afterNextRender, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../services/auth.service';
import { DataEnrichmentService, DataRecord, DataStats, DataSource } from '../../../services/data-enrichment.service';
import anime from 'animejs';

@Component({
  selector: 'app-data-intelligence',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './data-intelligence.component.html',
  styleUrl: './data-intelligence.component.css'
})
export class DataIntelligenceComponent implements OnInit {
  auth = inject(AuthService);
  dataService = inject(DataEnrichmentService);

  // State
  stats = signal<DataStats | null>(null);
  records = signal<DataRecord[]>([]);
  sources = signal<DataSource[]>([]);
  totalPages = signal(1);
  currentPage = signal(1);
  isLoading = signal(false);
  expandedRecord = signal<string | null>(null);

  // Filters
  searchQuery = '';
  statusFilter = '';
  sourceFilter = '';
  cityFilter = '';

  // Config
  config = signal<{
    enabled: boolean;
    activeSources: string[];
    aiInstructions: string;
    targetRegions: string[];
    autoOutreach: boolean;
    dailyProcessLimit: number;
  }>({
    enabled: false,
    activeSources: [],
    aiInstructions: '',
    targetRegions: [],
    autoOutreach: false,
    dailyProcessLimit: 50
  });

  newRegion = '';

  ngOnInit() {
    const user = this.auth.user();
    if (user?.config?.dataEnrichment) {
      this.config.set({
        enabled: user.config.dataEnrichment.enabled || false,
        activeSources: user.config.dataEnrichment.activeSources || [],
        aiInstructions: user.config.dataEnrichment.aiInstructions || '',
        targetRegions: user.config.dataEnrichment.targetRegions || [],
        autoOutreach: user.config.dataEnrichment.autoOutreach || false,
        dailyProcessLimit: user.config.dataEnrichment.dailyProcessLimit || 50
      });
    }
    this.fetchAll();
  }

  fetchAll() {
    this.fetchStats();
    this.fetchRecords();
    this.fetchSources();
  }

  fetchStats() {
    this.dataService.getStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (err) => console.error('[DataIntelligence] Stats error:', err)
    });
  }

  fetchSources() {
    this.dataService.getSources().subscribe({
      next: (sources) => this.sources.set(sources),
      error: (err) => console.error('[DataIntelligence] Sources error:', err)
    });
  }

  fetchRecords(page = 1) {
    this.isLoading.set(true);
    this.dataService.getRecords({
      page,
      limit: 20,
      search: this.searchQuery || undefined,
      status: this.statusFilter || undefined,
      source: this.sourceFilter || undefined,
      city: this.cityFilter || undefined,
      sort: '-processedAt'
    }).subscribe({
      next: (res) => {
        this.records.set(res.records);
        this.totalPages.set(res.pagination.pages);
        this.currentPage.set(res.pagination.page);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('[DataIntelligence] Records error:', err);
        this.isLoading.set(false);
      }
    });
  }

  applyFilters() {
    this.fetchRecords(1);
  }

  clearFilters() {
    this.searchQuery = '';
    this.statusFilter = '';
    this.sourceFilter = '';
    this.cityFilter = '';
    this.fetchRecords(1);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.fetchRecords(page);
    }
  }

  toggleRecord(id: string) {
    this.expandedRecord.set(this.expandedRecord() === id ? null : id);
  }

  triggerPipeline() {
    this.dataService.pipelineRunning.set(true);
    this.dataService.triggerPipeline().subscribe({
      next: (res) => {
        this.dataService.pipelineRunning.set(false);
        alert(`Pipeline complete! Ingested: ${res.result?.ingested || 0}, Processed: ${res.result?.processed || 0}`);
        this.fetchAll();
      },
      error: (err) => {
        this.dataService.pipelineRunning.set(false);
        alert('Pipeline error: ' + (err.error?.message || err.message));
      }
    });
  }

  sendToOutreach(record: DataRecord) {
    this.dataService.sendToOutreach(record._id).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchRecords(this.currentPage());
      },
      error: (err) => alert('Error: ' + (err.error?.message || err.message))
    });
  }

  exportCsv() {
    this.dataService.exportCsv();
  }

  deleteFailedRecords() {
    if (!confirm('Delete all failed records? This cannot be undone.')) return;
    this.dataService.deleteRecords('failed').subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchAll();
      },
      error: (err) => alert('Error: ' + (err.error?.message || err.message))
    });
  }

  // Config Management
  toggleSource(sourceName: string) {
    const current = this.config().activeSources;
    const updated = current.includes(sourceName)
      ? current.filter(s => s !== sourceName)
      : [...current, sourceName];
    this.config.update(c => ({ ...c, activeSources: updated }));
  }

  addRegion() {
    if (this.newRegion.trim() && !this.config().targetRegions.includes(this.newRegion.trim())) {
      this.config.update(c => ({ ...c, targetRegions: [...c.targetRegions, this.newRegion.trim()] }));
      this.newRegion = '';
    }
  }

  removeRegion(region: string) {
    this.config.update(c => ({ ...c, targetRegions: c.targetRegions.filter(r => r !== region) }));
  }

  saveConfig() {
    this.dataService.updateConfig(this.config()).subscribe({
      next: () => {
        alert('Data Intelligence configuration saved!');
        this.auth.checkAuth();
      },
      error: (err) => alert('Save error: ' + (err.error?.message || err.message))
    });
  }

  formatBudget(amount: number): string {
    if (!amount) return 'N/A';
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'processed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'published': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'sent-to-outreach': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'failed': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'raw': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  }

  getSourceIcon(sourceType: string): string {
    switch (sourceType) {
      case 'building-permits': return 'building-2';
      case 'gov-contracts': return 'landmark';
      case 'sec-filings': return 'file-text';
      default: return 'database';
    }
  }
}
