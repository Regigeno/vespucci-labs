import { STAGE_H, STAGE_W } from "../constants";
import type { Game, Scene } from "../game";
import { RainLayer } from "../fx/Rain";
import { asset, el, img } from "../ui/dom";

export class TitleScene implements Scene {
  readonly root: HTMLElement;
  private readonly bg: HTMLImageElement;
  private readonly logo: HTMLElement;
  private readonly rain: RainLayer;
  private readonly panel: HTMLElement;
  private mouse = { x: 0.5, y: 0.5 };
  private eased = { x: 0.5, y: 0.5 };
  private thunderIn = 6;
  private time = 0;
  private leaving = false;

  constructor(private readonly game: Game) {
    this.bg = img(asset("title_bg.jpg"), "title-bg");
    this.rain = new RainLayer({ width: STAGE_W, height: STAGE_H, density: 520, wind: 0.12, lens: false, horizon: 0.62 });

    const play = this.button("Begin Shift", "primary", () => this.play());
    const controls = this.button("Controls", "", () => this.togglePanel("controls"));
    const settings = this.button("Settings", "", () => this.togglePanel("settings"));

    this.logo = el("div", "title-logo", [
      el("div", "title-kicker", ["Containment Division"]),
      el("h1", "title-name", ["VESPUCCI", el("span", "", ["LABS"])]),
      el("div", "title-sub", ["Night Operator Program"]),
      el("nav", "title-menu", [play, controls, settings]),
    ]);

    this.panel = el("div", "title-panel");

    const badge = game.nightOneComplete
      ? el("div", "title-badge", ["Night 1 cleared"])
      : null;

    this.root = el("div", "scene title", [
      el("div", "title-bg-wrap", [this.bg]),
      el("div", "fog fog-a"),
      el("div", "fog fog-b"),
      this.rain.canvas,
      el("div", "title-vignette"),
      this.logo,
      this.panel,
      badge,
      el("div", "title-footer", [
        el("span", "", ["Demo build · Night 1 of 7"]),
        el("span", "", ["Vespucci Labs is a work of fiction."]),
      ]),
    ]);

    this.root.addEventListener("pointermove", (e) => {
      const p = this.game.toStage(e.clientX, e.clientY);
      this.mouse = { x: p.x / STAGE_W, y: p.y / STAGE_H };
    });
    this.onKey = this.onKey.bind(this);
  }

  enter(): void {
    this.game.audio.setRain(0.7, false, 2);
    this.game.audio.setHum(0);
    this.game.audio.setRinging(false);
    window.addEventListener("keydown", this.onKey);
  }

  update(dt: number): void {
    this.time += dt;
    this.eased.x += (this.mouse.x - this.eased.x) * Math.min(1, dt * 3);
    this.eased.y += (this.mouse.y - this.eased.y) * Math.min(1, dt * 3);
    const dx = this.eased.x - 0.5;
    const dy = this.eased.y - 0.5;
    this.bg.style.transform = `scale(1.12) translate(${-dx * 30}px, ${-dy * 18}px)`;
    this.logo.style.transform = `perspective(1200px) rotateY(${dx * 7}deg) rotateX(${-dy * 5}deg) translate(${dx * 12}px, ${dy * 8}px)`;

    this.thunderIn -= dt;
    if (this.thunderIn <= 0) {
      this.thunderIn = 14 + Math.random() * 12;
      this.rain.lightning();
      this.root.classList.add("flash");
      window.setTimeout(() => this.root.classList.remove("flash"), 160);
      window.setTimeout(() => this.game.audio.thunder(), 700);
    }
    this.rain.update(dt);
    this.rain.draw();
  }

  exit(): void {
    window.removeEventListener("keydown", this.onKey);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter") this.play();
    if (e.key === "Escape") this.panel.classList.remove("open");
  }

  private play(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.click();
    this.game.goCutscene();
  }

  private button(label: string, variant: string, onClick: () => void): HTMLButtonElement {
    const b = el("button", `title-btn ${variant}`, [label]);
    b.addEventListener("mouseenter", () => this.game.audio.hover());
    b.addEventListener("click", onClick);
    return b;
  }

  private togglePanel(kind: "controls" | "settings"): void {
    this.game.audio.click();
    if (this.panel.classList.contains("open") && this.panel.dataset.kind === kind) {
      this.panel.classList.remove("open");
      return;
    }
    this.panel.dataset.kind = kind;
    this.panel.replaceChildren(...(kind === "controls" ? this.controlsPanel() : this.settingsPanel()));
    this.panel.classList.add("open");
  }

  private controlsPanel(): Node[] {
    const rows: Array<[string, string]> = [
      ["Look around", "Move the mouse"],
      ["Raise / lower terminal", "Click the monitor or press Space"],
      ["Terminal pages", "1 Cameras · 2 Seal · 3 Comms · 4 Log"],
      ["Shut / open the seal", "Seal page button, or S"],
      ["Maintain link with GPT", "Hold the Comms button, or hold F"],
      ["Answer the phone", "Click the phone or press E"],
    ];
    return [
      el("h2", "", ["Controls"]),
      el(
        "dl",
        "controls-list",
        rows.flatMap(([k, v]) => [el("dt", "", [k]), el("dd", "", [v])]),
      ),
    ];
  }

  private settingsPanel(): Node[] {
    const slider = el("input", "volume", [], {
      type: "range",
      min: "0",
      max: "1",
      step: "0.05",
      value: String(this.game.audio.getVolume()),
      "aria-label": "Master volume",
    });
    const readout = el("span", "volume-readout", [`${Math.round(this.game.audio.getVolume() * 100)}%`]);
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      this.game.audio.setVolume(v);
      readout.textContent = `${Math.round(v * 100)}%`;
    });
    return [el("h2", "", ["Settings"]), el("label", "setting-row", ["Master volume", slider, readout])];
  }
}
