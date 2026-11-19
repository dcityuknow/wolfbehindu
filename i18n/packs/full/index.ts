import type { Dict, Lang } from "../../index";
import { MORE } from "../more";
import { EXTRA } from "./extra";
import { ZH } from "./zh"; import { RU } from "./ru"; import { KO } from "./ko"; import { NG } from "./ng"; import { BN } from "./bn";
import { ID } from "./id"; import { HI } from "./hi"; import { FIL } from "./fil"; import { UK } from "./uk";

/** Bản dịch ĐẦY ĐỦ cho 9 ngôn ngữ (luật chơi, intro, lời Bot, kết thúc, minigame, phụ đề…) gộp lên bản giao diện cơ bản ở more.ts. */
const FULL: Partial<Record<Lang, Dict>> = { zh: ZH, ru: RU, ko: KO, ng: NG, bn: BN, id: ID, hi: HI, fil: FIL, uk: UK };
export const ALL: Partial<Record<Lang, Dict>> = Object.fromEntries(
  (Object.keys(FULL) as Lang[]).map((l) => [l, { ...MORE[l], ...EXTRA[l], ...FULL[l] }]),
);
