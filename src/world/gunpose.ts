import * as THREE from "three";
import { GUNS, GRENADE, SWAP, type GunId } from "../config";
import { W, MV } from "../weaponState";
import { POUCH, setSlide, type GunRig } from "./guns";
import type { Entity } from "../types";

/**
 * Hoạt ảnh vũ khí của người chơi ở góc thứ ba (port từ thirdperson.js của game tham khảo):
 *  · Đổi súng: tay phải vươn RA SAU lưng (hoặc xuống bao ở hông) nắm súng ở dây đeo, kéo súng vòng qua vai ra trước theo tay; súng cũ cất về dây đeo trước.
 *  · Nạp đạn: nghiêng súng, tay trái rút băng cũ (rơi xuống đất), móc băng mới ở túi hông trái, nhét vào, kéo khóa nòng / thanh trượt rồi trả tay về ốp tay.
 *  · Lựu đạn: tay phải móc túi hông trái lấy lựu đạn → giữ chuột: tay trái giật chốt, người ngả ra sau, tay phải vươn ra sau → thả chuột: vung tay từ sau ra trước, người chồm theo.
 * Toạ độ ở đây là toạ độ THÂN nhân vật (chân y=0, mặt nhìn +z, lưng -z). Tay: nhóm xoay quanh vai, ống tay dài 12 điểm ảnh hướng xuống -y.
 */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const e3 = (x: number) => x * x * (3 - 2 * x);
export const cl = (u: number, a: number, b: number) => Math.min(1, Math.max(0, (u - a) / (b - a)));
const mix = (o: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, t: number) => o.copy(a).lerp(b, t);

const SH = { r: V(0.336, 1.344, 0), l: V(-0.336, 1.344, 0) }, REACH = 0.588;   // vai (tâm xoay tay) · khoảng từ vai tới giữa bàn tay
const DOWN = V(0, -1, 0), AX = V(1, 0, 0), _a = V(), _e = new THREE.Euler();
/** Đưa bàn tay (giữa 3 điểm ảnh dưới cùng của tay) tới đúng điểm target: xoay tay hướng về target, kéo dài / co nhẹ cho vừa. */
function reach(arm: THREE.Object3D, sh: THREE.Vector3, target: THREE.Vector3) {
  _a.copy(target).sub(sh); const len = _a.length() || 1e-3; _a.divideScalar(len);
  arm.quaternion.setFromUnitVectors(DOWN, _a); arm.scale.y = Math.max(0.8, Math.min(1.35, len / REACH));
}
const relax = (arm: THREE.Object3D, x: number, z: number) => { arm.quaternion.setFromEuler(_e.set(x, 0, z)); arm.scale.y = 1; };
export function resetArms(armL: THREE.Object3D, armR: THREE.Object3D) { armL.scale.y = 1; armR.scale.y = 1; }

/* ───── mốc bàn tay khi cầm lựu đạn ───── */
const GP = {
  rest: V(0.3, 0.85, 0.08), lrest: V(-0.3, 0.9, 0.12), hip: V(-0.18, 0.84, 0.22), chest: V(0.2, 1.12, 0.42), back: V(0.33, 1.52, -0.5), fwd: V(0.26, 1.38, 0.62), low: V(0.12, 0.88, 0.55),
  pin: V(0.13, 1.2, 0.43), pull: V(-0.14, 1.14, 0.28), lwind: V(-0.22, 1.28, 0.52),
};
const SGP: Record<GunId, [number, number, number]> = { pistol: [-0.06, 0.05, 0.1], rifle: [0.05, 0.07, 0.12], sniper: [0.06, 0.06, 0.1] };   // chỗ tay trái kéo thanh trượt / khóa nòng (toạ độ súng)
const HO = V(-0.04, -0.02, 0);                                                                                                                // tay nắm băng lệch khỏi tâm băng
const CB = V(0.38, 1.5, -0.3), CPS = V(0.34, 1.0, 0.3);                                                                                       // điểm tay vòng qua vai (súng sau lưng) · (súng ngắn ở hông)

/* ───── Đường đi của băng đạn + bàn tay trái khi nạp (u = 0..1) — dùng chung cho góc thứ ba và thứ nhất, toạ độ SÚNG ───── */
export interface RelOut { tl: number; mp: THREE.Vector3; hv: THREE.Vector3; magOn: boolean; rack: number }
export const newRelOut = (): RelOut => ({ tl: 0, mp: V(), hv: V(), magOn: true, rack: 0 });
const T1 = V(), T2 = V(), T3 = V();
/** [0-.12] nghiêng súng, tay trái nắm băng | [.12-.30] rút băng cũ, vứt | [.30-.48] tay xuống túi lấy băng mới | [.48-.72] đưa băng mới lên, nhét vào | [.72-.82] tay lên thân súng | [.82-.95] kéo khóa nòng | tay về ốp tay.
 *  po = vị trí túi băng đạn (toạ độ súng). */
