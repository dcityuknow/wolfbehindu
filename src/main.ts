import "./styles.css";
import * as THREE from "three";
import { G } from "./state";
import { camera, torch, scene, render } from "./world/scene";
import "./world/map";
import { entities, bodies, me, collide } from "./world/characters";
import { canSee } from "./world/visibility";
import { bindInput, keys } from "./input";
import { updateBots } from "./gameplay/bots";
import { interact, doKill, refreshPrompt, shake } from "./gameplay/actions";
import { ejecting, startMeeting } from "./gameplay/meeting";
import { startSolo } from "./gameplay/session";
import { PLAYER_SPEED, LIGHT } from "./config";
import { $ } from "./ui/dom";

bindInput({ onInteract: interact, onKill: doKill, onJump: () => { const m = me(); if (G.phase === "play" && m.y <= 0) m.vy = 5; } });
$("#bPlay").onclick = startSolo;
$("#bKill").onclick = doKill;

function update(dt: number) {
  const m = me();
  if (G.phase === "play") {
    if (!G.mini) {
      const dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const dz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0), l = Math.hypot(dx, dz);
      if (l) { m.x += (dx / l) * PLAYER_SPEED * dt; m.z += (dz / l) * PLAYER_SPEED * dt; m.rot = Math.atan2(dx, dz); }
    }
    m.vy -= 14 * dt; m.y = Math.max(0, m.y + m.vy * dt); if (m.y === 0) m.vy = 0;
    collide(m); updateBots(dt);

    // Fog of war: chỉ hiện thực thể/xác trong tầm nhìn
    for (const e of entities) if (e.i !== G.slot && !e.out) e.g.visible = G.ghost || canSee(e);
    for (const b of bodies) if (b.own) b.g.visible = true;
    // Bot thấy xác -> tự báo cáo
    if (!G.reporting) for (const b of bodies) {
      if (b.own || !b.g.visible) continue;
      const bot = entities.find((e) => e.i !== G.slot && !e.dead && !e.out && Math.hypot(e.x - b.x, e.z - b.z) < 3);
      if (bot) { G.reporting = true; setTimeout(() => { G.reporting = false; startMeeting(`🤖 Bot-${bot.i} báo cáo xác!`); }, 900); break; }
    }
    refreshPrompt();
  }
  for (const e of entities) { // đồng bộ mesh theo dữ liệu
    if ((e.dead && e.i !== G.slot) || G.phase === "meet" || ejecting.cur?.e === e) continue;
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = e.rot;
  }
  const ej = ejecting.cur;
  if (ej) {
    ej.t += dt; const e = ej.e;
    e.g.position.set(e.x + ej.dx * ej.t * 5, ej.t * 2, e.z + ej.dz * ej.t * 5); e.g.rotation.y += dt * 12; e.g.scale.setScalar(Math.max(0.01, 1 - ej.t / 3));
    if (ej.t > 3) { e.g.scale.setScalar(1); ejecting.cur = null; ej.done(); }
  }
  shake.v = Math.max(0, shake.v - dt);
  const sx = (Math.random() - 0.5) * shake.v, sz = (Math.random() - 0.5) * shake.v;
  if (G.phase === "meet" || ej) { camera.position.set(0, 11, 9); camera.lookAt(0, 0, 0); }
  else { camera.position.lerp(new THREE.Vector3(m.x + sx, 12, m.z + 9 + sz), 0.12); camera.lookAt(m.x, 0, m.z); }
  torch.position.set(m.x, 2.5, m.z);
  (scene.fog as THREE.FogExp2).density = G.ghost ? LIGHT.fogGhost : LIGHT.fogPlay;
}

let last = performance.now();
(function loop(now: number) {
  update(Math.min(0.05, (now - last) / 1e3)); last = now;
  render(); requestAnimationFrame(loop);
})(last);
