import type { Choice, DialogueLine } from "../script/dialogue";
import { SPEAKER_NAMES } from "../script/dialogue";
import { el } from "../ui/dom";

export interface HudState {
  clock: string;
  sealShut: boolean;
  forcedOpen: boolean;
  heat: number;
  ringing: boolean;
  onCall: boolean;
  callSeconds: number;
  amosTalking: boolean;
  contactRemaining: number | null;
  commsVisible: boolean;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly sealLabel: HTMLElement;
  private readonly sealHeat: HTMLElement;
  private readonly sealChip: HTMLElement;
  private readonly phoneChip: HTMLElement;
  private readonly phoneLabel: HTMLElement;
  private readonly phoneSub: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly subName: HTMLElement;
  private readonly subText: HTMLElement;
  private readonly choices: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly alertTime: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;
  private currentLineId: string | null = null;
  private currentChoiceId: string | null = null;
  private lastClock = "";

  constructor(onPhone: () => void, onChoice: (id: string) => void) {
    this.clock = el("div", "hud-clock");
    this.sealLabel = el("span", "hud-seal-label");
    this.sealHeat = el("i", "hud-seal-heat");
    this.sealChip = el("div", "hud-chip hud-seal", [
      el("span", "hud-chip-k", ["SEAL"]),
      this.sealLabel,
      el("span", "hud-seal-bar", [this.sealHeat]),
    ]);
    this.phoneLabel = el("span", "hud-phone-label");
    this.phoneSub = el("span", "hud-phone-sub");
    this.phoneChip = el("button", "hud-chip hud-phone", [
      el("span", "hud-phone-icon"),
      el("span", "hud-phone-text", [this.phoneLabel, this.phoneSub]),
    ]);
    this.phoneChip.addEventListener("click", onPhone);

    this.subName = el("span", "sub-name");
    this.subText = el("span", "sub-text");
    this.subtitle = el("div", "subtitle hud-subtitle", [this.subName, this.subText]);
    this.choices = el("div", "hud-choices");
    this.choices.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-choice]");
      if (target?.dataset.choice) onChoice(target.dataset.choice);
    });

    this.alertTime = el("span", "hud-alert-time");
    this.alert = el("div", "hud-alert", [el("span", "hud-alert-dot"), "GPT IS REQUESTING CONTACT", this.alertTime, el("small", "", ["Comms · 3"])]);
    this.toast = el("div", "hud-toast");

    this.root = el("div", "hud", [
      el("div", "hud-top", [
        el("div", "hud-night", [el("strong", "", ["NIGHT 1"]), el("span", "", ["Vespucci Labs · Station 4"])]),
        this.clock,
      ]),
      this.alert,
      this.toast,
      el("div", "hud-bottom", [this.sealChip, el("div", "hud-dialogue", [this.subtitle, this.choices]), this.phoneChip]),
    ]);
  }

  showToast(text: string, seconds = 2.2): void {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    this.toastTimer = seconds;
  }

  setLine(line: DialogueLine | null): void {
    const id = line?.id ?? null;
    if (id === this.currentLineId) return;
    this.currentLineId = id;
    if (!line) {
      this.subtitle.classList.remove("show");
      return;
    }
    this.subName.textContent = `${SPEAKER_NAMES[line.speaker]} · PHONE`;
    this.subText.textContent = line.text;
    this.subtitle.classList.add("show");
  }

  setChoices(lineId: string | null, choices: Choice[] | null): void {
    if (lineId === this.currentChoiceId) return;
    this.currentChoiceId = lineId;
    if (!choices) {
      this.choices.classList.remove("show");
      this.choices.replaceChildren();
      return;
    }
    this.choices.replaceChildren(
      el("span", "hud-choices-label", ["Reply"]),
      ...choices.map((c) => el("button", "hud-choice", [c.label], { "data-choice": c.id })),
    );
    this.choices.classList.add("show");
  }

  update(dt: number, s: HudState): void {
    if (s.clock !== this.lastClock) {
      const hourChanged = this.lastClock !== "" && s.clock.endsWith(":00 AM") && !this.lastClock.endsWith(":00 AM");
      this.lastClock = s.clock;
      this.clock.textContent = s.clock;
      if (hourChanged) {
        this.clock.classList.remove("pulse");
        void this.clock.offsetWidth;
        this.clock.classList.add("pulse");
      }
    }
    this.sealLabel.textContent = s.forcedOpen ? "LOCKOUT" : s.sealShut ? "SHUT" : "OPEN";
    this.sealChip.dataset.state = s.forcedOpen ? "lockout" : s.sealShut ? "shut" : "open";
    this.sealHeat.style.width = `${s.heat}%`;
    this.sealHeat.classList.toggle("hot", s.heat >= 75);

    this.phoneChip.dataset.state = s.ringing ? "ringing" : s.onCall ? "call" : "idle";
    this.phoneChip.classList.toggle("talking", s.amosTalking);
    if (s.ringing) {
      this.phoneLabel.textContent = "INCOMING CALL";
      this.phoneSub.textContent = "Press E or click the phone";
    } else {
      const m = Math.floor(s.callSeconds / 60);
      const sec = Math.floor(s.callSeconds % 60);
      this.phoneLabel.textContent = "AMOS CRAWFORD";
      this.phoneSub.textContent = `On call · ${m}:${sec.toString().padStart(2, "0")}`;
    }

    const alerting = s.contactRemaining !== null && !s.commsVisible;
    this.alert.classList.toggle("show", alerting);
    if (s.contactRemaining !== null) this.alertTime.textContent = `${Math.ceil(s.contactRemaining)}s`;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove("show");
    }
  }
}