export function reloadPose(m: THREE.Object3D, id: GunId, u: number, po: THREE.Vector3, o: RelOut) {
  const ud = m.userData, mb = ud.magHome as THREE.Vector3, fg = ud.fore as THREE.Vector3, tr = ud.travel as number, sg = SGP[id], hv = o.hv, mp = o.mp;
  const dn = T1.copy(mb); dn.y -= 0.24;
  o.tl = e3(cl(u, 0, 0.12)) * (1 - e3(cl(u, 0.74, 0.86)));
  o.rack = e3(cl(u, 0.82, 0.9)) * (1 - e3(cl(u, 0.92, 0.95)));
  if (u < 0.12) { mp.copy(mb); hv.lerpVectors(fg, T2.copy(mb).add(HO), e3(u / 0.12)); }
  else if (u < 0.3) { mp.lerpVectors(mb, dn, e3(cl(u, 0.12, 0.3))); hv.copy(mp).add(HO); }
  else if (u < 0.44) { hv.lerpVectors(T2.copy(dn).add(HO), po, e3(cl(u, 0.3, 0.44))); mp.copy(po); }
  else if (u < 0.48) { hv.copy(po); mp.copy(po); }
  else if (u < 0.6) { mp.lerpVectors(po, dn, e3(cl(u, 0.48, 0.6))); hv.copy(mp).add(HO); }
  else if (u < 0.72) { mp.lerpVectors(dn, mb, e3(cl(u, 0.6, 0.72))); hv.copy(mp).add(HO); }
  else if (u < 0.82) { mp.copy(mb); hv.lerpVectors(T2.copy(mb).add(HO), T3.set(...sg), e3(cl(u, 0.72, 0.82))); }
  else if (u < 0.95) { mp.copy(mb); hv.set(...sg); hv.z -= tr * o.rack; }
  else { mp.copy(mb); hv.lerpVectors(T3.set(...sg), fg, e3(cl(u, 0.95, 1))); }
  o.magOn = u < 0.3 || u >= 0.44;   // băng cũ đã vứt (.30) → tay rỗng đi lấy; có băng mới từ .44
}
/** Thanh trượt / khóa nòng: lùi khi bắn (súng ngắm: bẻ khóa nòng suốt thời gian chờ giữa 2 phát) và khi kéo lên đạn lúc nạp. */
export function slideK(id: GunId, rack: number) {
  if (id === "sniper") { const T = 1 / GUNS[2].rate; return Math.max(rack, W.cd > 0 ? Math.sin(Math.PI * Math.min(1, 1 - W.cd / T)) : 0); }
  return Math.max(rack, W.kick);
}

/* ───── đặt khẩu súng `type` ở vị trí w (0 = trên dây đeo / bao, 1 = sẵn sàng bắn): quỹ đạo cong vòng qua vai, súng xoay dần từ hướng đeo sang hướng bắn ───── */
const RP = V(), READYQ = new THREE.Quaternion(), K0 = V(), K5 = V(), Rf = V(), Lf = V();
function swingGun(rig: GunRig, type: GunId, w: number) {
  const G = rig.sgr[type]!, c = type === "pistol" ? CPS : CB, a = (1 - w) * (1 - w), b = 2 * (1 - w) * w, d = w * w, sc = rig.sscale[type]!, h = rig.holder;
  h.position.set(G.x * a + c.x * b + RP.x * d, G.y * a + c.y * b + RP.y * d, G.z * a + c.z * b + RP.z * d);
  h.quaternion.copy(rig.sq[type]!).slerp(READYQ, w); h.scale.setScalar(sc + (1 - sc) * w);
}
const slotOf = () => (W.nade ? "grenade" : GUNS[W.cur].id);

