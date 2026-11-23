import type { Game, Scene } from "../game";
import { asset, el, img } from "../ui/dom";
import type { NightOutcome } from "./NightScene";

const AUTO_RETURN = 14;

export class ShiftCompleteScene implements Scene {
  readonly root: HTMLElement;
  private t = 0;
  private leaving = false;
  private readonly countdown: HTMLElement;

  constructor(
    private readonly game: Game,
    outcome: NightOutcome,
  ) {
    const stat = (value: string, label: string) => el("div", "sc-stat", [el("strong", "", [value]), el("span", "", [label])]);
    this.countdown = el("span", "sc-countdown");
    const back = el("button", "title-btn primary", ["Return to title"]);
    back.addEventListener("click", () => this.leave());

    this.root = el("div", "scene shift-complete", [
      el("div", "sc-bg", [img(asset("title_bg.jpg"))]),
      el("div", "sc-shade"),
      el("div", "sc-card", [
        el("div", "sc-kicker", ["Night 1 · 12:00 AM – 6:00 AM"]),
        el("h1", "sc-title", ["Shift complete"]),
        el("p", "sc-quote", ["“Go home, Milo. Get some sleep. Same time tomorrow.”", el("cite", "", ["Amos Crawford"])]),
        el("div", "sc-stats", [
          stat(String(outcome.linksCompleted), "GPT links maintained"),
          stat(String(outcome.contactsMissed), "Calls missed"),
          stat(String(outcome.sealShuts), "Seal closures"),
          stat(`${outcome.peakHeat}%`, "Peak seal heat"),
        ]),
        el("p", "sc-thanks", ["Thank you for playing the Vespucci Labs demo. Six nights remain on Milo's contract."]),
        el("div", "sc-actions", [back, this.countdown]),
      ]),
    ]);
    this.onKey = this.onKey.bind(this);
  }

  enter(): void {
    this.game.audio.setRain(0.25, false, 4);
    this.game.audio.setHum(0, 2);
    window.addEventListener("keydown", this.onKey);
  }

  update(dt: number): void {
    this.t += dt / this.game.params.speed;
    const left = Math.max(0, Math.ceil(AUTO_RETURN - this.t));
    this.countdown.textContent = `Returning to title in ${left}s`;
    if (this.t >= AUTO_RETURN) this.leave();
  }

  exit(): void {
    window.removeEventListener("keydown", this.onKey);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === "Escape" || e.key === " ") this.leave();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.click();
    this.game.goTitle();
  }
}
