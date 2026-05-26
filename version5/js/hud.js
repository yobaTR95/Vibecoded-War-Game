import { state } from './state.js';
import { CRATER_ZONES, getGroundLevel } from './world.js';

// ─── Message system ──────────────────────────────────────────────────
const _activeMessages = [];
const _MSG_STEP = 38;

export function showMsg(text, dur=2000, color='#fff') {
  const el = document.createElement('div');
  const baseY = Math.round(window.innerHeight * 0.38);
  const idx = _activeMessages.length;
  Object.assign(el.style, {
    position:'fixed',
    top:(baseY + idx * _MSG_STEP) + 'px',
    left:'50%', transform:'translateX(-50%)',
    color:color, fontSize:'22px', fontFamily:'monospace',
    textShadow:'0 0 8px rgba(0,0,0,1),0 0 4px rgba(0,0,0,1),1px 1px 2px #000',
    zIndex:'20', pointerEvents:'none', whiteSpace:'nowrap',
  });
  el.textContent = text;
  document.body.appendChild(el);
  _activeMessages.push(el);
  function remove() {
    const i = _activeMessages.indexOf(el);
    if (i >= 0) {
      _activeMessages.splice(i, 1); el.remove();
      const base = Math.round(window.innerHeight * 0.38);
      _activeMessages.forEach((m, j) => { m.style.top = (base + j * _MSG_STEP) + 'px'; });
    }
  }
  if (dur > 0) {
    setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; }, dur);
    setTimeout(remove, dur + 600);
  }
}

// ─── HP HUD ──────────────────────────────────────────────────────────
const elHP   = document.getElementById('hp-fill');
const elHPLb = document.getElementById('hp-label');

export function setHPHUD(hp) {
  elHP.style.width = hp + '%';
  elHPLb.textContent = 'HP: ' + hp;
  elHP.style.background = hp > 50 ? '#27ae60' : hp > 25 ? '#f1c40f' : '#e74c3c';
}

// ─── Kill/Death/Points HUD ───────────────────────────────────────────
const elKDHud = document.getElementById('kd-hud');

export function updateKDHud() {
  elKDHud.textContent = '🎯 ' + state.killCount + '  💀 ' + state.deathCount + '  ★ ' + state.pointsVal;
}

// ─── Reticle ─────────────────────────────────────────────────────────
const reticleEl = document.getElementById('reticle');
const rT = document.getElementById('r-t'), rB = document.getElementById('r-b');
const rL = document.getElementById('r-l'), rR = document.getElementById('r-r');
const rD = document.getElementById('r-d');

const _aimDir = new THREE.Vector3();
const _aimPt  = new THREE.Vector3();