/** Giá súng đầy đủ của người chơi — gọi mỗi frame trước poseMe. Trả về độ nghiêng thân (rad, dương = chồm tới, âm = ngả ra sau). */
export function poseFull(e: Entity, rig: GunRig, armL: THREE.Object3D, armR: THREE.Object3D, dt: number, swing: number): number {
  const st = rig.st, id = GUNS[W.cur].id, gr = W.nade, slot = slotOf(), held = rig.holder, nade = rig.nade!;
  const busy = MV.roll > 0 || MV.swimK > 0.5;
  const showSlung = (hand: GunId | null) => { for (const t of Object.keys(rig.slung) as GunId[]) { rig.slung[t]!.visible = t !== hand; rig.models[t]!.visible = t === hand; } };
  const showHooks = (n: number) => rig.hooks.forEach((h, i) => (h.visible = i < n));
  // hai tay bận (lăn / bơi): súng đeo ra sau lưng, lựu đạn móc hông
  if (busy) {
    showSlung(null); showHooks(W.grenades); nade.visible = false; st.handPrev = null; st.busy = true; st.lean = 0; st.leanS = 0; resetArms(armL, armR); return 0;
  }
  if (st.busy) { st.busy = false; st.swPrev = slot; if (!gr) { st.swOld = null; st.swNew = id; st.swT = 0; st.swOn = true; st.swS1 = 0; st.swLen = SWAP.reach + SWAP.draw; } }   // lăn / bơi xong: rút lại súng từ sau lưng
  // ---- theo dõi đổi súng ----
  if (st.swPrev === null) st.swPrev = slot;
  if (slot !== st.swPrev) {
    st.swPrev = slot;
    if (!gr) { st.swOld = st.handPrev; st.swNew = id; st.swT = 0; st.swOn = true; st.swS1 = st.swOld ? SWAP.stow : 0; st.swLen = st.swS1 + SWAP.reach + SWAP.draw; }
    else if (st.handPrev) { st.swOld = st.handPrev; st.swNew = st.handPrev; st.swT = 0; st.swOn = true; st.swS1 = SWAP.stow; st.swLen = SWAP.stow; }   // lấy lựu đạn: cất súng đang cầm về chỗ đeo trước
    else st.swOn = false;
  }
  if (st.swOn) {
    st.swT += dt;
    if (st.swT >= st.swLen) st.swOn = false;
    else if (st.swT < st.swS1) { st.swPh = 0; st.swU = st.swT / st.swS1; }
    else if (st.swT < st.swS1 + SWAP.reach) { st.swPh = 1; st.swU = (st.swT - st.swS1) / SWAP.reach; }
    else { st.swPh = 2; st.swU = (st.swT - st.swS1 - SWAP.reach) / SWAP.draw; }
  }
  const nadeHand = gr && !st.swOn;   // đã cất súng xong mới móc lựu đạn
  let lean = 0;

  if (nadeHand) {
    /* ───── LỰU ĐẠN ───── */
    const D = GRENADE.draw, PT = GRENADE.pin, TH = GRENADE.throwT, drawT = W.gDrawT, throwing = W.gThrowT > 0;
    const inHand = !(throwing && W.gThrown) && (drawT >= D * 0.45 || W.gHold || W.gAuto || throwing);
    let useL = false;
    if (throwing) {            // VUNG TAY: từ sau ra trước, người chồm theo
      const u = 1 - W.gThrowT / TH;
      if (u < 0.7) mix(Rf, GP.back, GP.fwd, e3(cl(u, 0, 0.7))); else mix(Rf, GP.fwd, GP.low, e3(cl(u, 0.7, 1)));
      lean = -0.42 + (0.3 + 0.42) * e3(cl(u, 0, 0.65)); if (u > 0.8) lean = 0.3 * (1 - e3(cl(u, 0.8, 1)));
      mix(Lf, GP.lwind, GP.lrest, e3(cl(u, 0, 1))); useL = true;
    } else if (W.gHold || W.gAuto) {   // giữ chuột: tay trái giật chốt rồi người ngả ra sau, tay phải vươn ra sau
      const u = Math.min(1, W.gHoldT / PT), wu = e3(cl(W.gHoldT, PT * 0.7, PT * 1.2));
      mix(Rf, GP.chest, GP.back, wu);
      if (u < 0.45) mix(Lf, GP.lrest, GP.pin, e3(cl(u, 0, 0.45)));         // tay trái với tới chốt
      else if (u < 0.7) mix(Lf, GP.pin, GP.pull, e3(cl(u, 0.45, 0.7)));    // giật chốt ra
      else mix(Lf, GP.pull, GP.lwind, e3(cl(u, 0.7, 1)));                   // dang ra giữ thăng bằng
      useL = true; lean = -0.42 * wu + 0.08 * Math.sin(Math.min(1, u / 0.5) * Math.PI);
    } else if (drawT < D) {    // MÓC TÚI: tay phải vươn sang hông trái, thò vào túi, rút lựu đạn lên ngực
      const u = Math.max(0, drawT) / D;
      if (u < 0.45) mix(Rf, GP.rest, GP.hip, e3(cl(u, 0, 0.45))); else mix(Rf, GP.hip, GP.chest, e3(cl(u, 0.45, 1)));
      lean = 0.2 * Math.sin(Math.min(1, u / 0.55) * Math.PI);
    } else Rf.copy(GP.chest);
    const k = Math.min(1, dt * 22); st.rp.lerp(Rf, k); if (useL) st.lp.lerp(Lf, k);
    nade.visible = inHand; nade.position.copy(st.rp); nade.rotation.set(0, 0, 0); (nade.userData.pin as THREE.Object3D).visible = !W.gPin;
    showSlung(null); showHooks(W.grenades - (inHand ? 1 : 0)); st.handPrev = null;
    reach(armR, SH.r, st.rp);
    if (useL) reach(armL, SH.l, st.lp); else relax(armL, swing * 0.8, 0.05);
  } else {
    /* ───── SÚNG: sẵn sàng bắn / nạp đạn / đổi súng ───── */
    nade.visible = false; showHooks(W.grenades); st.rp.copy(GP.rest);
    const ptA = Math.max(-0.6, Math.min(0.9, -e.pitch)) * 0.9, pt = ptA * e.aim + -0.4 * (1 - e.aim);   // e.pitch dương = nhìn xuống; chưa ngắm thì hạ nòng chếch xuống
    RP.set(0.07, -0.1, 0.58).applyAxisAngle(AX, -pt); RP.y += 1.344; READYQ.setFromEuler(_e.set(-pt, 0, 0));
    let handType: GunId | null = id, magOn = true, rack = 0; const L = K5;
    const rel = !gr && W.reload > 0 ? Math.min(1, 1 - W.reload / W.reloadDur) : -1;
    if (st.swOn) {
      let kL = 0;
      if (st.swPh === 0) { handType = st.swOld; swingGun(rig, st.swOld!, 1 - e3(st.swU)); kL = 1 - e3(cl(st.swU, 0, 0.45)); }        // cất súng cũ: tay đưa súng về chỗ đeo
      else if (st.swPh === 1) { handType = null; held.position.lerpVectors(st.swOld ? rig.sgr[st.swOld]! : GP.rest, rig.sgr[st.swNew]!, e3(st.swU)); }   // tay (không) vươn ra sau tới chỗ súng mới
      else { handType = st.swNew; swingGun(rig, st.swNew, e3(st.swU)); kL = e3(cl(st.swU, 0.5, 1)); }                               // nắm báng, kéo súng từ sau lưng ra trước theo tay
      held.updateMatrix(); L.copy(GP.lrest);
      if (handType && kL > 0) L.lerp(K0.copy(rig.models[handType]!.userData.fore as THREE.Vector3).applyMatrix4(held.matrix), kL);
      lean = -0.14 * (st.swPh === 0 ? e3(st.swU) : st.swPh === 1 ? 1 : 1 - e3(st.swU));   // ngả người ra sau khi vươn tay lấy súng
    } else {
      const m = rig.models[id]!;
      let tl = 0; if (rel >= 0) tl = e3(cl(rel, 0, 0.12)) * (1 - e3(cl(rel, 0.74, 0.86)));
      held.position.copy(RP); held.position.x -= 0.06 * tl; held.position.y -= 0.08 * tl;
      held.rotation.set(-pt - 0.3 * tl, 0, -0.5 * tl); held.scale.setScalar(1); held.updateMatrix();   // nghiêng súng cho tay trái với tới băng đạn
      if (rel < 0) L.copy(m.userData.fore as THREE.Vector3).applyMatrix4(held.matrix);
      else {
        const po = _po.copy(POUCH).applyMatrix4(_inv.copy(held.matrix).invert()), o = _ro; reloadPose(m, id, rel, po, o);
        m.userData.mag.position.copy(o.mp); magOn = o.magOn; rack = o.rack; L.copy(o.hv).applyMatrix4(held.matrix);
        lean = 0.07 * o.tl;   // hơi gù xuống khi nạp đạn
      }
    }
    // hiện súng đang cầm / súng đeo; trả băng đạn về chỗ cũ ở các súng không đang nạp
    for (const t of Object.keys(rig.slung) as GunId[]) {
      const mm = rig.models[t]!, on = t === handType; mm.visible = on; rig.slung[t]!.visible = !on;
      if (!(on && rel >= 0 && !st.swOn)) { const mg = mm.userData.mag as THREE.Object3D; mg.position.copy(mm.userData.magHome as THREE.Vector3); mg.visible = true; }
      if (on) { if (rel >= 0 && !st.swOn) (mm.userData.mag as THREE.Object3D).visible = magOn; setSlide(mm, slideK(t, rack)); }
    }
    st.handPrev = handType;
    reach(armR, SH.r, held.position); reach(armL, SH.l, L);
  }
  // làm mượt độ nghiêng thân
  st.leanS += (lean - st.leanS) * Math.min(1, dt * (nadeHand ? 16 : 10));
  st.lean = st.leanS;
  return st.leanS;
}
const _po = V(), _inv = new THREE.Matrix4(), _ro = newRelOut();
