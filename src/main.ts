import "./styles.css";
import * as THREE from "three";
import { G } from "./state";
import { torch, scene, render } from "./world/scene";
import "./world/map";
import { entities, bodies, me, collide, separate, deathHooks } from "./world/characters";
import { endBecauseKilled } from "./gameplay/gameover";
import { groundAt, CAMP_Y, swimmable, swimYAt, waterBed } from "./world/island";
import { updateWater } from "./world/water";
import { updateBlizzard } from "./world/blizzard";
import { onLanding, swimEdgeHint } from "./gameplay/fall";
import { canSee } from "./world/visibility";
import { bindInput, keys } from "./input";
import { updateBots } from "./gameplay/bots";
import { interact, doKill, refreshPrompt, shake } from "./gameplay/actions";
import { ejecting, updateCall } from "./gameplay/meeting";
import { startSolo } from "./gameplay/session";
import { initPvp, open as openPvp } from "./gameplay/pvp";
import { PLAYER_SPEED, LIGHT, NAMES, WATER } from "./config";
import { PV } from "./world/hitreact";
import { sfx } from "./audio";
import { updateFootsteps } from "./world/footsteps";
import { UI } from "./story";
import { $, toast } from "./ui/dom";
import { rig, cycleView, bindMouse, updateCamera } from "./world/camera";
import { updateMap } from "./world/map";
import { updateTerrain } from "./world/terrain";
import { followSun } from "./world/scene";
import { animateCrew } from "./world/characters";
import { initIntro, initHowTo } from "./ui/intro";
import { hooks, initCombat, updateCombat, selectWeapon, cycleWeapon, startReload, throwGrenade } from "./gameplay/combat";
import { updateFx, swimFx } from "./world/fx";
import { updateWeaponHud } from "./ui/weaponHud";
import { updateMinimap } from "./ui/minimap";
import { W, MV, ROLL_T, ROLL_CD } from "./weaponState";
import { canvasEl } from "./world/scene";
import { lethal, friendlyKill } from "./gameplay/actions";
import { cineUpdate } from "./world/cine3d";
import { updateHostile } from "./gameplay/hostile";
import { CINE } from "./world/cineState";
import { tribunalUpdate } from "./gameplay/tribunal";
import { preloadVoices } from "./meetVoice";
import { tickDeath } from "./ui/deathSeq";
import { updateAltitude } from "./world/altitude";
import { updateDayCycle } from "./world/daycycle";

bindInput({ onWeapon: selectWeapon, onReload: startReload, onGrenade: throwGrenade, onInteract: interact, onKill: doKill, onView: cycleView, onJump: () => { const m = me(); if (G.phase === "play" && m.y <= groundAt(m.x, m.z) + 0.05 && m.seat < 0 && !swimmable(m.x, m.z)) m.vy = 5.6; } });
initIntro(startSolo, openPvp); initPvp(); initHowTo();
$("#bKill").onclick = doKill; $("#bView").onclick = cycleView; bindMouse(); initCombat();
deathHooks.selfKilled = endBecauseKilled; hooks.lethal = lethal; hooks.friendlyKill = friendlyKill; hooks.shake = (v) => { shake.v = Math.max(shake.v, v); };
canvasEl.addEventListener("wheel", (e) => { if (G.phase === "play" && rig.mode === "first") cycleWeapon(Math.sign(e.deltaY)); }, { passive: true });   // lăn chuột đổi súng (góc 1 / từ trên)

