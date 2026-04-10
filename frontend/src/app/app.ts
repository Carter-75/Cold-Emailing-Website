import { Component, signal, inject, OnInit, viewChild, ElementRef, afterNextRender, OnDestroy } from '@angular/core';
import { ApiService } from './services/api.service';
import * as Matter from 'matter-js';
import anime from 'animejs';
import confetti from 'canvas-confetti';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private api = inject(ApiService);
  protected readonly title = signal('Cold-Emailing-Website');
  
  ngOnInit() {
    // Example universal call
    this.api.getData('ping').subscribe(res => console.log('API Status:', res));
  }

  
  private container = viewChild<ElementRef<HTMLDivElement>>('scene');
  private card = viewChild<ElementRef<HTMLDivElement>>('card');
  private engine?: Matter.Engine;
  private render?: Matter.Render;

  constructor() {
    afterNextRender(() => {
      this.initPhysics();
      this.initAnimation();

      if (true) window.addEventListener('resize', this.handleResize);
    });
  }

  ngOnDestroy() {
    if (true) window.removeEventListener('resize', this.handleResize);
    if (this.render) { Matter.Render.stop(this.render); if (this.render.canvas.parentNode) { this.render.canvas.parentNode.removeChild(this.render.canvas); } }
    if (this.engine) Matter.Engine.clear(this.engine);
  }


  private handleResize = () => {
    const el = this.container()?.nativeElement;
    if (el && this.render) {
      this.render.canvas.width = el.clientWidth; this.render.options.width = el.clientWidth;
    }
  };

  private initAnimation() {
    const el = this.card()?.nativeElement;
    if (el) {
      anime({
        targets: el,
        scale: [1, 1.02],
        direction: 'alternate',
        easing: 'easeInOutSine',
        duration: 1400,
        loop: true
      });
    }
  }

  private initPhysics() {
    const el = this.container()?.nativeElement;
    if (!el) return;

    this.engine = Matter.Engine.create();
    this.render = Matter.Render.create({
      element: el,
      engine: this.engine,
      options: {
        width: el.clientWidth,
        height: 220,
        background: 'transparent',
        wireframes: false
      }
    });

    const ground = Matter.Bodies.rectangle(el.clientWidth / 2, 210, el.clientWidth, 20, { 
      isStatic: true,
      render: { fillStyle: '#d1d5db' }
    });
    
    const ball = Matter.Bodies.circle(80, 30, 20, { 
      restitution: 0.85,
      render: { fillStyle: '#ffb347' }
    });

    Matter.World.add(this.engine.world, [ground, ball]);
    
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, this.engine);
    Matter.Render.run(this.render);
  }

}
