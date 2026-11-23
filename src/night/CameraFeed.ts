import { NoiseLayer } from "../fx/Noise";
import { clockLabel } from "../sim/night";
import { asset, el, img } from "../ui/dom";
import type { CameraDef } from "./cameras";

/** One CCTV monitor: photo, grain, rolling band, timestamp, and static on cuts. */
export class CameraFeed {
  readonly root: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly noise = new NoiseLayer(240, 135, "feed-noise");
  private readonly code: HTMLElement;
  private readonly label: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly lost: HTMLElement;
  private src = "";
  private staticTime = 0;
  private sweep = Math.random() * 10;

  constructor() {
    this.image = img("", "feed-image");
    this.code = el("span", "feed-code");
    this.label = el("span", "feed-label");
    this.stamp = el("span", "feed-stamp");
    this.lost = el("div", "feed-lost", ["SIGNAL INTERRUPTED"]);
    this.root = el("div", "feed", [
      el("div", "feed-frame", [this.image]),
      this.noise.canvas,
      el("div", "feed-scan"),
      el("div", "feed-vignette"),
      el("div", "feed-osd", [
        el("div", "feed-osd-top", [el("span", "feed-rec", ["● REC"]), this.code, this.label]),
        el("div", "feed-osd-bottom", [this.stamp]),
      ]),
      this.lost,
    ]);
  }

  show(camera: CameraDef, src: string, cut: boolean): void {
    this.code.textContent = `CAM ${camera.code}`;
    this.label.textContent = camera.label.toUpperCase();
    if (src !== this.src) {
      this.src = src;
      this.image.src = asset(src);
    }
    if (cut) this.staticTime = Math.max(this.staticTime, 0.28);
  }

  /** Signal disturbance, e.g. when something moves through this camera's view. */
  disturb(seconds: number): void {
    this.staticTime = Math.max(this.staticTime, seconds);
  }

  update(dt: number, elapsed: number, secondsPerHour: number): void {
    this.sweep += dt;
    const sx = Math.sin(this.sweep * 0.16) * 1.6;
    const sy = Math.cos(this.sweep * 0.11) * 0.8;
    this.image.style.transform = `scale(1.1) translate(${sx}%, ${sy}%)`;
    this.staticTime = Math.max(0, this.staticTime - dt);
    const strength = this.staticTime > 0 ? 0.9 : 0.12;
    this.noise.draw(dt, strength);
    this.root.classList.toggle("disturbed", this.staticTime > 0);
    this.lost.classList.toggle("show", this.staticTime > 0.6);
    this.stamp.textContent = `NIGHT 01  ${clockLabel(elapsed, secondsPerHour)}`;
  }
}
