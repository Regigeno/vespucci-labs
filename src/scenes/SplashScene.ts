import type { Game, Scene } from "../game";
import { el, preload } from "../ui/dom";

export class SplashScene implements Scene {
  readonly root: HTMLElement;
  private ready = false;
  private readonly prompt: HTMLElement;

  constructor(private readonly game: Game) {
    this.prompt = el("div", "splash-prompt", ["Loading…"]);
    this.root = el("div", "scene splash", [
      el("div", "splash-mark", ["VESPUCCI LABS"]),
      el("div", "splash-note", ["Headphones recommended. This demo contains flashing lights and a jumpscare."]),
      this.prompt,
    ]);
    this.root.addEventListener("pointerdown", () => this.begin());
    this.onKey = this.onKey.bind(this);
  }

  enter(): void {
    window.addEventListener("keydown", this.onKey);
    void preload(["title_bg.jpg", "cutscene_approach.jpg", "cutscene_door.jpg"]).then(() => {
      this.ready = true;
      this.prompt.textContent = "Click anywhere to begin";
      this.prompt.classList.add("ready");
    });
  }

  update(): void {}

  exit(): void {
    window.removeEventListener("keydown", this.onKey);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") this.begin();
  }

  private begin(): void {
    if (!this.ready) return;
    this.game.audio.unlock();
    this.game.goTitle();
  }
}
