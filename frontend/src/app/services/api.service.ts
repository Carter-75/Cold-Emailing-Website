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
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const isProdEnv = ('__PRODUCTION__' as string) === 'true';

    // 1. Production Always uses relative /api 
    // This is most stable for Vercel deployments where frontend and backend share a domain.
    if (!isLocal || isProdEnv) {
      return '/api';
    }

    // 2. Local development
    return 'http://localhost:3000/api';
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
