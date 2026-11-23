import type { Game, Scene } from "../game";
import { NoiseLayer } from "../fx/Noise";
import { el } from "../ui/dom";
import { agentName, type NightOutcome } from "./NightScene";

const AMOS_LINE = "Milo? ...Milo, can you hear me? Say something.";

export class GameOverScene implements Scene {
  readonly root: HTMLElement;
  private readonly noise = new NoiseLayer(320, 180, "go-noise");
  private readonly amos: HTMLElement;
  private t = 0;
  private shown = 0;
  private leaving = false;

  constructor(
    private readonly game: Game,
    outcome: NightOutcome,
  ) {
    this.amos = el("span", "go-amos-text");
    const retry = el("button", "title-btn primary", ["Retry Night 1"]);
    retry.addEventListener("click", () => this.leave("retry"));
    const title = el("button", "title-btn", ["Title screen"]);
    title.addEventListener("click", () => this.leave("title"));

    this.root = el("div", "scene game-over", [
      this.noise.canvas,
      el("div", "go-content", [
        el("div", "go-title", ["SIGNAL LOST"], { "data-text": "SIGNAL LOST" }),
        el("p", "go-detail", [`${agentName(outcome.agent)} entered the office at ${outcome.clock}.`]),
        el("p", "go-amos", [el("span", "go-amos-name", ["AMOS · PHONE"]), this.amos]),
        el("div", "go-actions", [retry, title]),
        el("p", "go-tip", [
          outcome.contactsMissed > 0
            ? "Every missed GPT call moves it one room closer. Shut the seal when it reaches the airlock."
            : "Watch the seal heat. A forced-open seal can't stop anything.",
        ]),
      ]),
    ]);
    this.onKey = this.onKey.bind(this);
  }

  enter(): void {
    this.game.audio.setHum(0);
    this.game.audio.setRain(0.3, true, 1);
    this.game.audio.staticBurst(1.6, 0.18);
    window.addEventListener("keydown", this.onKey);
  }

  update(dt: number): void {
    const real = dt / this.game.params.speed;
    this.t += real;
    this.noise.draw(real, Math.max(0.35, 1 - this.t * 0.4));
    if (this.t > 1.8 && this.shown < AMOS_LINE.length) {
      if (this.shown === 0) this.game.audio.speak("amos", 3.2);
      this.shown = Math.min(AMOS_LINE.length, this.shown + real * 26);
      this.amos.textContent = AMOS_LINE.slice(0, Math.floor(this.shown));
    }
    this.root.classList.toggle("ready", this.t > 1.2);
  }

  exit(): void {
    window.removeEventListener("keydown", this.onKey);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter") this.leave("retry");
    if (e.key === "Escape") this.leave("title");
  }

  private leave(to: "retry" | "title"): void {
    if (this.leaving || this.t < 1.2) return;
    this.leaving = true;
    this.game.audio.click();
    if (to === "retry") this.game.goNight();
    else this.game.goTitle();
  }
}
