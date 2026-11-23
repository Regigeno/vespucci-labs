import type { AgentId, NodeId } from "../sim/types";

export interface CameraDef {
  node: Exclude<NodeId, "office">;
  code: string;
  label: string;
  /** Map placement inside the 440×600 schematic. */
  map: { x: number; y: number; w: number; h: number };
}

export const CAMERAS: CameraDef[] = [
  { node: "airlock", code: "01", label: "Airlock", map: { x: 172, y: 470, w: 96, h: 56 } },
  { node: "spine", code: "02", label: "Spine", map: { x: 186, y: 40, w: 68, h: 418 } },
  { node: "cell_gpt", code: "03", label: "GPT", map: { x: 36, y: 46, w: 136, h: 86 } },
  { node: "cell_gemini", code: "04", label: "Gemini", map: { x: 36, y: 150, w: 136, h: 86 } },
  { node: "cell_claude", code: "05", label: "Claude", map: { x: 36, y: 254, w: 136, h: 86 } },
  { node: "cell_grok", code: "06", label: "Grok", map: { x: 36, y: 358, w: 136, h: 86 } },
  { node: "cell_muse", code: "07", label: "Muse", map: { x: 268, y: 46, w: 136, h: 86 } },
  { node: "cell_nemotron", code: "08", label: "Nemotron", map: { x: 268, y: 150, w: 136, h: 86 } },
  { node: "cell_inkling", code: "09", label: "Inkling", map: { x: 268, y: 254, w: 136, h: 86 } },
];

export function cameraFor(node: NodeId): CameraDef | undefined {
  return CAMERAS.find((c) => c.node === node);
}

/** Which photo a camera shows, given where everyone is. */
export function feedImage(node: NodeId, locations: Record<AgentId, NodeId>): string {
  const gptHere = locations.gpt === node;
  switch (node) {
    case "airlock":
      return gptHere ? "cam_airlock_gpt.jpg" : "cam_airlock.jpg";
    case "spine":
      return gptHere ? "cam_spine_gpt.jpg" : "cam_spine.jpg";
    case "cell_gpt":
      return gptHere ? "cam_cell_gpt.jpg" : "cam_cell_gpt_empty.jpg";
    default:
      return `cam_${node}.jpg`;
  }
}

export const ALL_FEED_IMAGES = [
  "cam_airlock.jpg",
  "cam_airlock_gpt.jpg",
  "cam_spine.jpg",
  "cam_spine_gpt.jpg",
  "cam_cell_gpt.jpg",
  "cam_cell_gpt_empty.jpg",
  "cam_cell_gemini.jpg",
  "cam_cell_claude.jpg",
  "cam_cell_grok.jpg",
  "cam_cell_muse.jpg",
  "cam_cell_nemotron.jpg",
  "cam_cell_inkling.jpg",
];
