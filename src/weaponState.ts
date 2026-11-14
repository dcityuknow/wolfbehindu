import { GUNS, GRENADE, COMBAT } from "./config";

/** Trạng thái vũ khí của người chơi (module lá — không import gì ngoài config để tránh vòng phụ thuộc). */
export const W = {
  cur: 1,                                         // súng đang chọn (index trong GUNS) — mặc định súng dài
  ammo: GUNS.map((g) => g.mag), reserve: GUNS.map((g) => g.reserve),
  grenades: GRENADE.count, hp: COMBAT.playerHp,   // máu người chơi (Bot thù địch bắn)
  cd: 0, grenCd: 0,                               // hồi giữa 2 phát / 2 lần ném
  reload: 0, reloadDur: 1,                        // giây nạp đạn còn lại / tổng
  ads: false, adsT: 0,                            // đang ngắm (chuột phải) / mức ngắm 0..1
  kick: 0, recoil: 0, bloom: 0,                   // giật viewmodel · giật camera (rad) · toả đạn thêm
  swapT: 0, aimT: 0, flashT: 0,                   // đổi súng (góc nhìn thứ nhất) · còn giơ súng ngắm · chớp lửa đầu nòng
  lock: 0,                                        // giây còn lại cho tới khi súng mới lên tay (chưa bắn / nạp được)
  scoped: false,                                  // đang nhìn qua kính ngắm súng ngắm (tự chuyển sang góc thứ nhất + phủ kính)
  /** Lựu đạn (phím 4 / G): nade = đang cầm lựu đạn (cur vẫn là khẩu súng gần nhất) · gHold = đang giữ chuột (giật chốt) · gAuto = tự giật chốt rồi ném · gHoldT = giây đã giữ
   *  gThrowT = giây vung tay ném còn lại · gThrown = quả đã rời tay · gPow = vận tốc ném · gDrawT = tiến độ móc túi (âm = đang cất súng cũ) · gQuick = ném nhanh xong tự rút lại súng · gPin = chốt đã rút */
  nade: false, gHold: false, gAuto: false, gHoldT: 0, gThrowT: 0, gThrown: false, gPow: 12, gDrawT: 9, gQuick: false, gPin: false,
};
/** Chuột (cập nhật bởi combat.ts). pressed = vừa bấm trong frame này (cho súng bán tự động). */
export const M = { left: false, right: false, pressed: false, x: 0, y: 0 };

export function refillAmmo() {
  GUNS.forEach((g, i) => { W.ammo[i] = g.mag; W.reserve[i] = g.reserve; });
  W.grenades = GRENADE.count; W.reload = 0; W.hp = COMBAT.playerHp;
  resetNade();
}
/** Về trạng thái "không cầm lựu đạn" (xong lượt / chết / ném xong). */
export function resetNade() {
  W.nade = false; W.gHold = false; W.gAuto = false; W.gHoldT = 0; W.gThrowT = 0; W.gThrown = false; W.gDrawT = 9; W.gQuick = false; W.gPin = false;
}

/** Lăn (Shift) + bơi + nghiêng màn hình khi mất máu (giống game tham khảo). */
export const ROLL_T = 0.7, ROLL_CD = 1.1;                       // thời gian một cú lăn · hồi giữa 2 cú lăn (s)
export const MV = {
  roll: 0, rollCd: 0, dx: 0, dz: 0,                             // giây lăn còn lại · hồi · hướng lăn
  inWater: false, swimming: false, swimK: 0, stk: 0, speed: 0,  // đang ở vùng nước · đang bơi (di chuyển) · mức chuyển sang tư thế bơi 0..1 · pha nhịp tay · tốc độ ngang
  lx: 0, lz: 0,
};
export const HURT = { tilt: 0, target: 0, K: 0.008, MAX: 0.2, TAU: 0.7 };   // rad nghiêng thêm cho mỗi 1 máu mất · tối đa (~11°) · giây giảm còn ~37%
