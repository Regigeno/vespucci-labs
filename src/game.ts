import { AudioEngine } from "./audio/AudioEngine";
import { el } from "./ui/dom";
import { SplashScene } from "./scenes/SplashScene";
import { TitleScene } from "./scenes/TitleScene";
import { CutsceneScene } from "./scenes/CutsceneScene";
import { NightScene, type NightOutcome } from "./scenes/NightScene";
import { ShiftCompleteScene } from "./scenes/ShiftCompleteScene";
import { GameOverScene } from "./scenes/GameOverScene";

import { STAGE_H, STAGE_W } from "./constants";

export interface Scene {
  readonly root: HTMLElement;
  enter(): void;
  update(dt: number): void;
  exit(): void;
}

export interface GameParams {
  /** Time multiplier for testing (e.g. ?speed=10). */
  speed: number;
  /** Jump straight to a scene: title, cutscene, night. */
  start: "splash" | "title" | "cutscene" | "night";
  debug: boolean;
}

const COMPLETE_KEY = "vespucci.night1.complete";

export class Game {
  readonly stage: HTMLElement;
  readonly audio = new AudioEngine();
  readonly params: GameParams;
  private readonly fade: HTMLElement;
  private scene: Scene | null = null;
  private last = performance.now();
  private transitioning = false;

  constructor(container: HTMLElement) {
    this.params = readParams();
    this.stage = el("div", "stage");
    this.fade = el("div", "stage-fade");
    this.stage.append(this.fade);
    container.append(this.stage);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    requestAnimationFrame((t) => this.loop(t));
    if (this.params.debug) (window as unknown as { __game: Game }).__game = this;
  }

  start(): void {
    switch (this.params.start) {
      case "title":
        this.audio.unlock();
        this.goTitle(true);
        break;
      case "cutscene":
        this.audio.unlock();
        this.goCutscene(true);
        break;
      case "night":
        this.audio.unlock();
        this.goNight(true);
        break;
      default:
        this.setScene(new SplashScene(this));
    }
  }

  get nightOneComplete(): boolean {
    try {
      return localStorage.getItem(COMPLETE_KEY) === "1";
    } catch {
      return false;
    }
  }

  goTitle(instant = false): void {
    this.transition(() => new TitleScene(this), instant ? 0 : 1.2);
  }

  goCutscene(instant = false): void {
    this.transition(() => new CutsceneScene(this), instant ? 0 : 1.6);
  }

  goNight(instant = false): void {
    this.transition(() => new NightScene(this), instant ? 0 : 0.8);
  }

  goShiftComplete(outcome: NightOutcome): void {
    try {
      localStorage.setItem(COMPLETE_KEY, "1");
    } catch {
      // storage unavailable; the badge is cosmetic
    }
    this.transition(() => new ShiftCompleteScene(this, outcome), 2);
  }

  goGameOver(outcome: NightOutcome): void {
    this.transition(() => new GameOverScene(this, outcome), 0);
  }

  /** Convert a pointer position to stage pixels. */
  toStage(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.stage.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * STAGE_W,
      y: ((clientY - rect.top) / rect.height) * STAGE_H,
    };
  }

  private transition(make: () => Scene, seconds: number): void {
    if (this.transitioning) return;
    if (seconds <= 0 || !this.scene) {
      this.setScene(make());
      return;
    }
    this.transitioning = true;
    this.fade.style.transitionDuration = `${seconds / 2}s`;
    this.fade.classList.add("on");
    window.setTimeout(() => {
      this.setScene(make());
      this.fade.classList.remove("on");
      this.transitioning = false;
    }, (seconds / 2) * 1000);
  }

  private setScene(next: Scene): void {
    if (this.scene) {
      this.scene.exit();
      this.scene.root.remove();
    }
    this.scene = next;
    this.stage.insertBefore(next.root, this.fade);
    next.enter();
  }

  private loop(now: number): void {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const dt = real * this.params.speed;
    this.audio.update(real);
    this.scene?.update(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  private resize(): void {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    this.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
}

function readParams(): GameParams {
  const q = new URLSearchParams(window.location.search);
  const speed = Number(q.get("speed") ?? "1");
  const start = q.get("start");
  return {
    speed: Number.isFinite(speed) && speed > 0 ? Math.min(speed, 60) : 1,
    start: start === "title" || start === "cutscene" || start === "night" ? start : "splash",
    debug: q.has("debug"),
  };
}
