import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  
  // Dynamic API URL mapping
  private get apiUrl(): string {
    // Environmental "Burn-In" Toggles
    const isProd = ('__PRODUCTION__' as string) === 'true';
    const prodBackend = '__PROD_BACKEND_URL__' as string;
    
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    
    // 1. If we are local and not forced into production mode, hit the raw local port
    if (isLocal && !isProd) {
      return 'http://localhost:3000/api';
    }

    // 2. If we are in production (or forced), prioritize the explicit backend URL from env
    if (prodBackend && prodBackend !== '' && !prodBackend.includes('__PROD_')) {
      return prodBackend.endsWith('/') ? prodBackend.slice(0, -1) + '/api' : prodBackend + '/api';
    }

    // 3. Fallback: Use the universal relative path (handled by Vercel Proxy)
    return '/api';
  }

  /**
   * Universal GET wrapper
   */
  getData<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}`);
  }

  /**
   * Universal POST wrapper
   */
  postData<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, body);
  }
}
