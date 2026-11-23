# Vespucci Labs — Night 1 Demo

A FNAF-style containment horror prototype. You are Milo Hunter, 23, on the first night of a one-week contract as night operator at Vespucci Labs, where seven rogue AIs are held. Amos Crawford, the manager, stays on the phone and walks you through the shift live.

The demo covers one full night: menu → rainy walk-up cutscene (Milo on a call with Sasha) → Night 1 (12 AM–6 AM, about six minutes) → back to the title. Only GPT is active tonight; the other six agents stay in their cells.

## Running

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # simulation + Amos director tests
npm run build      # typecheck + production build into dist/
```

All audio is synthesized at runtime with WebAudio; no audio files are needed.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look around the office |
| E / click the phone | Answer Amos |
| Space / click the monitor | Raise or lower the terminal |
| 1–4 | Cameras · Seal · Comms · Log |
| S | Toggle the airlock seal (terminal raised) |
| Hold F / hold the button | Maintain the GPT link on Comms |
| Hold Space / Esc | Skip the cutscene |

## How Night 1 works

- GPT opens a contact window on Comms. Hold the link for 6 seconds inside the window to push it back one room.
- Every missed contact moves GPT one room closer: cell → spine → airlock → office.
- While GPT is at the airlock, a shut seal blocks it from entering. The seal heats while shut. At 100% it forces itself open and can't relock until it cools below 40%.
- GPT reaching the office ends the night. Surviving to 6:00 AM completes the shift and returns you to the title.

## Debug parameters

- `?start=title|cutscene|night` jumps straight to a scene.
- `?speed=N` runs game time N× faster (max 60).
- `?debug` exposes `window.__game` and `window.__night.debugState`.
