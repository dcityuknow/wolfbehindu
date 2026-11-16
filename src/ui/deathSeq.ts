import { ownCorpse } from "../world/characters";
import { captureCrew } from "./snapshot";
import { sfx } from "../audio";

/** Cảnh bị hạ: (1) ngã — góc nhìn nghiêng gần 90° · (2) màn hình tối dần ĐỀU tới đen hẳn · (3) đúng 2 s sau lúc chết: chụp ảnh cả đội · (4) hết tối → promise resolve, cảnh giải mã gián điệp mở. */
export const DEATH = { active: false, t: 0, k: 0 };   // k = mức ngã 0..1 (làm mượt) — camera.ts đọc
export const DEATH_T = { fall: 0.7, snap: 2.0, dark: 3.6 };   // giây: ngã xong · chụp ảnh · đen hoàn toàn

let dim: HTMLDivElement | null = null, snapped = false, onDark: () => void = () => {};

/** Bắt đầu cảnh chết. fall=false (bị loại do vắng mặt…) thì không ngã, chụp ngay và resolve ngay. */
export function beginDeath(fall = true): Promise<void> {
  const body = ownCorpse(); body.g.visible = false;   // xác chỉ hiện ở ảnh chụp (camera đang nằm đúng chỗ đầu nó)
  dim?.remove(); dim = document.createElement("div");
  dim.style.cssText = "position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:7";
  document.body.appendChild(dim);
  snapped = false; DEATH.t = 0; DEATH.k = 0; sfx.hit(); sfx.kill();
  if (!fall) { captureCrew(); snapped = true; dim.style.opacity = "1"; return Promise.resolve(); }
  DEATH.active = true;
  return new Promise<void>((r) => (onDark = r));
}

export function tickDeath(dt: number) {
  if (!DEATH.active || !dim) return;
  DEATH.t += dt;
  const k = Math.min(1, DEATH.t / DEATH_T.fall); DEATH.k = k * k * (3 - 2 * k);
  dim.style.opacity = String(Math.min(1, DEATH.t / DEATH_T.dark));   // tuyến tính = tối dần đều
  if (!snapped && DEATH.t >= DEATH_T.snap) { snapped = true; captureCrew(); }
  if (DEATH.t >= DEATH_T.dark) { const f = onDark; onDark = () => {}; f(); }
}

/** Gỡ lớp tối + camera chết (gọi khi bảng kết quả cuối hiện ra). */
export function endDeathView() { DEATH.active = false; dim?.remove(); dim = null; }
