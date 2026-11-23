import { STAGE_H, STAGE_W } from "../constants";
import { asset, el, img } from "../ui/dom";

/** Inner office canvas is wider than the stage so the player can look around. */
const INNER_W = 1904;
const INNER_H = 1071;
const PAN_X = INNER_W - STAGE_W;
const PAN_Y = INNER_H - STAGE_H;

/** Hotspots in percentages of the office photo. */
const SPOTS = {
  monitor: { left: 35.2, top: 47.4, width: 13.9, height: 20.8 },
  phone: { left: 7.0, top: 66.5, width: 18, height: 21 },
  doorway: { left: 64.2, top: 21, width: 17.6, height: 68.4 },
  lampOpen: { left: 92.3, top: 43.8 },
  lampShut: { left: 92.1, top: 36.9 },
  lampAirlock: { left: 92.98, top: 23.6 },
  tube: { left: 47.4, top: 0, width: 25, height: 8.4 },
};

const pct = (r: { left: number; top: number; width?: number; height?: number }): string =>
  `left:${r.left}%;top:${r.top}%;` + (r.width !== undefined ? `width:${r.width}%;height:${r.height}%;` : "");

export interface OfficeViewState {
  sealShut: boolean;
  forcedOpen: boolean;
  heat: number;
  gptInAirlock: boolean;
  ringing: boolean;
  onCall: boolean;
  contactOpen: boolean;
  terminalOpen: boolean;
}

export class OfficeView {
  readonly root: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly shutter: HTMLElement;
  private readonly presence: HTMLElement;
  private readonly tube: HTMLElement;
  private readonly lampOpen: HTMLElement;
  private readonly lampShut: HTMLElement;
  private readonly lampAirlock: HTMLElement;
  private readonly phone: HTMLElement;
  private readonly monitor: HTMLElement;
  private readonly heatGlow: HTMLElement;
  private target = { x: 0.5, y: 0.5 };
  private pan = { x: 0.5, y: 0.5 };
  private flickerTimer = 2;
  private time = 0;
  private shake = 0;

  constructor(onMonitor: () => void, onPhone: () => void) {
    this.shutter = el("div", "seal-shutter", [el("div", "seal-shutter-face")], {
      style: `background-image:url(${asset("seal_texture.jpg")})`,
    });
    this.presence = el("div", "presence", [el("div", "presence-ring")]);
    this.heatGlow = el("div", "seal-heat-glow");
    const doorway = el("div", "office-doorway", [this.presence, this.shutter, this.heatGlow], { style: pct(SPOTS.doorway) });

    this.tube = el("div", "office-tube", [], { style: pct(SPOTS.tube) });
    this.lampOpen = el("div", "office-lamp green", [], { style: pct(SPOTS.lampOpen) });
    this.lampShut = el("div", "office-lamp red", [], { style: pct(SPOTS.lampShut) });
    this.lampAirlock = el("div", "office-lamp beacon", [], { style: pct(SPOTS.lampAirlock) });

    this.monitor = el("button", "office-monitor", [
      el("span", "office-monitor-text", ["TERMINAL", el("br"), "click to access"]),
    ], { style: pct(SPOTS.monitor), "aria-label": "Raise terminal" });
    this.monitor.addEventListener("click", onMonitor);

    this.phone = el("button", "office-phone", [el("span", "office-phone-hint", ["E · answer"])], {
      style: pct(SPOTS.phone),
      "aria-label": "Answer phone",
    });
    this.phone.addEventListener("click", onPhone);

    this.inner = el("div", "office-inner", [
      img(asset("office.jpg"), "office-bg"),
      this.tube,
      doorway,
      this.lampOpen,
      this.lampShut,
      this.lampAirlock,
      this.monitor,
      this.phone,
      el("div", "office-dust"),
    ]);
    this.inner.style.width = `${INNER_W}px`;
    this.inner.style.height = `${INNER_H}px`;

    this.root = el("div", "office-view", [this.inner, el("div", "office-shade")]);
  }

  /** Pointer position in stage pixels. */
  look(x: number, y: number): void {
    this.target = { x: Math.min(1, Math.max(0, x / STAGE_W)), y: Math.min(1, Math.max(0, y / STAGE_H)) };
  }

  bump(strength = 1): void {
    this.shake = Math.max(this.shake, strength);
  }

  /** Stage-space point at the monitor, for the zoom-into-terminal transition. */
  monitorOrigin(): string {
    const cx = ((SPOTS.monitor.left + SPOTS.monitor.width / 2) / 100) * INNER_W - this.pan.x * PAN_X;
    const cy = ((SPOTS.monitor.top + SPOTS.monitor.height / 2) / 100) * INNER_H - this.pan.y * PAN_Y;
    return `${cx}px ${cy}px`;
  }

  update(dt: number, s: OfficeViewState): void {
    this.time += dt;
    const edge = (v: number) => {
      // Dead zone in the middle; looking toward an edge pans further.
      const d = v - 0.5;
      return 0.5 + Math.sign(d) * Math.min(0.5, Math.max(0, Math.abs(d) - 0.08) * 1.25);
    };
    if (!s.terminalOpen) {
      const k = Math.min(1, dt * 4);
      this.pan.x += (edge(this.target.x) - this.pan.x) * k;
      this.pan.y += (0.5 + (this.target.y - 0.5) * 0.6 - this.pan.y) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * 18 * this.shake;
    const sy = (Math.random() - 0.5) * 12 * this.shake;
    const tilt = (this.pan.x - 0.5) * -5;
    const breathe = 1.012 + Math.sin(this.time * 0.6) * 0.004;
    this.inner.style.transform = `translate(${-this.pan.x * PAN_X + sx}px, ${-this.pan.y * PAN_Y + sy}px) rotateY(${tilt}deg) scale(${breathe})`;

    this.flickerTimer -= dt;
    if (this.flickerTimer <= 0) {
      this.flickerTimer = 0.05 + (Math.random() < 0.15 ? 0.05 : Math.random() * 4);
      this.tube.style.opacity = String(Math.random() < 0.25 ? 0.15 + Math.random() * 0.4 : 0.9 + Math.random() * 0.1);
    }

    this.shutter.classList.toggle("down", s.sealShut);
    this.lampShut.classList.toggle("on", s.sealShut);
    this.lampOpen.classList.toggle("on", !s.sealShut && !s.forcedOpen);
    this.lampOpen.classList.toggle("blink", s.forcedOpen);
    this.lampAirlock.classList.toggle("on", s.gptInAirlock);
    this.presence.classList.toggle("on", s.gptInAirlock && !s.sealShut);
    this.heatGlow.style.opacity = String(s.sealShut ? Math.max(0, (s.heat - 40) / 60) * 0.85 : 0);
    this.phone.classList.toggle("ringing", s.ringing);
    this.phone.classList.toggle("live", s.onCall);
    this.monitor.classList.toggle("alert", s.contactOpen);
  }
}
