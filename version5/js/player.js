import { state } from './state.js';
import { getGroundLevel, resolvePlayerCollision, inWire, MAP_LIMIT } from './world.js';
import { makeCapsule } from './meshes.js';
import { triggerHitFX, spawnParticles, triggerMuzzleFlash } from './fx.js';
import { setHPHUD, showMsg, updateKDHud } from './hud.js';
import { spawnBullet } from './bullets.js';

const SPAWN_POS = new THREE.Vector3(0, 0, -80);

export function initPlayer() {
  const mesh = makeCapsule(0x2255cc, 'smle');
  mesh.position.copy(SPAWN_POS);
  state.scene.add(mesh);

  let hp=100, alive=true, velY=0, grounded=true, deathTimer=-1, wireDmgTimer=0;
  let stamina=100, staminaDrained=false;
  const WALK=4.5, SPRINT=9.0, JUMP=8, GRAV=22, RESPAWN_SEC=5, mv=new THREE.Vector3();
  const STA_DRAIN=22, STA_REGEN=11, STA_LOCK=28;
  const elStaFill = document.getElementById('sta-fill');
  let ammo=10, reserveAmmo=20, reloading=false, reloadTimer=0, shotCd=0;
  const SMLE_MAG=10, SMLE_RELOAD=2.0, SMLE_CD=1.0;
  const elAmmo = document.getElementById('ammo-count');
  const elBayonet    = document.getElementById('bayonet-hud');
  const elBayonetFix = document.getElementById('bayonet-fix-hud');

  // ── Bayonet ──
  let bayonetFixed=false, bayonetFixing=false, bayonetTimer=0, bayonetCd=0;
  const BAYONET_FIX_TIME=3.0, BAYONET_CD=1.2, BAYONET_DMG=50, BAYONET_COST=50, MELEE_R=2.5;

  const elPR    = document.getElementById('player-respawn');
  const elCount = document.getElementById('pr-count');

  function hit(dmg) {
    if (!alive) return;
    hp = Math.max(0, hp-dmg);
    setHPHUD(hp);
    triggerHitFX(dmg);
    if (hp<=0) die();
  }
  function die() {
    alive=false;
    state.scene.remove(mesh);
    deathTimer = RESPAWN_SEC;
    elPR.style.display = 'block';
    elCount.textContent = RESPAWN_SEC;
    state.deathCount++; updateKDHud();
  }
  function respawn() {
    alive=true; hp=100; velY=0; grounded=true; deathTimer=-1;
    ammo=SMLE_MAG; reserveAmmo=20;
    bayonetFixed=false; bayonetFixing=false; bayonetTimer=0; bayonetCd=0;
    mesh.position.copy(SPAWN_POS);
    mesh.position.y = getGroundLevel(SPAWN_POS.x, SPAWN_POS.z);
    state.scene.add(mesh);
    setHPHUD(100);
    elPR.style.display = 'none';
    showMsg('Respawned!', 1500);
  }
  function toggleBayonet() {
    if (!alive) return;
    if (bayonetFixed) {
      bayonetFixed=false; bayonetFixing=false; bayonetTimer=0;
      elBayonetFix.style.display='none';
      showMsg('Bayonet removed', 1000);
    } else if (bayonetFixing) {
      bayonetFixing=false; bayonetTimer=0;
      elBayonetFix.style.display='none';
      showMsg('Cancelled', 800);
    } else {
      bayonetFixing=true; bayonetTimer=BAYONET_FIX_TIME;
    }
  }
  function tryBayonet() {
    if (!bayonetFixed || bayonetCd > 0) return false;
    if (stamina < BAYONET_COST) { showMsg('Not enough stamina!', 900); return false; }
    let hit_=false, killed=false;
    state.bots.forEach(b => {
      if (!b.alive || b.type!=='enemy') return;
      if (mesh.position.distanceTo(b.mesh.position) < MELEE_R) {
        b.hit(BAYONET_DMG, 'player'); hit_=true;
        if (!b.alive) killed=true;
      }
    });
    if (!hit_) return false;
    stamina = Math.max(0, stamina - BAYONET_COST);
    bayonetCd = BAYONET_CD;
    state.reticleKick = 9;
    if (killed) showMsg('Melee kill!', 700, '#ff4444');
    const dp = mesh.position.clone(); dp.y+=0.8;
    spawnParticles(dp, 5, 'spark', 4);
    return true;
  }
  function update(dt) {
    if (state.mountedMG) return; // frozen at gun
    if (!alive) {
      if (deathTimer > 0) {
        deathTimer -= dt;
        elCount.textContent = Math.max(1, Math.ceil(deathTimer));
        if (deathTimer <= 0) respawn();
      }
      return;
    }
    // ── Bayonet fix progress ──
    if (bayonetFixing) {
      bayonetTimer -= dt;
      elBayonetFix.style.display = 'block';
      elBayonetFix.textContent = 'FIXING BAYONET... ' + Math.ceil(bayonetTimer) + 's';
      elBayonet.style.display = 'none';
      if (bayonetTimer <= 0) {
        bayonetFixing=false; bayonetFixed=true;
        elBayonetFix.style.display = 'none';
        showMsg('Bayonet fixed!', 1500);
      }
    } else {
      elBayonetFix.style.display = 'none';
      if (bayonetFixed) {
        elBayonet.style.display = 'block';
        elBayonet.style.color = bayonetCd > 0 ? '#ff8800' : '#88ff88';
        elBayonet.textContent = bayonetCd > 0 ? 'BAYONET [' + bayonetCd.toFixed(1) + 's]' : 'BAYONET READY';
      } else {
        elBayonet.style.display = 'none';
      }
    }
    if (bayonetCd > 0) bayonetCd = Math.max(0, bayonetCd - dt);

    mv.set(0,0,0);
    if (state.keys['KeyW']) mv.z-=1;
    if (state.keys['KeyS']) mv.z+=1;
    if (state.keys['KeyA']) mv.x-=1;
    if (state.keys['KeyD']) mv.x+=1;
    // ── Stamina ──
    const wantSprint = state.keys['ShiftLeft'] || state.keys['ShiftRight'];
    const moving = mv.lengthSq() > 0;
    if (wantSprint && moving && !staminaDrained) {
      stamina = Math.max(0, stamina - STA_DRAIN * dt);
      if (stamina === 0) staminaDrained = true;
    } else {
      stamina = Math.min(100, stamina + STA_REGEN * dt);
      if (staminaDrained && stamina >= STA_LOCK) staminaDrained = false;
    }
    elStaFill.style.width = stamina + '%';
    elStaFill.style.background = staminaDrained ? '#e74c3c' : stamina < 30 ? '#e67e22' : '#f39c12';
    // ── Reload / shot cooldown tick ──
    if (shotCd > 0) shotCd = Math.max(0, shotCd - dt);
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        const refill = Math.min(SMLE_MAG - ammo, reserveAmmo);
        reserveAmmo -= refill; ammo += refill; reloading=false;
      }
    }
    // ── Ammo HUD ──
    if (reloading) {
      elAmmo.textContent = 'RELOADING...';
      elAmmo.style.color = '#e74c3c';
    } else if (ammo === 0 && reserveAmmo === 0) {
      elAmmo.textContent = bayonetFixed ? 'BAYONET ONLY' : 'NO AMMO';
      elAmmo.style.color = '#ff3300';
    } else {
      elAmmo.textContent = ammo + '/' + SMLE_MAG + ' [' + reserveAmmo + ']';
      elAmmo.style.color = ammo <= 3 ? '#e67e22' : '#f0e68c';
    }
    // ── Movement ──
    const onWire = inWire(mesh.position);
    if (moving) {
      mv.normalize().applyEuler(new THREE.Euler(0, state.yaw, 0));
      const canSprint = wantSprint && !staminaDrained;
      const spdBase = canSprint ? SPRINT : WALK;
      mesh.position.addScaledVector(mv, spdBase * (onWire ? 0.3 : 1) * dt);
      mesh.rotation.y = Math.atan2(mv.x, mv.z);
    }
    if (onWire) {
      wireDmgTimer -= dt;
      if (wireDmgTimer <= 0) { wireDmgTimer = 0.3; hit(3); }
    } else { wireDmgTimer = 0; }
    if (state.keys['Space'] && grounded) { velY=JUMP; grounded=false; }
    velY -= GRAV*dt;
    mesh.position.y += velY*dt;
    const gnd = getGroundLevel(mesh.position.x, mesh.position.z);
    if (mesh.position.y <= gnd) { mesh.position.y=gnd; velY=0; grounded=true; }
    resolvePlayerCollision(mesh.position);
    mesh.position.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, mesh.position.x));
    mesh.position.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, mesh.position.z));
  }
  function canShoot() { return alive && ammo > 0 && !reloading && shotCd <= 0; }
  function afterShoot() {
    ammo = Math.max(0, ammo-1);
    shotCd = SMLE_CD;
    if (ammo === 0 && reserveAmmo > 0) { reloading=true; reloadTimer=SMLE_RELOAD; }
  }
  function startReload() {
    if (!alive || reloading || ammo===SMLE_MAG || reserveAmmo===0) return;
    reloading=true; reloadTimer=SMLE_RELOAD;
  }

  const playerObj = { mesh, update, hit, canShoot, afterShoot, startReload, toggleBayonet, tryBayonet,
    get alive(){return alive;}, get bayonetFixed(){return bayonetFixed;} };
  state.player = playerObj;

  // Bayonet blade mesh on the player's rifle (visible only when fixed)
  const _bayonetMat = new THREE.MeshLambertMaterial({color:0x888888});
  const playerBayonetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.022,0.022,0.44), _bayonetMat);
  playerBayonetMesh.position.set(0.30, 0.85, -0.70);
  playerBayonetMesh.visible = false;
  mesh.add(playerBayonetMesh);

  // Store bayonet mesh reference for tickBayonetMesh
  playerObj._bayonetMesh = playerBayonetMesh;
}

export function playerShoot() {
  if (!state.player) return;
  if (state.player.bayonetFixed) { state.player.tryBayonet(); return; }
  if (!state.player.canShoot()) return;
  const spread = state.adsProgress > 0.5 ? 0.012 : 0.065;
  const dir = new THREE.Vector3(
    (Math.random()-.5)*spread,
    (Math.random()-.5)*spread,
    -1
  ).applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ')).normalize();
  const o = state.player.mesh.position.clone(); o.y+=1.3;
  spawnBullet(o, dir, 'player', 'smle');
  triggerMuzzleFlash(o.clone().addScaledVector(dir, 0.8));
  state.player.afterShoot();
  state.reticleKick = state.adsProgress > 0.5 ? 1.5 : 5;
}

export function tickBayonetMesh() {
  if (!state.player || !state.player._bayonetMesh) return;
  state.player._bayonetMesh.visible = state.player.bayonetFixed;
}
