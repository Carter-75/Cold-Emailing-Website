import { Component, ElementRef, OnInit, ViewChild, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { gsap } from 'gsap';

@Component({
  selector: 'app-mesh-gradient',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mesh-container relative h-full w-full overflow-hidden">
      <canvas #meshCanvas class="absolute inset-0 h-full w-full opacity-60 blur-[100px]"></canvas>
      <div class="noise-overlay absolute inset-0 opacity-[0.03] pointer-events-none"></div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    canvas { transform: translateZ(0); }
    .noise-overlay {
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    }
  `]
})
export class MeshGradientComponent implements OnInit, OnDestroy {
  @ViewChild('meshCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private blobs: any[] = [];
  private animationFrameId?: number;

  colors = [
    '#1e3a8a', // Dark Blue
    '#312e81', // Dark Indigo
    '#4c1d95', // Dark Purple
    '#050505', // Charcoal
  ];

  ngOnInit() {
    this.initCanvas();
    this.createBlobs();
    this.animate();
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.initCanvas();
  }

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth / 2; // Reduced resolution for better performance
    canvas.height = window.innerHeight / 2;
  }

  private createBlobs() {
    const blobCount = 6;
    for (let i = 0; i < blobCount; i++) {
      this.blobs.push({
        x: Math.random() * (window.innerWidth / 2),
        y: Math.random() * (window.innerHeight / 2),
        radius: Math.random() * 200 + 150,
        color: this.colors[i % this.colors.length],
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  private animate() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    this.blobs.forEach(blob => {
      blob.x += blob.vx;
      blob.y += blob.vy;

      if (blob.x < -blob.radius) blob.x = this.ctx.canvas.width + blob.radius;
      if (blob.x > this.ctx.canvas.width + blob.radius) blob.x = -blob.radius;
      if (blob.y < -blob.radius) blob.y = this.ctx.canvas.height + blob.radius;
      if (blob.y > this.ctx.canvas.height + blob.radius) blob.y = -blob.radius;

      this.ctx.beginPath();
      this.ctx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = blob.color;
      this.ctx.fill();
    });

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }
}
