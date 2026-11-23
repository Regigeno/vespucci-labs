interface Drop {
  x: number;
  y: number;
  z: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
  size: number;
}

interface LensDrop {
  x: number;
  y: number;
  r: number;
  vy: number;
  life: number;
}

export interface RainOptions {
  width: number;
  height: number;
  density: number;
  wind: number;
  /** Water beads sliding down the "camera lens" for a first-person feel. */
  lens: boolean;
  /** Where the ground plane starts, as a fraction of the height. Splashes land below it. */
  horizon: number;
}

/** Depth-layered rain: far streaks are thin and dim, near streaks are long, wide and blurred. */
export class RainLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly drops: Drop[] = [];
  private readonly splashes: Splash[] = [];
  private readonly lens: LensDrop[] = [];
  private flash = 0;
  private lensTimer = 0;
  intensity = 1;

  constructor(private readonly opts: RainOptions) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = opts.width;
    this.canvas.height = opts.height;
    this.canvas.className = "rain-layer";
    this.g = this.canvas.getContext("2d")!;
    for (let i = 0; i < opts.density; i++) this.drops.push(this.spawn(true));
  }

  lightning(): void {
    this.flash = 1;
  }

  private spawn(anywhere: boolean): Drop {
    return {
      x: Math.random() * (this.opts.width + 400) - 200,
      y: anywhere ? Math.random() * this.opts.height : -60 - Math.random() * 200,
      z: 0.15 + Math.random() ** 1.6 * 0.85,
    };
  }

  update(dt: number): void {
    const { width, height, wind, horizon } = this.opts;
    for (const d of this.drops) {
      const speed = 900 + 1500 * d.z;
      d.y += speed * dt;
      d.x += wind * speed * dt;
      const ground = height * (horizon + (1 - horizon) * d.z);
      if (d.y > ground) {
        if (d.z > 0.45 && Math.random() < 0.35 && this.splashes.length < 160) {
          this.splashes.push({ x: d.x, y: ground, age: 0, size: 2 + d.z * 7 });
        }
        Object.assign(d, this.spawn(false));
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].age += dt;
      if (this.splashes[i].age > 0.28) this.splashes.splice(i, 1);
    }
    if (this.opts.lens) {
      this.lensTimer -= dt;
      if (this.lensTimer <= 0 && this.lens.length < 18) {
        this.lensTimer = 0.25 + Math.random() * 0.9;
        this.lens.push({
          x: Math.random() * width,
          y: Math.random() * height * 0.7,
          r: 3 + Math.random() * 11,
          vy: 0,
          life: 5 + Math.random() * 6,
        });
      }
      for (let i = this.lens.length - 1; i >= 0; i--) {
        const l = this.lens[i];
        l.life -= dt;
        if (l.r > 8 && Math.random() < 0.02) l.vy = 40 + Math.random() * 120;
        l.y += l.vy * dt;
        l.vy *= 0.97;
        if (l.life <= 0 || l.y > height + 20) this.lens.splice(i, 1);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  draw(): void {
    const g = this.g;
    const { width, height, wind } = this.opts;
    g.clearRect(0, 0, width, height);
    if (this.flash > 0) {
      g.fillStyle = `rgba(200,215,255,${this.flash * 0.35})`;
      g.fillRect(0, 0, width, height);
    }
    g.lineCap = "round";
    for (const d of this.drops) {
      const len = (12 + 46 * d.z) * this.intensity;
      const alpha = (0.05 + 0.22 * d.z) * this.intensity;
      g.strokeStyle = `rgba(190,205,220,${alpha})`;
      g.lineWidth = 0.6 + d.z * 1.8;
      g.beginPath();
      g.moveTo(d.x, d.y);
      g.lineTo(d.x - wind * len, d.y - len);
      g.stroke();
    }
    g.lineWidth = 1;
    for (const s of this.splashes) {
      const t = s.age / 0.28;
      g.strokeStyle = `rgba(200,210,225,${(1 - t) * 0.35})`;
      g.beginPath();
      g.ellipse(s.x, s.y, s.size * (0.4 + t), s.size * 0.25 * (0.4 + t), 0, 0, Math.PI * 2);
      g.stroke();
    }
    for (const l of this.lens) {
      const fade = Math.min(1, l.life);
      const grad = g.createRadialGradient(l.x - l.r * 0.3, l.y - l.r * 0.3, l.r * 0.1, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(255,255,255,${0.22 * fade})`);
      grad.addColorStop(0.6, `rgba(160,180,200,${0.06 * fade})`);
      grad.addColorStop(0.9, `rgba(20,25,30,${0.25 * fade})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      g.fill();
      if (l.vy > 5) {
        g.strokeStyle = `rgba(180,200,220,${0.08 * fade})`;
        g.lineWidth = l.r * 0.5;
        g.beginPath();
        g.moveTo(l.x, l.y - l.r);
        g.lineTo(l.x, l.y - l.r - 40);
        g.stroke();
      }
    }
  }
}
