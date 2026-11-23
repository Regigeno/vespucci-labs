export type AgentId =
  | "gpt"
  | "gemini"
  | "claude"
  | "grok"
  | "muse"
  | "nemotron"
  | "inkling";

export type CellId =
  | "cell_gpt"
  | "cell_gemini"
  | "cell_claude"
  | "cell_grok"
  | "cell_muse"
  | "cell_nemotron"
  | "cell_inkling";

export type NodeId = "office" | "airlock" | "spine" | CellId;

export const ROSTER: readonly AgentId[] = [
  "gpt",
  "gemini",
  "claude",
  "grok",
  "muse",
  "nemotron",
  "inkling",
];

export const AGENT_NAMES: Record<AgentId, string> = {
  gpt: "GPT",
  gemini: "Gemini",
  claude: "Claude",
  grok: "Grok",
  muse: "Muse",
  nemotron: "Nemotron",
  inkling: "Inkling",
};

export function homeCell(agent: AgentId): CellId {
  return `cell_${agent}` as CellId;
}

export type NightPhase = "active" | "dawn" | "breached";

export interface SealState {
  shut: boolean;
  /** 0–100 */
  heat: number;
  /** True after a thermal force-open, until heat drops below the relock threshold. */
  forcedOpen: boolean;
}

export interface GptContact {
  openedAt: number;
  deadline: number;
  /** Index into the night's contact sequence, used to pick dialogue. */
  index: number;
}

export interface GptState {
  nextContactAt: number;
  contact: GptContact | null;
  linkProgress: number;
  contactsOpened: number;
  linksCompleted: number;
  contactsMissed: number;
}

export interface LogEntry {
  at: number;
  text: string;
}

export interface NightState {
  phase: NightPhase;
  elapsed: number;
  hour: number;
  seal: SealState;
  locations: Record<AgentId, NodeId>;
  gpt: GptState;
  breachedBy: AgentId | null;
  log: LogEntry[];
}

export interface NightInput {
  /** True while the player is holding "Maintain link" on the Comms page. */
  holdLink: boolean;
  /** One-shot seal command for this tick. */
  sealCommand: "shut" | "open" | null;
}

export type SimEvent =
  | { type: "hour"; hour: number }
  | { type: "contactOpened"; index: number; deadline: number }
  | { type: "linkStarted" }
  | { type: "linkBroken" }
  | { type: "linkCompleted"; from: NodeId; to: NodeId }
  | { type: "contactMissed"; from: NodeId }
  | { type: "agentMoved"; agent: AgentId; from: NodeId; to: NodeId }
  | { type: "entryBlocked"; agent: AgentId }
  | { type: "sealShut" }
  | { type: "sealOpened" }
  | { type: "sealRejected"; reason: "forcedOpen" | "linkActive" }
  | { type: "sealForcedOpen" }
  | { type: "sealRelockable" }
  | { type: "heatWarning" }
  | { type: "breach"; agent: AgentId }
  | { type: "dawn" };
