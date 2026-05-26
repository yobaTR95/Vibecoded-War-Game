import { state } from './state.js';
import { SOLID_BOXES, MAP_LIMIT, getGroundLevel } from './world.js';
import { spawnParticles } from './fx.js';
import { showMsg } from './hud.js';

export const WEAPONS = {
  smle:  { speed:32, dmg:22, range:55, hitR:0.65 },
  gew98: { speed:40, dmg:35, range:90, hitR:0.65 },
  mg:    { speed:50, dmg:20, range:95, hitR:0.65 },
};

let bGeo = null;
let bMat = null;

export function initBullets() {
  bGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.65, 4);
  bMat = {
    player: new THREE.MeshBasicMaterial({color:0xffee00}),
    ally:   new THREE.MeshBasicMaterial({color:0x00ff88}),
    enemy:  new THREE.MeshBasicMaterial({color:0xff4400}),
  };
}

export function spawnBullet(origin, dir, owner, wep='smle') {
  const W = WEAPONS[wep];
  const mesh = new THREE.Mesh(bGeo, bMat[owner]);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  mesh.position.copy(origin).addScaledVector(dir, 1.0);
  state.scene.add(mesh);
  state.bullets.push({ mesh, vel:dir.clone().multiplyScalar(W.speed), owner, dist:0, dmg:W.dmg, range:W.range, hitR:W.hitR });
}

// XZ-only distance: bullets fly at y≈1.3 but character origins are at y=0.
export function xzDist(a, b) {
  const dx=a.x-b.x, dz=a.z-b.z;
  return Math.sqrt(dx*dx + dz*dz);
}

export function bulletInWall(pos) {
  for (const box of SOLID_BOXES) {
    if (pos.y >= box.topY) continue;
    if (pos.x < box.minX || pos.x > box.maxX || pos.z < box.minZ || pos.z > box.maxZ) continue;
    const dx =  pos.x - box.cx, dz = pos.z - box.cz;
    const lx =  dx * box.cos + dz * box.sin;
    const lz = -dx * box.sin + dz * box.cos;
    if (Math.abs(lx) <= box.hw && Math.abs(lz) <= box.hd) return true;
  }
  return false;
}

function popB(i) { state.scene.remove(state.bullets[i].mesh); state.bullets.splice(i,1); }

export function updateBullets(dt) {
  for (let i=state.bullets.length-1; i>=0; i--) {
    const b=state.bullets[i];
    const step=b.vel.clone().multiplyScalar(dt);
    b.mesh.position.add(step);
    b.dist += step.length();
    if (b.dist>b.range || b.mesh.position.y<-1 ||
        Math.abs(b.mesh.position.x)>MAP_LIMIT || Math.abs(b.mesh.position.z)>MAP_LIMIT) { popB(i); continue; }
    if (bulletInWall(b.mesh.position)) {
      const ip = b.mesh.position.clone(); ip.y = Math.max(0.05, ip.y);
      spawnParticles(ip, 3, 'dirt', 2.5);
      popB(i); continue;
    }

    if (b.owner==='enemy' && state.player && state.player.alive && xzDist(b.mesh.position, state.player.mesh.position)<b.hitR) {
      const headY = state.player.mesh.position.y + 1.42;
      const dmg   = Math.abs(b.mesh.position.y - headY) < 0.32 ? 100 : b.dmg;
      state.player.hit(dmg); popB(i); continue;
    }
    let hit=false;
    for (let j=state.bots.length-1; j>=0; j--) {
      const bot=state.bots[j]; if (!bot.alive) continue;
      const ok = (b.owner!=='enemy' && bot.type==='enemy') || (b.owner==='enemy' && bot.type==='ally');
      if (!ok) continue;
      if (xzDist(b.mesh.position, bot.mesh.position)<b.hitR) {
        const headY   = bot.mesh.position.y + 1.42;
        const isHead  = b.owner!=='enemy' && Math.abs(b.mesh.position.y - headY) < 0.32;
        if (isHead && b.owner==='player') showMsg('HEADSHOT!', 1200, '#ff4444');
        bot.hit(isHead ? 100 : b.dmg, b.owner); popB(i); hit=true; break;
      }
    }
    if (hit) continue;
  }
}
