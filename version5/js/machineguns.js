import { state } from './state.js';
import { getGroundLevel } from './world.js';
import { spawnBullet } from './bullets.js';
import { triggerMuzzleFlash } from './fx.js';
import { showMsg } from './hud.js';

const MG_MAG      = 30;
const MG_COOLDOWN = 10;
const MG_FIRE_CD  = 0.07;   // ~14 rounds/sec

const elMgHud = document.getElementById('mg-hud');

export function addMachineGun(x, z, baseYaw) {
  const groundY = getGroundLevel(x, z);
  const MOUND_H = 0.55;
  const mountY  = groundY + MOUND_H;
  const mountPos = new THREE.Vector3(x, mountY, z);

  // ── Dirt mound ──
  const moundMat = new THREE.MeshLambertMaterial({color:0x4a3820});
  const mound = new THREE.Mesh(new THREE.BoxGeometry(4.6, MOUND_H, 3.4), moundMat);
  mound.position.set(x, groundY + MOUND_H * 0.5, z);
  mound.rotation.y = baseYaw;
  state.scene.add(mound);

  // ── Sandbags ──
  const fwdX = -Math.sin(baseYaw), fwdZ = -Math.cos(baseYaw);
  const rgtX =  Math.cos(baseYaw), rgtZ = -Math.sin(baseYaw);

  const sbMat = new THREE.MeshLambertMaterial({color:0x9a7e4a});
  const sbGeo = new THREE.BoxGeometry(0.7, 0.32, 0.46);

  const sbLayout = [
    [1.85,  0.68, 0, 0], [1.85,  0.68, 1, 0],
    [1.85,  0.00, 0, 0], [1.85,  0.00, 1, 0],
    [1.85, -0.68, 0, 0], [1.85, -0.68, 1, 0],
    [1.05,  1.72, 0, Math.PI/2], [1.05,  1.72, 1, Math.PI/2],
    [0.20,  1.72, 0, Math.PI/2], [0.20,  1.72, 1, Math.PI/2],
    [1.05, -1.72, 0, Math.PI/2], [1.05, -1.72, 1, Math.PI/2],
    [0.20, -1.72, 0, Math.PI/2], [0.20, -1.72, 1, Math.PI/2],
    [1.55,  1.30, 0, Math.PI/4], [1.55, -1.30, 0, -Math.PI/4],
    [1.55,  1.30, 1, Math.PI/4], [1.55, -1.30, 1, -Math.PI/4],
  ];

  sbLayout.forEach(([f, r, layer, wallRot]) => {
    const sb = new THREE.Mesh(sbGeo, sbMat);
    sb.position.set(
      x + fwdX*f + rgtX*r,
      mountY + layer*0.34 + 0.16,
      z + fwdZ*f + rgtZ*r
    );
    sb.rotation.y = baseYaw + wallRot + (Math.random()-0.5)*0.08;
    state.scene.add(sb);
  });

  // Static base / tripod
  const baseMat  = new THREE.MeshLambertMaterial({color:0x3a3028});
  const metalMat = new THREE.MeshLambertMaterial({color:0x222222});
  const base = new THREE.Group();

  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.35,0.9), baseMat);
  mount.position.y = 0.18;
  base.add(mount);

  const legMat = new THREE.MeshLambertMaterial({color:0x4a3820});
  [[0.35,0.12],[-0.35,0.12]].forEach(([lx,lz]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.65,4), legMat);
    l.position.set(lx, -0.1, lz); l.rotation.x = -0.35;
    base.add(l);
  });
  const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.65,4), legMat);
  rl.position.set(0, -0.1, -0.3); rl.rotation.x = 0.35;
  base.add(rl);

  base.position.copy(mountPos);
  state.scene.add(base);

  // Rotating turret (barrel + shield)
  const turret = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.24,1.4), metalMat);
  body.position.set(0, 0.62, 0.2);
  turret.add(body);

  const barrelMat = new THREE.MeshLambertMaterial({color:0x111111});
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.7,6), barrelMat);
  barrel.rotation.x = Math.PI/2;
  barrel.position.set(0, 0.62, 0.95);
  turret.add(barrel);

  const shieldMat = new THREE.MeshLambertMaterial({color:0x555544});
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.34,0.08), shieldMat);
  shield.position.set(0, 0.38, 0.55);
  turret.add(shield);

  turret.position.copy(mountPos);
  turret.rotation.y = baseYaw + Math.PI;
  state.scene.add(turret);

  let ammo = MG_MAG;
  let overheated = false;
  let heatTimer = 0;
  let fireCd = 0;
  let botMountedBot = false;
  let botFireCd = 0;
  const BOT_MG_FIRE_CD = 0.22;

  function botMount()   { botMountedBot = true;  }
  function botUnmount() { botMountedBot = false; }

  function update(dt) {
    if (overheated) {
      heatTimer -= dt;
      if (heatTimer <= 0) { overheated=false; ammo=MG_MAG; heatTimer=0; }
    }
    if (fireCd    > 0) fireCd    -= dt;
    if (botFireCd > 0) botFireCd -= dt;

    if (state.mountedMG === thisMG) {
      if (botMountedBot) botMountedBot = false; // player takes priority
      turret.rotation.y = state.yaw + Math.PI;
      if (overheated) {
        elMgHud.textContent = 'OVERHEATED — ' + Math.ceil(heatTimer) + 's';
        elMgHud.style.color = '#ff5500';
      } else {
        elMgHud.textContent = 'MG: ' + ammo + ' / ' + MG_MAG;
        elMgHud.style.color = ammo > 10 ? '#88ff88' : '#ff8800';
      }
    } else if (botMountedBot && !overheated && ammo > 0) {
      // Aim at nearest ally/player
      let target = null, bestDist = Infinity;
      if (state.player && state.player.alive) {
        const d = mountPos.distanceTo(state.player.mesh.position);
        if (d < bestDist) { bestDist = d; target = state.player; }
      }
      state.bots.forEach(b => {
        if (!b.alive || b.type !== 'ally') return;
        const d = mountPos.distanceTo(b.mesh.position);
        if (d < bestDist) { bestDist = d; target = b; }
      });
      if (target && bestDist < 80) {
        const tx = target.mesh.position.x - mountPos.x;
        const tz = target.mesh.position.z - mountPos.z;
        turret.rotation.y = Math.atan2(tx, tz) + Math.PI;
        if (botFireCd <= 0) {
          botFireCd = BOT_MG_FIRE_CD;
          ammo = Math.max(0, ammo - 1);
          if (ammo <= 0) { overheated=true; heatTimer=MG_COOLDOWN; }
          const o = mountPos.clone(); o.y += 0.75;
          const tPos = target.mesh.position.clone(); tPos.y += 1.0;
          const dir = new THREE.Vector3().subVectors(tPos, o).normalize();
          dir.x += (Math.random()-0.5)*0.09;
          dir.y += (Math.random()-0.5)*0.06;
          dir.normalize();
          spawnBullet(o, dir, 'enemy', 'mg');
          triggerMuzzleFlash(o.clone().addScaledVector(dir, 0.8));
        }
      }
    }
  }

  function tryFire() {
    if (overheated || ammo <= 0 || fireCd > 0) return;
    fireCd = MG_FIRE_CD;
    ammo = Math.max(0, ammo - 1);
    if (ammo <= 0) { overheated=true; heatTimer=MG_COOLDOWN; showMsg('MG OVERHEATED — cooling down', 2000); }

    const aimD = new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
    aimD.x += (Math.random()-0.5)*0.035;
    aimD.y += (Math.random()-0.5)*0.025;
    aimD.normalize();

    const o = mountPos.clone(); o.y += 0.75;
    spawnBullet(o, aimD, 'player', 'mg');
    triggerMuzzleFlash(o.clone().addScaledVector(aimD, 0.8));

    state.reticleKick = 3.5;
    state.pitch = Math.min(0.5, state.pitch + 0.012);
  }

  const thisMG = { mountPos, baseYaw, update, tryFire, botMount, botUnmount,
                   get botMounted() { return botMountedBot; } };
  state.machineguns.push(thisMG);
  return thisMG;
}

const elMgPrompt = document.getElementById('mg-prompt');

export function tickMachineGuns(dt) {
  // Proximity prompt
  let nearAny = false;
  if (!state.mountedMG && state.player && state.player.alive) {
    for (const mg of state.machineguns) {
      if (state.player.mesh.position.distanceTo(mg.mountPos) < 3.5) { nearAny=true; break; }
    }
  }
  elMgPrompt.style.display = nearAny ? 'block' : 'none';

  for (const mg of state.machineguns) mg.update(dt);

  if (state.mountedMG && state.mgFireHeld) state.mountedMG.tryFire();
}
