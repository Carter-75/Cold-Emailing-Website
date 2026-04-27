import { Component, signal, inject, OnInit, viewChild, ElementRef, afterNextRender } from '@angular/core';
import { ApiService } from './services/api.service';
import { RouterOutlet } from '@angular/router';
import { AuthModalComponent } from './components/auth-modal/auth-modal.component';
import * as Matter from 'matter-js';

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

  private engine?: Matter.Engine;
  private runner?: Matter.Runner;
  private mouseConstraint?: Matter.MouseConstraint;

  constructor() {
    afterNextRender(() => {
      this.initPhysicsBackground();
    });
  }

  private initPhysicsBackground() {
    const canvas = this.bgCanvas()?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const world = this.engine.world;

    const particles: any[] = [];
    const count = 30;

    for (let i = 0; i < count; i++) {
      const p = Matter.Bodies.circle(
        Math.random() * w,
        Math.random() * h,
        Math.random() * 2 + 1,
        {
          frictionAir: 0.05,
          restitution: 0.8,
          label: 'particle'
        }
      );
      (p as any).velocity.x = (Math.random() - 0.5) * 2;
      (p as any).velocity.y = (Math.random() - 0.5) * 2;
      particles.push(p);
    }

    Matter.World.add(world, particles);

    const mouse = Matter.Mouse.create(canvas);
    this.mouseConstraint = Matter.MouseConstraint.create(this.engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.1,
        render: { visible: false }
      }
    });
    Matter.World.add(world, this.mouseConstraint);

    const animate = () => {
      Matter.Engine.update(this.engine!);
      
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      particles.forEach((p, i) => {
        // Wrap around screen
        if (p.position.x < 0) Matter.Body.setPosition(p, { x: w, y: p.position.y });
        if (p.position.x > w) Matter.Body.setPosition(p, { x: 0, y: p.position.y });
        if (p.position.y < 0) Matter.Body.setPosition(p, { x: p.position.x, y: h });
        if (p.position.y > h) Matter.Body.setPosition(p, { x: p.position.x, y: 0 });

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.position.x - p2.position.x;
          const dy = p.position.y - p2.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 200) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(165, 180, 252, ${0.1 * (1 - dist / 200)})`;
            ctx.moveTo(p.position.x, p.position.y);
            ctx.lineTo(p2.position.x, p2.position.y);
            ctx.stroke();
          }
        }

        // Draw particle
        ctx.beginPath();
        ctx.fillStyle = 'rgba(165, 180, 252, 0.4)';
        ctx.arc(p.position.x, p.position.y, 2, 0, Math.PI * 2);
        ctx.fill();
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
        if (err.status === 200) {
          console.warn('⚠️ Received 200 OK but failed to parse JSON. This likely means the API returned HTML (Angular fallback). Check Vercel rewrites.');
        }
      }
    });
  }
}
