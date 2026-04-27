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
    const count = 40; // More lines

    const createLine = (reset = false) => ({
      x: reset ? -800 : Math.random() * w,
      y: reset ? Math.random() * h - h : Math.random() * h,
      length: Math.random() * 1000 + 500,
      speed: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.4 + 0.2, // Slightly brighter
      width: Math.random() * 2 + 1
    });

    for (let i = 0; i < count; i++) {
      lines.push(createLine());
    }

    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';

      lines.forEach((l, i) => {
        l.x += l.speed;
        l.y += l.speed;

        if (l.x > w || l.y > h) {
          lines[i] = createLine(true);
        }

        ctx.beginPath();
        const grad = ctx.createLinearGradient(l.x, l.y, l.x + l.length, l.y + l.length);
        grad.addColorStop(0, `rgba(165, 180, 252, 0)`);
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

    window.addEventListener('resize', () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    });
  }
  
  ngOnInit() {
    this.api.getData<{status: string}>('ping').subscribe({
      next: (res) => console.log('✅ API Status:', res),
      error: (err) => {
        console.error('❌ API Offline or Malformed Response:', err);
      }
    });
  }
}
