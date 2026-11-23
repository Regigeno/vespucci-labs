/** Low-resolution animated video noise, scaled up by CSS. Used for CCTV grain and signal loss. */
export class NoiseLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private band = 0;
  private frame = 0;

  constructor(width = 240, height = 135, className = "noise-layer") {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = className;
    this.g = this.canvas.getContext("2d")!;
    this.image = this.g.createImageData(width, height);
  }

  /** strength: 0 = faint grain, 1 = full static. */
  draw(dt: number, strength: number): void {
    this.frame++;
    if (this.frame % 2 === 1 && strength < 0.9) return;
    const { width, height } = this.canvas;
    const data = this.image.data;
    this.band = (this.band + dt * height * 0.35) % (height + 40);
    const alphaBase = 30 + strength * 225;
    for (let y = 0; y < height; y++) {
      const inBand = Math.abs(y - this.band) < 6;
      const rowAlpha = inBand ? Math.min(255, alphaBase + 50) : alphaBase;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const v = (Math.random() * 255) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = rowAlpha * (0.35 + Math.random() * 0.65);
      }
    }
    this.g.putImageData(this.image, 0, 0);
  }
}
