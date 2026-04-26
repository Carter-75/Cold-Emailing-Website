import { Component, signal, inject, OnInit } from '@angular/core';
import { ApiService } from './services/api.service';
import { RouterOutlet } from '@angular/router';
import { AuthModalComponent } from './components/auth-modal/auth-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AuthModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private api = inject(ApiService);
  protected readonly title = signal('Cold-Emailing-Website');
  
  ngOnInit() {
    this.api.getData<{status: string}>('ping').subscribe({
      next: (res) => console.log('✅ API Status:', res),
      error: (err) => {
        console.error('❌ API Offline or Malformed Response:', err);
        if (err.status === 200) {
          console.warn('⚠️ Received 200 OK but failed to parse JSON. This likely means the API returned HTML (Angular fallback). Check Vercel rewrites.');
        }
      }
    });
  }
}
