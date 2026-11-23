import { clockLabel } from "../sim/night";
import type { AgentId, LogEntry, NodeId } from "../sim/types";
import { asset, el } from "../ui/dom";
import { CameraFeed } from "./CameraFeed";
import { CAMERAS, cameraFor, feedImage } from "./cameras";

export type TerminalPage = "cameras" | "seal" | "comms" | "log";
export const PAGES: TerminalPage[] = ["cameras", "seal", "comms", "log"];

export interface TerminalCallbacks {
  onPage(page: TerminalPage): void;
  onCamera(node: NodeId): void;
  onSealToggle(): void;
  onHold(active: boolean): void;
  onLower(): void;
}

export interface TerminalView {
  elapsed: number;
  secondsPerHour: number;
  clock: string;
  locations: Record<AgentId, NodeId>;
  seal: { shut: boolean; heat: number; forcedOpen: boolean };
  relockBelow: number;
  heatGainShut: number;
  coolOpen: number;
  contact: { remaining: number; total: number } | null;
  linkProgress: number;
  linkHold: number;
  linkLine: string;
  log: LogEntry[];
}

interface TranscriptEntry {
  speaker: "gpt" | "sys";
  text: string;
  at: number;
  node: HTMLElement;
  shown: number;
}

export class Terminal {
  readonly root: HTMLElement;
  page: TerminalPage = "cameras";
  camera: NodeId = "cell_gpt";
  private isOpen = false;
  private readonly tabs = new Map<TerminalPage, HTMLButtonElement>();
  private readonly pages = new Map<TerminalPage, HTMLElement>();
  private readonly mapButtons = new Map<NodeId, HTMLButtonElement>();
  private readonly feed = new CameraFeed();
  private readonly flagged = new Set<NodeId>();
  private readonly clockEl: HTMLElement;
  private readonly lockBanner: HTMLElement;
  private lastFeedSrc = "";

  // seal page
  private readonly sealDoorPanel: HTMLElement;
  private readonly sealStatus: HTMLElement;
  private readonly sealDetail: HTMLElement;
  private readonly heatFill: HTMLElement;
  private readonly heatValue: HTMLElement;
  private readonly heatRate: HTMLElement;
  private readonly sealButton: HTMLButtonElement;

  // comms page
  private readonly transcriptEl: HTMLElement;
  private readonly transcript: TranscriptEntry[] = [];
  private readonly contactPanel: HTMLElement;
  private readonly contactFill: HTMLElement;
  private readonly contactTime: HTMLElement;
  private readonly holdButton: HTMLButtonElement;
  private readonly holdFill: HTMLElement;
  private readonly holdLabel: HTMLElement;
  private readonly gptChannel: HTMLElement;
  private readonly gptChannelStatus: HTMLElement;
  private readonly linkLineEl: HTMLElement;

  // log page
  private readonly logList: HTMLElement;
  private logCount = 0;

