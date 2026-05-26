import { state } from './state.js';
import { buildWorld, getGroundLevel } from './world.js';
import { initFX, tickBlood, tickMuzzleFlash, tickParticles, tickBombardment, setGroundLevelFn } from './fx.js';
import { initWeather, tickRain, tickDayNight } from './weather.js';
import { initBullets, updateBullets } from './bullets.js';
import { initHud, updateReticle, drawMinimap } from './hud.js';
import { initPlayer, playerShoot, tickBayonetMesh } from './player.js';
import { initBots, tickRespawn, tickAllyRespawn } from './bots.js';
import { initZones } from './zones.js';
import { addMachineGun, tickMachineGuns } from './machineguns.js';

// ═══════════════════════════════════════════════
//  RENDERER + SCENE + CAMERA
// ═══════════════════════════════════════════════

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x3d4a4a);
scene.fog = new THREE.Fog(0x3d4a4a, 18, 75);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
const clock  = new THREE.Clock();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ═══════════════════════════════════════════════
//  LIGHTING
// ═══════════════════════════════════════════════

const ambientLight = new THREE.AmbientLight(0x8899aa, 0.38);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(0x9aaabb, 0.42);
sun.position.set(30, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near:1, far:140, left:-60, right:60, top:60, bottom:-60 });
scene.add(sun);

// ═══════════════════════════════════════════════
//  POPULATE STATE
// ═══════════════════════════════════════════════

state.scene       = scene;
state.camera      = camera;
state.sun         = sun;
state.ambientLight = ambientLight;

// ═══════════════════════════════════════════════
//  INITIALISE SUBSYSTEMS (order matters)
// ═══════════════════════════════════════════════

initFX();
initWeather();
initBullets();
initHud();
buildWorld();
setGroundLevelFn(getGroundLevel);
initPlayer();
initBots();
initZones();

// Machine gun emplacements
addMachineGun(20, -12, Math.PI);   // Allied MG: north edge of the village
addMachineGun(-16, 26, 0);         // German MG: forward German position

// ═══════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════

const cnv = renderer.domElement;
const aimHint = document.getElementById('aim-hint');
const elMgHud = document.getElementById('mg-hud');

window.addEventListener('keydown', e => {
  state.keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && state.player) state.player.startReload();
  if (e.code === 'KeyF' && state.player) state.player.toggleBayonet();
  if (e.code === 'KeyE') {
    if (state.mountedMG) {
      state.mountedMG = null;
      elMgHud.style.display = 'none';
    } else if (state.player && state.player.alive) {
      for (const mg of state.machineguns) {
        if (state.player.mesh.position.distanceTo(mg.mountPos) < 3.5) {
          if (mg.botMounted) mg.botUnmount();
          state.mountedMG = mg;
          state.yaw = Math.max(mg.baseYaw - Math.PI/4, Math.min(mg.baseYaw + Math.PI/4, state.yaw));
          state.pitch = 0;
          elMgHud.style.display = 'block';
          break;
        }
      }
    }
  }
});
window.addEventListener('keyup', e => { state.keys[e.code] = false; });

let dragging = false, lastX = 0, lastY = 0;

cnv.addEventListener('click', () => {
  if (!state.mouseLocked) cnv.requestPointerLock();
  else if (!state.mountedMG) playerShoot();
});

document.addEventListener('pointerlockchange', () => {
  state.mouseLocked = document.pointerLockElement === cnv;
  aimHint.style.display = state.mouseLocked ? 'none' : 'block';
});

document.addEventListener('mousemove', e => {
  if (state.mouseLocked) {
    state.yaw -= e.movementX * 0.002;
    if (state.mountedMG) state.yaw = Math.max(state.mountedMG.baseYaw - Math.PI/4, Math.min(state.mountedMG.baseYaw + Math.PI/4, state.yaw));
    state.pitch -= e.movementY * 0.002;
    state.pitch  = Math.max(-0.5, Math.min(0.5, state.pitch));
  } else if (dragging) {
    state.yaw   -= (e.clientX - lastX) * 0.004;
    state.pitch -= (e.clientY - lastY) * 0.004;
    state.pitch  = Math.max(-0.5, Math.min(0.5, state.pitch));
    lastX = e.clientX; lastY = e.clientY;
  }
});

window.addEventListener('mousedown', e => {
  if (e.button === 2) {
    if (state.mouseLocked) state.isADS = true;
    else { dragging=true; lastX=e.clientX; lastY=e.clientY; }
  }
  if (e.button === 0) {
    if (state.mountedMG) state.mgFireHeld = true;
    else if (!state.mouseLocked) playerShoot();
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 2) { state.isADS=false; dragging=false; }
  if (e.button === 0) state.mgFireHeld = false;
});
window.addEventListener('contextmenu', e => e.preventDefault());

// ═══════════════════════════════════════════════
//  CAMERA — third-person behind player
// ═══════════════════════════════════════════════

const _tpPos  = new THREE.Vector3();
const _eyePos = new THREE.Vector3();
const _tpLook = new THREE.Vector3();
const _fpLook = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _fpAimDir = new THREE.Vector3();

function updateCamera() {
  if (state.mountedMG) {
    camera.position.set(state.mountedMG.mountPos.x, state.mountedMG.mountPos.y + 1.25, state.mountedMG.mountPos.z);
    const aimD = new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
    camera.lookAt(camera.position.clone().addScaledVector(aimD, 10));
    camera.fov = 55; camera.updateProjectionMatrix();
    return;
  }
  if (!state.player || !state.player.alive) return;
  const t    = state.adsProgress;
  const sinY = Math.sin(state.yaw), cosY = Math.cos(state.yaw);

  _tpPos.set(
    state.player.mesh.position.x + sinY * 7.5,
    state.player.mesh.position.y + 2.8 + Math.sin(state.pitch) * 4.5,
    state.player.mesh.position.z + cosY * 7.5
  );

  _eyePos.set(
    state.player.mesh.position.x,
    state.player.mesh.position.y + 1.45,
    state.player.mesh.position.z
  );

  camera.position.lerpVectors(_tpPos, _eyePos, t);

  _tpLook.set(state.player.mesh.position.x, state.player.mesh.position.y + 1.1, state.player.mesh.position.z);
  _fpAimDir.set(0, 0, -1).applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
  _fpLook.copy(_eyePos).addScaledVector(_fpAimDir, 10);

  _camLookTarget.lerpVectors(_tpLook, _fpLook, t);
  camera.lookAt(_camLookTarget);

  camera.fov = 70 - 25 * t;
  camera.updateProjectionMatrix();

  state.player.mesh.visible = t < 0.8;
}

// ═══════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  state.adsProgress += ((state.isADS ? 1 : 0) - state.adsProgress) * Math.min(1, dt * 14);

  if (state.player) state.player.update(dt);
  state.bots.forEach(b => b.update(dt));
  updateBullets(dt);
  state.zones.forEach(z => z.update(dt));
  tickRespawn(dt);
  tickAllyRespawn(dt);
  tickBlood(dt);
  tickMuzzleFlash(dt);
  tickParticles(dt);
  tickBombardment(dt);
  tickRain(dt);
  tickDayNight(dt);
  tickMachineGuns(dt);
  tickBayonetMesh();
  updateCamera();
  updateReticle(dt);
  drawMinimap();
  renderer.render(scene, camera);
}

updateCamera(); // pre-position camera so first frame has no jump
animate();
