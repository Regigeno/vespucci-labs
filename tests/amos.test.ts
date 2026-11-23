import { describe, expect, it } from "vitest";
import { AmosDirector, type DirectorContext } from "../src/script/amos";
import { GptScript } from "../src/script/gpt";

const ctx: DirectorContext = { gptLocation: "cell_gpt", sealShut: false, heat: 0 };

function advance(director: AmosDirector, seconds: number, context = ctx): void {
  for (let t = 0; t < seconds; t += 0.1) director.update(0.1, context);
}

function said(director: AmosDirector): string[] {
  return director.transcript.map((l) => l.id);
}

describe("Amos on the phone", () => {
  it("rings until answered, then starts the walkthrough", () => {
    const amos = new AmosDirector();
    advance(amos, 5);
    expect(amos.ringing).toBe(true);
    expect(amos.transcript).toHaveLength(0);
    amos.notify({ type: "phoneAnswered" }, ctx);
    advance(amos, 1);
    expect(said(amos)[0]).toBe("t-hello");
  });

  it("puts himself on speaker if Milo never picks up", () => {
    const amos = new AmosDirector();
    advance(amos, 15);
    expect(amos.ringing).toBe(false);
    expect(said(amos)[0]).toBe("t-speaker");
  });

  it("waits for the terminal to be opened, nudging once", () => {
    const amos = new AmosDirector();
    amos.answer();
    advance(amos, 40);
    expect(said(amos)).toContain("t-terminal");
    expect(said(amos)).toContain("t-nudge");
    expect(said(amos)).not.toContain("t-cams");
    amos.notify({ type: "terminalOpened" }, ctx);
    advance(amos, 10);
    expect(said(amos)).toContain("t-cams");
  });

  it("finishes the walkthrough and offers a choice", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "terminalOpened" }, ctx);
    advance(amos, 90);
    expect(said(amos)).toContain("t-check");
    expect(amos.tutorialComplete).toBe(true);
    expect(said(amos).some((id) => id.startsWith("t-check-"))).toBe(true);
  });

  it("replies to the player's choice", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "terminalOpened" }, ctx);
    for (let i = 0; i < 900 && !amos.pendingChoice; i++) amos.update(0.1, ctx);
    expect(amos.pendingChoice?.line.id).toBe("t-check");
    amos.choose("unsure");
    advance(amos, 2);
    expect(said(amos)).toContain("t-check-reply");
  });

  it("interrupts the walkthrough for GPT's first call and resumes afterwards", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "terminalOpened" }, ctx);
    advance(amos, 6);
    amos.notify({ type: "contactOpened", index: 0, deadline: 12 }, ctx);
    advance(amos, 0.2);
    expect(amos.speaking?.line.id).toBe("r-first-contact");
    advance(amos, 120);
    expect(said(amos)).toContain("t-job");
  });

  it("skips explaining Comms once Milo has already completed a link", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "terminalOpened" }, ctx);
    amos.notify({ type: "linkCompleted", from: "cell_gpt", to: "cell_gpt" }, ctx);
    advance(amos, 120);
    expect(said(amos)).not.toContain("t-comms");
    expect(said(amos)).toContain("r-first-link");
  });

  it("drops a stale warning once GPT is back in its cell", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "agentMoved", agent: "gpt", from: "cell_gpt", to: "spine" }, { ...ctx, gptLocation: "spine" });
    advance(amos, 0.2, ctx);
    expect(said(amos).some((id) => id.startsWith("r-spine"))).toBe(false);
  });

  it("comments on a resident the first time its camera is viewed", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "terminalOpened" }, ctx);
    advance(amos, 10);
    amos.notify({ type: "cameraViewed", node: "cell_inkling" }, ctx);
    amos.notify({ type: "cameraViewed", node: "cell_inkling" }, ctx);
    advance(amos, 120);
    expect(said(amos).filter((id) => id === "c-inkling")).toHaveLength(1);
  });

  it("reacts to GPT knowing Sasha's name depending on what Milo told him", () => {
    const amos = new AmosDirector();
    amos.answer();
    amos.notify({ type: "gptMentionedSasha" }, ctx);
    advance(amos, 1);
    expect(said(amos)).toContain("r-sasha-untold");
  });

  it("signs off at dawn", () => {
    const amos = new AmosDirector();
    amos.answer();
    advance(amos, 3);
    amos.notify({ type: "dawn" }, ctx);
    advance(amos, 0.2);
    expect(amos.speaking?.line.id).toBe("dawn");
  });
});

describe("GPT's comms script", () => {
  it("names Sasha on its first call from the airlock", () => {
    const script = new GptScript();
    expect(script.opener("cell_gpt").mentionsSasha).toBeFalsy();
    expect(script.opener("airlock").mentionsSasha).toBe(true);
    expect(script.opener("airlock").mentionsSasha).toBeFalsy();
  });
});