  constructor(cb: TerminalCallbacks) {
    this.clockEl = el("span", "term-clock");
    const tabBar = el("nav", "term-tabs");
    PAGES.forEach((page, i) => {
      const tab = el("button", "term-tab", [el("kbd", "", [String(i + 1)]), page.toUpperCase()]);
      tab.addEventListener("click", () => cb.onPage(page));
      this.tabs.set(page, tab);
      tabBar.append(tab);
    });

    // ---- cameras
    const map = el("div", "cam-map", [
      el("div", "cam-map-title", ["FACILITY MAP · B2"]),
      el("div", "cam-map-office", ["OFFICE", el("small", "", ["YOU"])]),
    ]);
    for (const cam of CAMERAS) {
      const b = el("button", `cam-room ${cam.node === "spine" ? "corridor" : ""}`, [
        el("span", "cam-room-code", [`CAM ${cam.code}`]),
        el("span", "cam-room-label", [cam.label]),
      ]);
      b.style.cssText = `left:${cam.map.x}px;top:${cam.map.y}px;width:${cam.map.w}px;height:${cam.map.h}px;`;
      b.addEventListener("click", () => cb.onCamera(cam.node));
      this.mapButtons.set(cam.node, b);
      map.append(b);
    }
    this.pages.set("cameras", el("section", "term-page page-cameras", [this.feed.root, map]));

    // ---- seal
    this.sealDoorPanel = el("div", "seal-door-panel", [], { style: `background-image:url(${asset("seal_texture.jpg")})` });
    this.sealStatus = el("div", "seal-status");
    this.sealDetail = el("div", "seal-detail");
    this.heatFill = el("div", "heat-fill");
    this.heatValue = el("span", "heat-value");
    this.heatRate = el("span", "heat-rate");
    this.sealButton = el("button", "seal-button");
    this.sealButton.addEventListener("click", () => cb.onSealToggle());
    this.pages.set(
      "seal",
      el("section", "term-page page-seal", [
        el("div", "seal-door", [el("div", "seal-door-void", ["AIRLOCK"]), this.sealDoorPanel, el("div", "seal-door-frame")]),
        el("div", "seal-controls", [
          el("div", "seal-heading", ["AIRLOCK SEAL · DOOR B2-07"]),
          this.sealStatus,
          this.sealDetail,
          el("div", "heat-block", [
            el("div", "heat-head", [el("span", "", ["SEAL HEAT"]), this.heatValue, this.heatRate]),
            el("div", "heat-gauge", [
              this.heatFill,
              el("div", "heat-mark relock", [el("span", "", ["RELOCK 40%"])]),
              el("div", "heat-mark limit", [el("span", "", ["LIMIT"])]),
            ]),
          ]),
          this.sealButton,
          el("p", "seal-note", [
            "A shut seal blocks every entry from the airlock. It heats while shut and cools while open. At 100% it forces itself open and cannot relock until it cools below 40%.",
          ]),
        ]),
      ]),
    );

    // ---- comms
    this.gptChannelStatus = el("span", "chan-status", ["IDLE"]);
    this.gptChannel = el("div", "chan active", [el("span", "chan-name", ["GPT"]), el("span", "chan-cell", ["CELL 03"]), this.gptChannelStatus]);
    const muted = (name: string, cell: string) =>
      el("div", "chan muted", [el("span", "chan-name", [name]), el("span", "chan-cell", [cell]), el("span", "chan-status", ["NO TRAFFIC"])]);
    this.transcriptEl = el("div", "transcript");
    this.contactFill = el("div", "contact-fill");
    this.contactTime = el("span", "contact-time");
    this.contactPanel = el("div", "contact", [
      el("div", "contact-head", [el("span", "contact-title", ["INCOMING CONTACT · GPT"]), this.contactTime]),
      el("div", "contact-bar", [this.contactFill]),
    ]);
    this.holdFill = el("div", "hold-fill");
    this.holdLabel = el("span", "hold-label", ["HOLD TO MAINTAIN LINK"]);
    this.holdButton = el("button", "hold-button", [this.holdFill, this.holdLabel, el("small", "", ["mouse or F"])]);
    const release = () => cb.onHold(false);
    this.holdButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.holdButton.setPointerCapture(e.pointerId);
      cb.onHold(true);
    });
    this.holdButton.addEventListener("pointerup", release);
    this.holdButton.addEventListener("pointercancel", release);
    this.holdButton.addEventListener("lostpointercapture", release);
    this.linkLineEl = el("div", "link-line");
    this.pages.set(
      "comms",
      el("section", "term-page page-comms", [
        el("aside", "channels", [
          el("div", "channels-title", ["CHANNELS"]),
          this.gptChannel,
          muted("GEMINI", "CELL 04"),
          muted("CLAUDE", "CELL 05"),
          muted("GROK", "CELL 06"),
          muted("MUSE", "CELL 07"),
          muted("NEMOTRON", "CELL 08"),
          muted("INKLING", "CELL 09"),
        ]),
        el("div", "conversation", [this.transcriptEl, this.linkLineEl, this.contactPanel, this.holdButton]),
      ]),
    );

    // ---- log
    this.logList = el("ol", "log-list");
    this.pages.set("log", el("section", "term-page page-log", [el("div", "log-title", ["FACILITY EVENT LOG · VERIFIED"]), this.logList]));

    this.lockBanner = el("div", "term-lock", ["LINK ACTIVE · TERMINAL LOCKED TO COMMS"]);
    const lower = el("button", "term-lower", ["▼  Lower terminal  ·  Space"]);
    lower.addEventListener("click", () => cb.onLower());

    this.root = el("div", "terminal", [
      el("div", "crt", [
        el("div", "crt-screen", [
          el("header", "term-header", [
            el("span", "term-brand", ["VESPUCCI LABS // CONTAINMENT TERMINAL"]),
            el("span", "term-op", ["OPERATOR: M. HUNTER · STATION 4"]),
            this.clockEl,
          ]),
          tabBar,
          el("div", "term-body", [...this.pages.values()]),
          el("footer", "term-footer", ["SPACE lower terminal   ·   1–4 pages   ·   S seal   ·   hold F maintain link"]),
          this.lockBanner,
        ]),
        el("div", "crt-glass"),
      ]),
      lower,
    ]);
    this.applyPage();
  }

  get open(): boolean {
    return this.isOpen;
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
    this.root.classList.toggle("open", open);
  }

  setPage(page: TerminalPage): void {
    this.page = page;
    this.applyPage();
    if (page === "cameras") this.flagged.delete(this.camera);
  }

  setCamera(node: NodeId): void {
    this.camera = node;
    this.flagged.delete(node);
    for (const [n, b] of this.mapButtons) b.classList.toggle("selected", n === node);
  }

  /** A camera saw movement: static on that feed now, and a marker until it's checked. */
  flagMovement(nodes: NodeId[]): void {
    for (const n of nodes) {
      if (n === "office") continue;
      if (this.isOpen && this.page === "cameras" && n === this.camera) this.feed.disturb(1.4);
      else this.flagged.add(n);
    }
  }

  addTranscript(speaker: "gpt" | "sys", text: string, at: number): void {
    const node = el("div", `msg ${speaker}`, [
      el("span", "msg-time", [""]),
      el("span", "msg-who", [speaker === "gpt" ? "GPT" : "SYS"]),
      el("span", "msg-text"),
    ]);
    this.transcriptEl.append(node);
    this.transcript.push({ speaker, text, at, node, shown: speaker === "sys" ? text.length : 0 });
    if (speaker === "sys") (node.querySelector(".msg-text") as HTMLElement).textContent = text;
    while (this.transcript.length > 40) this.transcript.shift()?.node.remove();
  }

  render(dt: number, v: TerminalView): void {
    this.clockEl.textContent = v.clock;
    const locked = v.linkProgress > 0;
    this.root.classList.toggle("locked", locked);
    for (const [page, tab] of this.tabs) {
      tab.classList.toggle("active", page === this.page);
      tab.disabled = locked && page !== "comms";
    }
    this.tabs.get("comms")!.classList.toggle("alert", v.contact !== null);
    this.tabs.get("cameras")!.classList.toggle("alert", this.flagged.size > 0);
    for (const [n, b] of this.mapButtons) b.classList.toggle("flagged", this.flagged.has(n));

    // Typing transcript runs even when the terminal is lowered so it's caught up when raised.
    for (const entry of this.transcript) {
      if (entry.shown >= entry.text.length) continue;
      entry.shown = Math.min(entry.text.length, entry.shown + dt * 42);
      (entry.node.querySelector(".msg-text") as HTMLElement).textContent = entry.text.slice(0, Math.floor(entry.shown));
      (entry.node.querySelector(".msg-time") as HTMLElement).textContent = clockLabel(entry.at, v.secondsPerHour);
      this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }

    if (!this.isOpen) return;

    if (this.page === "cameras") {
      const cam = cameraFor(this.camera);
      if (cam) {
        const src = feedImage(this.camera, v.locations);
        const changed = src !== this.lastFeedSrc;
        this.feed.show(cam, src, false);
        if (changed && this.lastFeedSrc) this.feed.disturb(0.9);
        this.lastFeedSrc = src;
      }
      this.feed.update(dt, v.elapsed, v.secondsPerHour);
    }

    if (this.page === "seal") this.renderSeal(v);
    if (this.page === "comms") this.renderComms(v);
    if (this.page === "log" && v.log.length !== this.logCount) this.renderLog(v);
  }

  /** Camera cut: brief static. */
  cut(): void {
    this.lastFeedSrc = "";
    this.feed.disturb(0.28);
  }

  private renderSeal(v: TerminalView): void {
    const { shut, heat, forcedOpen } = v.seal;
    this.sealDoorPanel.classList.toggle("down", shut);
    this.sealStatus.textContent = forcedOpen ? "THERMAL LOCKOUT" : shut ? "SEAL SHUT" : "SEAL OPEN";
    this.sealStatus.className = `seal-status ${forcedOpen ? "lockout" : shut ? "shut" : "open"}`;
    this.sealDetail.textContent = forcedOpen
      ? `Seal vented. Relock available below ${v.relockBelow}%.`
      : shut
        ? "Airlock entry blocked."
        : "Airlock passage open to office.";
    this.heatFill.style.width = `${heat}%`;
    this.heatFill.classList.toggle("hot", heat >= 75);
    this.heatValue.textContent = `${heat.toFixed(0)}%`;
    this.heatRate.textContent = shut ? `+${v.heatGainShut.toFixed(2)}%/s` : heat > 0 ? `−${v.coolOpen.toFixed(2)}%/s` : "STABLE";
    this.sealButton.textContent = shut ? "OPEN SEAL  [S]" : "SHUT SEAL  [S]";
    this.sealButton.classList.toggle("shut", shut);
    this.sealButton.disabled = forcedOpen && !shut;
  }

  private renderComms(v: TerminalView): void {
    const contact = v.contact;
    this.contactPanel.classList.toggle("live", contact !== null);
    this.gptChannel.classList.toggle("calling", contact !== null);
    this.gptChannelStatus.textContent = v.linkProgress > 0 ? "LINKED" : contact ? "CALLING" : "IDLE";
    if (contact) {
      this.contactFill.style.width = `${(contact.remaining / contact.total) * 100}%`;
      this.contactTime.textContent = `${Math.ceil(contact.remaining)}s`;
    } else {
      this.contactFill.style.width = "0%";
      this.contactTime.textContent = "NO ACTIVE CONTACT";
    }
    const progress = v.linkProgress / v.linkHold;
    this.holdButton.disabled = contact === null;
    this.holdButton.classList.toggle("holding", v.linkProgress > 0);
    this.holdFill.style.width = `${progress * 100}%`;
    this.holdLabel.textContent = v.linkProgress > 0 ? `MAINTAINING LINK · ${Math.max(0, v.linkHold - v.linkProgress).toFixed(1)}s` : "HOLD TO MAINTAIN LINK";
    this.linkLineEl.textContent = v.linkProgress > 0 ? v.linkLine : "";
    this.linkLineEl.classList.toggle("show", v.linkProgress > 0);
  }

  private renderLog(v: TerminalView): void {
    this.logCount = v.log.length;
    const items = v.log
      .slice(-60)
      .reverse()
      .map((e) => el("li", "", [el("time", "", [clockLabel(e.at, v.secondsPerHour)]), el("span", "", [e.text])]));
    this.logList.replaceChildren(...items);
  }

  private applyPage(): void {
    for (const [page, node] of this.pages) node.classList.toggle("active", page === this.page);
    this.lastFeedSrc = "";
  }
}
