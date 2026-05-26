import { state } from './state.js';

// ─── Blood overlay ───────────────────────────────────────────────────
const elBlood   = document.getElementById('blood-overlay');
export let bloodAlpha = 0;
export let bloodTimer = 0;
export const BLOOD_FADE = 3.0;

export function triggerHitFX(dmg) {
  bloodAlpha = Math.min(1.0, bloodAlpha + dmg / 80);
  bloodTimer = BLOOD_FADE;
  elBlood.style.opacity = bloodAlpha.toFixed(3);
  document.body.classList.remove('flinching');
  void document.body.offsetWidth;
  document.body.classList.add('flinching');
}
document.body.addEventListener('animationend', () => document.body.classList.remove('flinching'));

export function tickBlood(dt) {
  if (bloodTimer <= 0) return;
  bloodTimer = Math.max(0, bloodTimer - dt);
  const fade = bloodTimer / BLOOD_FADE;
  elBlood.style.opacity = (bloodAlpha * fade).toFixed(3);
  if (bloodTimer === 0) bloodAlpha = 0;
}

// ─── Muzzle flash ────────────────────────────────────────────────────
let muzzleFlashMesh = null;
let muzzleLight = null;
let _muzzleTimer = 0;
const MUZZLE_DUR = 0.065;

// ─── Particles ──────────────────────────────────────────────────────
const _particles = [];
let _partGeo = null;
let _partMats = null;

// ─── Bombardment ────────────────────────────────────────────────────
const _shellQueue = [];
const elArtillery = document.getElementById('artillery-hud');
let _artilleryLabel = '';

export function initFX() {
  // Muzzle flash mesh and light
  muzzleFlashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 6),
    new THREE.MeshBasicMaterial({ color:0xffffaa, transparent:true, opacity:1 })
  );
  muzzleFlashMesh.visible = false;
  state.scene.add(muzzleFlashMesh);

  muzzleLight = new THREE.PointLight(0xffee88, 0, 14);
  state.scene.add(muzzleLight);

  // Particle geometry and materials
  _partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  _partMats = {
    spark: new THREE.MeshBasicMaterial({ color:0xff7722 }),
    dirt:  new THREE.MeshBasicMaterial({ color:0x6b5535 }),
  };
}

export function triggerMuzzleFlash(pos) {
  if (!muzzleFlashMesh) return;
  muzzleFlashMesh.position.copy(pos);
  muzzleFlashMesh.visible = true;
  muzzleLight.position.copy(pos);
  muzzleLight.intensity = 4.0;
  _muzzleTimer = MUZZLE_DUR;
}

export function tickMuzzleFlash(dt) {
  if (_muzzleTimer <= 0) return;
  _muzzleTimer = Math.max(0, _muzzleTimer - dt);
  const t = _muzzleTimer / MUZZLE_DUR;
  muzzleFlashMesh.material.opacity = t;
  muzzleLight.intensity = t * 4.0;
  if (_muzzleTimer <= 0) muzzleFlashMesh.visible = false;
}

export function spawnParticles(pos, count, type, speed) {
  if (!_partGeo || !_partMats) return;
  const mat = _partMats[type] || _partMats.dirt;
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(_partGeo, mat);
    m.position.copy(pos);
    const v = new THREE.Vector3(
      (Math.random()-0.5)*speed*2,
      Math.random()*speed+1.5,
      (Math.random()-0.5)*speed*2
    );
    state.scene.add(m);
    _particles.push({ mesh:m, vel:v, life:0.5+Math.random()*0.35 });
  }
}

export function tickParticles(dt) {
  for (let i = _particles.length-1; i >= 0; i--) {
    const p = _particles[i];
    p.life -= dt;
    if (p.life <= 0) { state.scene.remove(p.mesh); _particles.splice(i,1); continue; }
    p.vel.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0) p.mesh.position.y = 0;
    p.mesh.scale.setScalar(Math.min(1, p.life * 4));
  }
}

export function startBombardment(targetType) {
  _artilleryLabel = targetType === 'ally' ? 'ENEMY ARTILLERY ATTACK INBOUND' : 'ALLY ARTILLERY ATTACK INBOUND';
  for (let i = 0; i < 3; i++) {
    _shellQueue.push({ t: 1.2 + i * 2.0 + Math.random() * 0.8, targetType });
  }
}

export function tickBombardment(dt) {
  for (let i = _shellQueue.length - 1; i >= 0; i--) {
    _shellQueue[i].t -= dt;
    if (_shellQueue[i].t <= 0) {
      landShell(_shellQueue[i].targetType);
      _shellQueue.splice(i, 1);
    }
  }
  if (_shellQueue.length > 0) {
    elArtillery.style.display = 'block';
    elArtillery.textContent = _artilleryLabel + ' — ' + _shellQueue.length;
  } else {
    elArtillery.style.display = 'none';
  }
}

function landShell(targetType) {
  // Import getGroundLevel lazily to avoid circular dep at module load
  // We access it via a dynamic pattern using the world module's exported fn
  // (getGroundLevel is passed in via a module-level reference set after init)
  const pool = [];
  if (targetType === 'ally' && state.player && state.player.alive)
    pool.push(state.player.mesh.position);
  state.bots.filter(b => b.type === targetType && b.alive)
    .forEach(b => pool.push(b.mesh.position));

  let pos;
  if (pool.length > 0) {
    const base = pool[Math.floor(Math.random() * pool.length)];
    pos = base.clone();
    pos.x += (Math.random() - 0.5) * 8;
    pos.z += (Math.random() - 0.5) * 8;
  } else {
    pos = new THREE.Vector3(
      (Math.random() - 0.5) * 60, 0,
      targetType === 'ally' ? -20 - Math.random()*25 : 20 + Math.random()*25
    );
  }
  pos.y = Math.max(0, _getGroundLevel(pos.x, pos.z));

  const p1 = pos.clone(); p1.y += 1.2;
  spawnParticles(p1, 22, 'spark', 11);
  const p2 = pos.clone(); p2.y += 0.4;
  spawnParticles(p2, 14, 'dirt', 7);

  const BLAST_R = 9;
  if (state.player && state.player.alive) {
    const pd = state.player.mesh.position.distanceTo(pos);
    if (pd < BLAST_R * 2) {
      document.body.classList.remove('flinching');
      void document.body.offsetWidth;
      document.body.classList.add('flinching');
    }
    if (targetType === 'ally' && pd < BLAST_R) {
      state.player.hit(Math.round(60 * (1 - pd / BLAST_R)));
    }
  }

  state.bots.forEach(b => {
    if (!b.alive || b.type !== targetType) return;
    const d = b.mesh.position.distanceTo(pos);
    if (d < BLAST_R) b.hit(Math.round(60 * (1 - d / BLAST_R)));
  });
}

// Lazy reference to getGroundLevel — set by main.js after world is built
let _getGroundLevel = (x, z) => 0;
export function setGroundLevelFn(fn) {
  _getGroundLevel = fn;
}