export function updateReticle(dt) {
  state.reticleKick = Math.max(0, state.reticleKick - dt * 30);

  if (state.player && state.player.alive) {
    _aimDir.set(0, 0, -1).applyEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
    _aimPt.copy(state.player.mesh.position);
    _aimPt.y += 1.3;
    _aimPt.addScaledVector(_aimDir, 40);
    _aimPt.project(state.camera);

    reticleEl.style.left = ((_aimPt.x * 0.5 + 0.5) * window.innerWidth)  + 'px';
    reticleEl.style.top  = ((-_aimPt.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    reticleEl.style.display = 'block';
  } else {
    reticleEl.style.display = 'none';
  }

  const t   = state.adsProgress;
  const gap = 16 - 11*t + state.reticleKick;
  const len = Math.round(11 - 3*t);

  rT.style.height = len+'px'; rT.style.top  = -(gap+len)+'px'; rT.style.left = '-1px';
  rB.style.height = len+'px'; rB.style.top  = gap+'px';        rB.style.left = '-1px';
  rL.style.width  = len+'px'; rL.style.left = -(gap+len)+'px'; rL.style.top  = '-1px';
  rR.style.width  = len+'px'; rR.style.left = gap+'px';        rR.style.top  = '-1px';
  rD.style.opacity = Math.max(0, (t - 0.5) * 2).toFixed(2);
}

// ─── Minimap ─────────────────────────────────────────────────────────
const mmCanvas = document.getElementById('minimap');
const mmCtx    = mmCanvas.getContext('2d');

const MM_SIZE  = 160;
const MM_WORLD = 80;
const _mmS     = MM_SIZE / (MM_WORLD * 2);

const MM_BUILDINGS = [
  [18,-35,6,4], [29,-45,6,4], [16,-53,6,4],
  [24,-32,5,3], [33,-43,5,3], [20,-49,5,3], [28,-57,5,3]
];

const MM_TREES = [
  [-28,-15],[26,-20],[-35,0],[-45,12],[-38,-8],[38,-2],[44,10],[32,20],
  [5,-32],[-15,-42],[-5,38],[15,44],[-22,28],[30,25],
  [-45,0],[-52,9],[-62,-2],[-48,-18],[-58,14],[-70,5],
  [45,0],[52,-9],[62,2],[48,18],[58,-14],[70,-5],
  [-12,-50],[14,-54],[-22,-64],[26,-60],[0,-70],
  [12,50],[-14,54],[22,64],[-26,60],[0,70],
  [-68,-32],[-58,-48],[-74,-18],[68,-32],[58,-48],[74,-18],
  [-68,32],[-58,48],[-74,18],[68,32],[58,48],[74,18],
];

const MM_CRATERS_EXTRA = [
  [-25,-8,3.5],[28,-12,3.8],[-30,2,4],[25,3,3.5],[-8,-22,3],[15,-28,3.5],
  [-28,-3,4.5],[-33,8,4],[28,3,4.5],[33,-8,4],[-32,-5,4],[35,5,4],[30,18,4],
  [-40,8,3.5],[-50,4,4],[-58,-8,3.8],[50,-4,4],[58,8,3.8],[65,-6,3.5],
  [-48,-22,4.2],[-60,16,3.6],[-72,-4,4],[48,22,4.2],[60,-16,3.6],[72,4,4],
  [-5,-30,3.5],[10,-38,4],[-20,-35,3.2],[5,35,3],[-8,42,3.5],[20,38,3.2],
  [6,-50,3.5],[-20,-55,4],[24,-58,3.2],[-9,-65,3.5],[18,-68,4],
  [-6,50,3.5],[20,55,4],[-24,58,3.2],[9,65,3.5],[-18,68,4],
  [-65,-38,3.5],[-72,-26,4],[-62,-50,3.2],[65,-38,3.5],[72,-26,4],[62,-50,3.2],
  [-65,38,3.5],[-72,26,4],[-62,50,3.2],[65,38,3.5],[72,26,4],[62,50,3.2],
];

const MM_RUINED = [
  [24,-32],[33,-43],[20,-49],[28,-57],
  [-20,-22],[10,25],
  [-48,-30],[-52,32],[48,30],[54,-32],
  [-18,-58],[22,-62],[18,58],[-22,62],
  [-62,-44],[62,-44],[-62,44],[62,44],
];

const MM_ARTILLERY = [
  [-20,-21],[17,23],[-8,-35],[5,42],
  [-62,-20],[-55,30],[62,20],[55,-32],
  [-16,-60],[14,-62],[16,60],[-14,62],
];

const MM_SUPPLY = [
  [-42,-36],[-40,30],[42,36],[40,-30],
  [-10,-56],[10,-56],[-10,56],[10,56],
];

const MM_PLANE   = [[5,68]];
const MM_TANK    = [[52,-6]];
const MM_OBSPOST = [[36,-38]];

export function w2mm(x, z) {
  return [ MM_SIZE/2 + x*_mmS, MM_SIZE/2 + z*_mmS ];
}

// Pre-render topographic base — lazy init in initHud()
let mmTopo = null;

export function initHud() {
  const c = document.createElement('canvas');
  c.width = c.height = MM_SIZE;
  const ctx2 = c.getContext('2d');
  const img  = ctx2.createImageData(MM_SIZE, MM_SIZE);
  for (let py = 0; py < MM_SIZE; py++) {
    for (let px = 0; px < MM_SIZE; px++) {
      const wx = (px - MM_SIZE/2) / _mmS;
      const wz = (py - MM_SIZE/2) / _mmS;
      const h  = getGroundLevel(wx, wz);
      const n  = Math.max(0, Math.min(1, (h + 1.3) / 2.4));
      const idx = (py * MM_SIZE + px) * 4;
      img.data[idx]   = Math.round(12  + n * 108);
      img.data[idx+1] = Math.round(8   + n * 88);
      img.data[idx+2] = Math.round(3   + n * 50);
      img.data[idx+3] = 255;
    }
  }
  ctx2.putImageData(img, 0, 0);
  mmTopo = c;
}

export function drawMinimap() {
  const ctx = mmCtx;
  ctx.clearRect(0, 0, MM_SIZE, MM_SIZE);

  // 1 — Topographic terrain base
  if (mmTopo) {
    ctx.globalAlpha = 0.70;
    ctx.drawImage(mmTopo, 0, 0);
    ctx.globalAlpha = 1.0;
  }

  const s = _mmS;

  // 2 — Building footprints
  ctx.fillStyle = 'rgba(185,150,80,0.80)';
  MM_BUILDINGS.forEach(([bx,bz,bw,bd]) => {
    const [px, pz] = w2mm(bx, bz);
    ctx.fillRect(px - bw*s/2, pz - bd*s/2, bw*s, bd*s);
  });

  // 3 — Landmarks
  ctx.globalAlpha = 0.28;

  ctx.strokeStyle = '#b09060'; ctx.lineWidth = 0.8;
  CRATER_ZONES.forEach(c => {
    const [px,pz] = w2mm(c.x,c.z);
    ctx.beginPath(); ctx.arc(px,pz,c.r*s,0,Math.PI*2); ctx.stroke();
  });
  MM_CRATERS_EXTRA.forEach(([cx,cz,cr]) => {
    const [px,pz] = w2mm(cx,cz);
    ctx.beginPath(); ctx.arc(px,pz,cr*s,0,Math.PI*2); ctx.stroke();
  });

  ctx.fillStyle = '#506838';
  MM_TREES.forEach(([tx,tz]) => {
    const [px,pz] = w2mm(tx,tz);
    ctx.beginPath(); ctx.arc(px,pz,1.5,0,Math.PI*2); ctx.fill();
  });

  ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 0.9;
  MM_RUINED.forEach(([rx,rz]) => {
    const [px,pz] = w2mm(rx,rz);
    ctx.strokeRect(px-2.5,pz-2.5,5,5);
    ctx.beginPath(); ctx.moveTo(px-2.5,pz-2.5); ctx.lineTo(px+2.5,pz+2.5); ctx.stroke();
  });

  ctx.fillStyle = '#d09050';
  MM_ARTILLERY.forEach(([ax,az]) => {
    const [px,pz] = w2mm(ax,az);
    ctx.beginPath();
    ctx.moveTo(px,pz-3.5); ctx.lineTo(px-3,pz+2.5); ctx.lineTo(px+3,pz+2.5);
    ctx.closePath(); ctx.fill();
  });

  ctx.fillStyle = '#70a858';
  MM_SUPPLY.forEach(([sx,sz]) => {
    const [px,pz] = w2mm(sx,sz);
    ctx.fillRect(px-2,pz-2,4,4);
  });

  ctx.strokeStyle = '#a8a850'; ctx.lineWidth = 0.9;
  MM_OBSPOST.forEach(([ox,oz]) => {
    const [px,pz] = w2mm(ox,oz);
    ctx.beginPath(); ctx.arc(px,pz,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px,pz-4); ctx.lineTo(px,pz+4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px-4,pz); ctx.lineTo(px+4,pz); ctx.stroke();
  });

  ctx.strokeStyle = '#8888c8'; ctx.lineWidth = 1.2;
  MM_PLANE.forEach(([px_,pz_]) => {
    const [px,pz] = w2mm(px_,pz_);
    ctx.beginPath(); ctx.moveTo(px-3,pz-3); ctx.lineTo(px+3,pz+3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px+3,pz-3); ctx.lineTo(px-3,pz+3); ctx.stroke();
  });

  ctx.fillStyle = '#787060';
  MM_TANK.forEach(([tx,tz]) => {
    const [px,pz] = w2mm(tx,tz);
    ctx.fillRect(px-3.5,pz-2,7,4);
    ctx.fillStyle = '#505040';
    ctx.fillRect(px-1,pz-3,2,6);
    ctx.fillStyle = '#787060';
  });

  ctx.globalAlpha = 1.0;

  // 4 — Feature labels
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  const [atx, atz] = w2mm(3, -20);
  ctx.fillStyle = 'rgba(120,180,255,0.72)';
  ctx.font = '5px monospace';
  ctx.fillText('ALLIED TRENCH', atx, atz);

  const [gtx, gtz] = w2mm(3, 20);
  ctx.fillStyle = 'rgba(255,110,110,0.72)';
  ctx.font = '5px monospace';
  ctx.fillText('GERMAN TRENCH', gtx, gtz);

  ctx.fillStyle = 'rgba(210,185,110,0.50)';
  ctx.font = '5px monospace';
  ctx.fillText("NO MAN'S LAND", MM_SIZE/2, MM_SIZE/2 - 10);

  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font = 'bold 7px monospace';
  ctx.fillText('N', MM_SIZE/2, 6);
  ctx.fillText('S', MM_SIZE/2, MM_SIZE - 5);

  // 5 — Border
  ctx.strokeStyle = '#556'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, MM_SIZE-1, MM_SIZE-1);

  // 6 — Zones
  state.zones.forEach((zone, i) => {
    const [px, pz] = w2mm(zone.pos.x, zone.pos.z);
    const r = 3.5 * s;
    let col;
    if (zone.captured)           col = '#4499ff';
    else if (zone.enemyCaptured) col = '#ff3333';
    else                         col = '#cccccc';
    ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI*2);
    ctx.fillStyle = col + '55'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(['N','A','V','C','G'][i], px, pz);
  });

  // 7 — Bots
  state.bots.forEach(bot => {
    if (!bot.alive) return;
    const [px, pz] = w2mm(bot.mesh.position.x, bot.mesh.position.z);
    ctx.beginPath(); ctx.arc(px, pz, 2.5, 0, Math.PI*2);
    ctx.fillStyle = bot.type === 'ally' ? '#00ff88' : '#ff4422';
    ctx.fill();
  });

  // 8 — Player
  if (state.player && state.player.alive) {
    const [px, pz] = w2mm(state.player.mesh.position.x, state.player.mesh.position.z);
    const dx = -Math.sin(state.yaw) * 8, dz = -Math.cos(state.yaw) * 8;
    ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px+dx, pz+dz);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI*2);
    ctx.fillStyle = '#4499ff'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }
}
