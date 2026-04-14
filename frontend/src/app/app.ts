import { Component, signal, inject, OnInit } from '@angular/core';
import { ApiService } from './services/api.service';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private api = inject(ApiService);
  protected readonly title = signal('Cold-Emailing-Website');
  
  ngOnInit() {
    this.api.getData('ping').subscribe({
      next: (res) => console.log('API Status:', res),
      error: (err) => console.error('API Offline:', err)
    });
  }
}
