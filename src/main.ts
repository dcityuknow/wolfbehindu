import "./styles.css";
import * as THREE from "three";
import { G } from "./state";
import { torch, scene, render } from "./world/scene";
import "./world/map";
import { entities, bodies, me, collide } from "./world/characters";
import { canSee } from "./world/visibility";
import { bindInput, keys } from "./input";
import { updateBots } from "./gameplay/bots";
import { interact, doKill, refreshPrompt, shake } from "./gameplay/actions";
import { ejecting, startMeeting } from "./gameplay/meeting";
import { startSolo } from "./gameplay/session";
import { PLAYER_SPEED, LIGHT, NAMES } from "./config";
import { UI } from "./story";
import { $ } from "./ui/dom";
import { rig, cycleView, bindMouse, updateCamera } from "./world/camera";
import { updateMap } from "./world/map";
import { updateTerrain } from "./world/terrain";
import { followSun } from "./world/scene";
import { animateCrew } from "./world/characters";
import { initIntro, initHowTo } from "./ui/intro";
import { hooks, initCombat, updateCombat, selectWeapon, cycleWeapon, startReload, throwGrenade } from "./gameplay/combat";
import { updateFx } from "./world/fx";
import { updateWeaponHud } from "./ui/weaponHud";
import { W } from "./weaponState";
import { canvasEl } from "./world/scene";
import { lethal, friendlyKill } from "./gameplay/actions";
import { cineUpdate } from "./world/cine3d";
import { updateHostile } from "./gameplay/hostile";
import { CINE } from "./world/cineState";

bindInput({ onWeapon: selectWeapon, onReload: startReload, onGrenade: throwGrenade, onInteract: interact, onKill: doKill, onView: cycleView, onJump: () => { const m = me(); if (G.phase === "play" && m.y <= 0) m.vy = 5; } });
initIntro(startSolo); initHowTo();
$("#bKill").onclick = doKill; $("#bView").onclick = cycleView; bindMouse(); initCombat();
hooks.lethal = lethal; hooks.friendlyKill = friendlyKill; hooks.shake = (v) => { shake.v = Math.max(shake.v, v); };
canvasEl.addEventListener("wheel", (e) => { if (G.phase === "play" && rig.mode !== "third") cycleWeapon(Math.sign(e.deltaY)); }, { passive: true });   // lăn chuột đổi súng (góc 1 / từ trên)

function update(dt: number) {
  const m = me();
  if (G.phase === "play") {
    if (!G.mini) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      // di chuyển theo hướng camera: W = tiến về phía đang nhìn
      const vx = Math.sin(rig.yaw) * f - Math.cos(rig.yaw) * r, vz = Math.cos(rig.yaw) * f + Math.sin(rig.yaw) * r, l = Math.hypot(vx, vz);
      if (l) { m.x += (vx / l) * PLAYER_SPEED * dt; m.z += (vz / l) * PLAYER_SPEED * dt; m.rot = rig.mode === "first" || W.aimT > 0 ? rig.yaw : Math.atan2(vx, vz); }
      else if (rig.mode === "first" || W.aimT > 0) m.rot = rig.yaw;
    }
    m.vy -= 14 * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y === 0) m.vy = 0;
    collide(m); updateBots(dt); updateCombat(dt); updateHostile(dt);

    // Fog of war: chỉ hiện thực thể/xác trong tầm nhìn
    for (const e of entities) if (e.i !== G.slot && !e.out) e.g.visible = G.ghost || canSee(e);
    for (const b of bodies) if (b.own) b.g.visible = true;
    // Bot thấy xác -> tự báo cáo
    if (!G.reporting) for (const b of bodies) {
      if (b.own || !b.g.visible) continue;
      const bot = entities.find((e) => e.i !== G.slot && !e.dead && !e.out && Math.hypot(e.x - b.x, e.z - b.z) < 3);
      if (bot) { G.reporting = true; setTimeout(() => { G.reporting = false; startMeeting(UI.botReport(NAMES[bot.i])); }, 900); break; }
    }
    refreshPrompt();
  }
  for (const e of entities) { // đồng bộ mesh theo dữ liệu
    if ((e.dead && e.i !== G.slot) || G.phase === "meet" || ejecting.cur?.e === e || e.stun > 0) continue;
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = e.rot;
  }
  const ej = ejecting.cur;
  if (ej) {
    ej.t += dt; const e = ej.e;
    e.g.position.set(e.x + ej.dx * ej.t * 5, ej.t * 2, e.z + ej.dz * ej.t * 5); e.g.rotation.y += dt * 12; e.g.scale.setScalar(Math.max(0.01, 1 - ej.t / 3));
    if (ej.t > 3) { e.g.scale.setScalar(1); ejecting.cur = null; ej.done(); }
  }
  shake.v = Math.max(0, shake.v - dt);
  tNow += dt; updateFx(dt); updateWeaponHud(); animateCrew(dt, tNow); updateMap(tNow, dt); updateTerrain(tNow, dt);
  cineUpdate(dt);
  updateCamera(dt, tNow, shake.v);
  followSun(m.x, m.z); torch.position.set(m.x, 3, m.z);
  if (!CINE.active) (scene.fog as THREE.FogExp2).density = G.ghost ? LIGHT.fogGhost : LIGHT.fogPlay;
}

let tNow = 0;
let last = performance.now();
(function loop(now: number) {
  update(Math.min(0.05, (now - last) / 1e3)); last = now;
  render(); requestAnimationFrame(loop);
})(last);
