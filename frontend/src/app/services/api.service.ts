import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);

  get apiUrl(): string {
    return '/api/v1';
  }

  /**
   * Universal GET wrapper
   */
  getData<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}/${endpoint}`, { withCredentials: true });
  }

  /**
   * Universal POST wrapper
   */
  postData<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}/${endpoint}`, body, { withCredentials: true });
  }

  /**
   * Universal PUT wrapper
   */
  putData<T>(endpoint: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.apiUrl}/${endpoint}`, body, { withCredentials: true });
  }

  /**
   * Universal PATCH wrapper
   */
  patchData<T>(endpoint: string, body: any): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}/${endpoint}`, body, { withCredentials: true });
  }

  /**
   * Universal DELETE wrapper
   */
  deleteData<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}/${endpoint}`, { withCredentials: true });
  }
}
