import { Component, signal, inject, OnInit, viewChild, ElementRef, afterNextRender } from '@angular/core';
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
  bgCanvas = viewChild<ElementRef<HTMLCanvasElement>>('bgCanvas');

  constructor() {
    afterNextRender(() => {
      this.initBackground();
    });
  }

  private initBackground() {
    const canvas = this.bgCanvas()?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const lines: any[] = [];
    const count = 25;

    for (let i = 0; i < count; i++) {
      lines.push(this.createLine(w, h));
    }

    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      
      lines.forEach((l, i) => {
        l.x += l.speed;
        l.y += l.speed;

        if (l.x > w || l.y > h) {
          lines[i] = this.createLine(w, h, true);
        }

        ctx.beginPath();
        const grad = ctx.createLinearGradient(l.x, l.y, l.x + l.length, l.y + l.length);
        grad.addColorStop(0, `rgba(165, 180, 252, 0)`); // Brighter Indigo
        grad.addColorStop(0.5, `rgba(165, 180, 252, ${l.opacity})`);
        grad.addColorStop(1, `rgba(165, 180, 252, 0)`);
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = l.width;
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.length, l.y + l.length);
        ctx.stroke();
      });

      requestAnimationFrame(animate);
    };

    animate();

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(document.body);

    window.addEventListener('resize', resize);
  }

  private createLine(w: number, h: number, reset = false) {
    const spawnX = reset ? Math.random() * w - w : Math.random() * w;
    const spawnY = reset ? Math.random() * h - h : Math.random() * h;
    
    return {
      x: spawnX,
      y: spawnY,
      length: Math.random() * 500 + 300, // Longer lines
      speed: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.6 + 0.4, // Brighter
      width: Math.random() * 3 + 2 // Thicker
    };
  }
  
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
