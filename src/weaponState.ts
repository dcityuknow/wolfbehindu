import { GUNS, GRENADE, COMBAT } from "./config";

/** Trạng thái vũ khí của người chơi (module lá — không import gì ngoài config để tránh vòng phụ thuộc). */
export const W = {
  cur: 2,                                         // súng đang cầm (index trong GUNS) — mặc định AK
  ammo: GUNS.map((g) => g.mag), reserve: GUNS.map((g) => g.reserve),
  grenades: GRENADE.count, hp: COMBAT.playerHp,   // máu người chơi (Bot thù địch bắn)
  cd: 0, grenCd: 0,                               // hồi giữa 2 phát / 2 lần ném
  reload: 0, reloadDur: 1,                        // giây nạp đạn còn lại / tổng
  ads: false, adsT: 0,                            // đang ngắm (chuột phải) / mức ngắm 0..1
  kick: 0, recoil: 0, bloom: 0,                   // giật viewmodel · giật camera (rad) · toả đạn thêm
  swapT: 0, aimT: 0, flashT: 0,                   // đổi súng · còn giơ súng ngắm · chớp lửa đầu nòng
};
/** Chuột (cập nhật bởi combat.ts). pressed = vừa bấm trong frame này (cho súng bán tự động). */
export const M = { left: false, right: false, pressed: false, x: 0, y: 0 };

export function refillAmmo() {
  GUNS.forEach((g, i) => { W.ammo[i] = g.mag; W.reserve[i] = g.reserve; });
  W.grenades = GRENADE.count; W.reload = 0; W.hp = COMBAT.playerHp;
}