const TWIST_MAX = 1.35, TWIST_WALK = 1.0;   // rad: thân vặn tối đa so với chân khi đứng yên (~77°) · khi đi ngang/lùi (~57°)
function update(dt: number) {
  const m = me();
  if (G.phase !== "play") { MV.roll = 0; MV.swimming = false; MV.swimK = 0; MV.inWater = false; MV.depth = 0; MV.under = false; MV.air = 1; }
  if (G.phase === "play") {
    MV.rollCd = Math.max(0, MV.rollCd - dt);
    MV.inWater = swimmable(m.x, m.z) && m.y <= swimYAt(m.x, m.z) + 0.6;
    if (MV.inWater && !G.ghost && !G.mini && m.seat < 0) {   // LẶN: giữ Shift = chìm xuống · Space = trồi nhanh · thả ra = tự nổi lên (không sâu hơn đáy hồ/biển)
      const dive = keys.ShiftLeft || keys.ShiftRight, maxD = Math.max(0, swimYAt(m.x, m.z) - waterBed(m.x, m.z));
      MV.depth = Math.max(0, Math.min(maxD, MV.depth + (dive ? WATER.diveSpeed : keys.Space ? -WATER.upSpeed : -WATER.riseSpeed) * dt));
    } else MV.depth = 0;
    if (!G.mini && m.seat < 0) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      // di chuyển theo hướng camera: W = tiến về phía đang nhìn
      const vx = Math.sin(rig.yaw) * f - Math.cos(rig.yaw) * r, vz = Math.cos(rig.yaw) * f + Math.sin(rig.yaw) * r, l = Math.hypot(vx, vz);
      // LĂN (Shift): chỉ trên đất liền, đang chạm đất, không ở dưới nước; hồi ROLL_CD giây
      if ((keys.ShiftLeft || keys.ShiftRight) && MV.roll <= 0 && MV.rollCd <= 0 && !G.ghost && !MV.inWater && m.y <= groundAt(m.x, m.z) + 0.05) {
        MV.dx = l ? vx / l : Math.sin(rig.yaw); MV.dz = l ? vz / l : Math.cos(rig.yaw);   // không bấm hướng nào thì lăn về phía đang nhìn
        MV.roll = ROLL_T; MV.rollCd = ROLL_CD; sfx.roll();
      }
      if (MV.roll > 0 && MV.inWater) MV.roll = 0;   // lăn xuống nước thì dừng
      if (MV.roll > 0) {
        MV.roll = Math.max(0, MV.roll - dt);
        const sp = PLAYER_SPEED * (0.5 + 1.5 * (MV.roll / ROLL_T));   // lao ra nhanh, chậm dần
        m.x += MV.dx * sp * dt; m.z += MV.dz * sp * dt; m.rot = m.legRot = Math.atan2(MV.dx, MV.dz); m.legBack = false;
      } else {
        const sp = PLAYER_SPEED * PV.slow * (MV.inWater ? (MV.under ? WATER.diveMove : WATER.swimMove) : 1);   // bơi chậm hơn đi bộ, lặn còn chậm hơn
        if (l) { m.x += (vx / l) * sp * dt; m.z += (vz / l) * sp * dt; }
        // Thân (từ hông lên) luôn xoay theo chuột; khi bơi thì cả người hướng theo hướng bơi
        m.rot = MV.swimming && l ? Math.atan2(vx, vz) : rig.yaw;
        // CHÂN: đứng yên thì giữ nguyên hướng; chỉ khi di chuyển mới xoay về hướng đi (đi lùi thì giữ hướng thân, chân đạp ngược)
        const wr = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
        m.legRot ??= m.rot;
        if (l) {
          const mv = Math.atan2(vx, vz); let d = wr(mv - m.rot); m.legBack = Math.abs(d) > Math.PI / 2; if (m.legBack) d = wr(d + Math.PI);
          m.legRot += wr(m.rot + Math.max(-TWIST_WALK, Math.min(TWIST_WALK, d)) - m.legRot) * Math.min(1, dt * 12);
        } else {
          m.legBack = false;
          const over = wr(m.legRot - m.rot);   // thân vặn quá giới hạn → chân bước xoay theo cho tự nhiên
          if (Math.abs(over) > TWIST_MAX) m.legRot = m.rot + Math.sign(over) * TWIST_MAX;
        }
      }
    } else { MV.roll = 0; m.legRot = m.rot; m.legBack = false; }
    if (m.seat < 0) collide(m);
    {   // tốc độ ngang (đã làm mượt) → trạng thái BƠI: đang xuống nước VÀ đang di chuyển; đứng yên thì chỉ đạp nước (vẫn bắn được)
      const spd = dt > 0 ? Math.hypot(m.x - MV.lx, m.z - MV.lz) / dt : 0; MV.lx = m.x; MV.lz = m.z;
      MV.speed += ((spd > 40 ? 0 : spd) - MV.speed) * Math.min(1, dt * 12);
      if (!MV.inWater || G.ghost) MV.swimming = false; else if (MV.under) MV.swimming = true; else if (!MV.swimming) { if (MV.speed > 0.5) MV.swimming = true; } else if (MV.speed < 0.2) MV.swimming = false;
      MV.swimK += ((MV.swimming ? 1 : 0) - MV.swimK) * Math.min(1, dt * 6);
      if (MV.swimK > 0.02) MV.stk += dt * (4.2 + Math.min(MV.speed, 6) * 0.6);
    }
    swimFx(dt, m.x, m.z, m.rot, MV.inWater && !G.ghost, MV.swimming, MV.speed, MV.under);
    updateBots(dt); updateCombat(dt); updateHostile(dt); separate(); updateFootsteps(dt);
    // Độ cao: người chơi có trọng lực + nhảy, tự bước lên bậc 1 khối; Bot bám theo mặt đất (trượt mượt qua từng bậc)
    for (const e of entities) {
      if (e.seat >= 0 || e.dead || e.out) continue;
      const gy = groundAt(e.x, e.z);
      if (e.i === G.slot) {
        const wet = !G.ghost && swimmable(e.x, e.z) && m.y <= gy + 0.6;   // đang ở trong nước (hồ hoặc biển)
        if (wet) {   // chìm/nổi theo độ lặn, không rơi theo trọng lực; vừa lao xuống nước thì tính sát thương rơi + tiếng/bọt tóe (onLanding)
          if (m.vy < -1) onLanding(m.vy, e.x, e.z);
          m.vy = 0; m.y += (Math.max(gy - MV.depth, Math.min(gy, waterBed(e.x, e.z))) - m.y) * Math.min(1, dt * 14);
        } else if (m.y > gy + 0.001 || m.vy > 0) { m.vy -= 14 * dt; m.y += m.vy * dt; if (m.y <= gy) { onLanding(m.vy, m.x, m.z); m.y = gy; m.vy = 0; } }
        else { m.vy = 0; m.y += (gy - m.y) * Math.min(1, dt * 22); if (Math.abs(gy - m.y) < 0.01) m.y = gy; }
      } else if (e.y > gy + 0.001 || e.vy > 0) { e.vy -= 14 * dt; e.y += e.vy * dt; if (e.y <= gy) { e.y = gy; e.vy = 0; } }   // Bot đang nhảy / rơi: trọng lực như người chơi
      else { e.vy = 0; e.y += (gy - e.y) * Math.min(1, dt * 14); if (Math.abs(gy - e.y) < 0.01) e.y = gy; }
    }

    swimEdgeHint(m.x, m.z, tNow);
    updateAltitude(dt);   // gió rít theo độ cao + băng giá phủ lên quần áo khi đứng lâu trên cao

    // Fog of war: chỉ hiện thực thể/xác trong tầm nhìn
    for (const e of entities) if (e.i !== G.slot && !e.out) e.g.visible = G.ghost || canSee(e) || G.call?.caller === e.i || G.reporter === e.i;
    for (const b of bodies) if (b.own) b.g.visible = true;
    // Bot thấy xác -> tự báo cáo
    if (!G.reporting && !G.call) for (const b of bodies) {
      if (b.own || !b.g.visible) continue;
      const bot = entities.find((e) => e.i !== G.slot && !e.dead && !e.out && Math.hypot(e.x - b.x, e.z - b.z) < 3);
      if (bot) { G.reporting = true; G.reporter = bot.i; G.bodyKnown = true; sfx.siren(); toast(UI.botReport(NAMES[bot.i])); break; }   // the bot runs to the campfire and sits down to call the meeting
    }
    updateCall(dt); refreshPrompt();
  }
  for (const e of entities) { // đồng bộ mesh theo dữ liệu
    if ((e.dead && e.i !== G.slot) || G.phase === "meet" || ejecting.cur?.e === e || e.stun > 0) continue;
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = e.rot;
  }
  const ej = ejecting.cur;
  if (ej) {
    ej.t += dt; const e = ej.e;
    e.g.position.set(e.x + ej.dx * ej.t * 5, e.y + ej.t * 2, e.z + ej.dz * ej.t * 5); e.g.rotation.y += dt * 12; e.g.scale.setScalar(Math.max(0.01, 1 - ej.t / 3));
    if (ej.t > 3) { e.g.scale.setScalar(1); ejecting.cur = null; ej.done(); }
  }
  shake.v = Math.max(0, shake.v - dt);
  tNow += dt; updateFx(dt); updateWeaponHud(); updateMinimap(dt); animateCrew(dt, tNow); tribunalUpdate(dt); updateMap(tNow, dt); updateTerrain(tNow, dt);
  cineUpdate(dt); tickDeath(dt);
  updateCamera(dt, tNow, shake.v);
  updateDayCycle(dt);   // giờ thật của người chơi (IP → múi giờ + vị trí): nắng/trăng/sao/màu trời/sương; nhường cho cảnh phim khi CINE.active
  if (!CINE.hero) followSun(m.x, m.y, m.z);   // cú máy bung dù tự đặt đèn mặt trời (backlight)
  torch.position.set(m.x, m.y + 3, m.z);
  if (!CINE.active) (scene.fog as THREE.FogExp2).density = G.ghost ? LIGHT.fogGhost : LIGHT.fogPlay;
  updateWater(dt, tNow);      // lặn + nín thở + màn nước + âm thanh nước (sau camera và sau khi đặt sương)
  updateBlizzard(dt, tNow);   // gió thổi + tuyết bay trên đỉnh núi
}

preloadVoices();   // giọng 11 lính (audio sprite) nạp nền ngay khi vào game
let tNow = 0;
let last = performance.now();
(function loop(now: number) {
  update(Math.min(0.05, (now - last) / 1e3)); last = now;
  render(); requestAnimationFrame(loop);
})(last);
