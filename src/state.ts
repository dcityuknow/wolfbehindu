import type { GameState } from "./types";
/** Trạng thái game dùng chung (single source of truth phía client). */
export const G: GameState = {
  phase: "menu", slot: 0, role: null, round: 1, acted: false, killUsed: false, tasks: 0,
  dead: new Set(), mini: false, voted: false, ghost: false, cpRound: -1, reporting: false, call: null, reporter: -1, bodyKnown: false,
};
