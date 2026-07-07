import { CollectionViewer, DataSource } from '@angular/cdk/collections';
import { BehaviorSubject, Observable, Subscription, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { HttpClient, HttpParams } from '@angular/common/http';

export class InboxDataSource extends DataSource<any | undefined> {
  private _length = 0;
  private _pageSize = 20;
  private _cachedData = new Map<number, (any | undefined)[]>();
  private _fetchedPages = new Set<number>();
  private _dataStream = new BehaviorSubject<(any | undefined)[]>([]);
  private _subscription = new Subscription();
  private _destroy$ = new Subject<void>();
  
  // Public stream for total count
  public totalResults$ = new BehaviorSubject<number>(0);

  // Current filter state
  private _filters: any = { viewMode: 'inbox', account: 'all', search: '', repliesOnly: false };

  get totalLength(): number {
    return this._length;
  }

  get currentData(): any[] {
    return this._dataStream.value.filter(x => x !== undefined);
  }

  constructor(private http: HttpClient) {
    super();
  }

  /**
   * Sets new filters and resets the cache
   */
  updateFilters(filters: any) {
    this._filters = { ...this._filters, ...filters };

    this._cachedData.clear();
    this._fetchedPages.clear();
    this._length = 0;
    this._dataStream.next([]);

    // Bootstrap: Fetch first page to get total size
    this._fetchPage(0);
  }

  /**
   * Force refresh a specific page (useful for moderation actions)
   */
  refreshPage(index: number) {
    const pageIndex = Math.floor(index / this._pageSize);
    this._fetchedPages.delete(pageIndex);
    this._fetchPage(pageIndex);
  }
  
  /**
   * Completely reload data (for deletes, moves, etc.)
   */
  reload() {
    this.updateFilters({});
  }

  connect(collectionViewer: CollectionViewer): Observable<(any | undefined)[]> {
    this._subscription.add(
      collectionViewer.viewChange.pipe(debounceTime(20)).subscribe(range => {
        const startPage = Math.floor(range.start / this._pageSize);
        const endPage = Math.floor((range.end - 1) / this._pageSize);

        for (let i = startPage; i <= endPage; i++) {
          this._fetchPage(i);
        }

        // Proactively unload pages that are far away (buffer of 3 pages)
        this._cleanupCache(startPage, endPage);
      })
    );
    return this._dataStream;
  }

  disconnect(): void {
    this._subscription.unsubscribe();
    this._subscription = new Subscription();
    this._destroy$.next();
    this._destroy$.complete();
  }

  private _fetchPage(pageIndex: number) {
    if (this._fetchedPages.has(pageIndex)) {
      return;
    }

    this._fetchedPages.add(pageIndex);

    let params = new HttpParams()
      .set('page', (pageIndex + 1).toString())
      .set('limit', this._pageSize.toString());

    if (this._filters.search) params = params.set('search', this._filters.search);
    if (this._filters.account) params = params.set('account', this._filters.account);
    if (this._filters.viewMode) params = params.set('viewMode', this._filters.viewMode);
    if (this._filters.repliesOnly) params = params.set('repliesOnly', 'true');

    // Determine correct endpoint based on viewMode
    let endpoint = '/api/v1/inbox';
    if (this._filters.viewMode === 'drafts') endpoint = '/api/v1/inbox/drafts';
    else if (this._filters.viewMode === 'unsubbed') endpoint = '/api/v1/inbox/unsubbed';
    else if (this._filters.viewMode === 'discovery') endpoint = '/api/v1/inbox/discovery';
    else if (this._filters.viewMode === 'leads') endpoint = '/api/v1/inbox/leads';

    console.log(`[InboxDataSource] Fetching page ${pageIndex + 1} for ${endpoint}...`);
    
    this.http.get<any>(endpoint, { params }).subscribe({
      next: (res) => {
        this._length = res.total || 0;
        this.totalResults$.next(this._length);
        
        // Update our sparse representation
        this._cachedData.set(pageIndex, res.items || []);

        // Construct a full array for the stream
        this._updateDataStream();
      },
      error: (err) => {
        console.error('Failed to load page', err);
        // Retry logic could go here
        this._fetchedPages.delete(pageIndex);
      }
    });
  }

  private _updateDataStream() {
    const fullData = Array.from({ length: this._length });
    this._cachedData.forEach((data, pageIndex) => {
      const start = pageIndex * this._pageSize;
      for (let i = 0; i < data.length; i++) {
        fullData[start + i] = data[i];
      }
    });
    this._dataStream.next(fullData);
  }

  private _cleanupCache(startPage: number, endPage: number) {
    const buffer = 3; 
    this._cachedData.forEach((_, pageIndex) => {
      if (pageIndex < startPage - buffer || pageIndex > endPage + buffer) {
        this._cachedData.delete(pageIndex);
        this._fetchedPages.delete(pageIndex);
      }
    });
  }
}
