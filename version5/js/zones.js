import { state } from './state.js';
import { showMsg, updateKDHud } from './hud.js';
import { getGroundLevel } from './world.js';

export const ZONE_BASE_TIME  = 20;
export const ZONE_DRAIN_RATE = 100 / 90;

export const ZONE_DEFS = [
  { x:  0, z:  0, color:0xff6600, label:"No Man's Land" },
  { x:-22, z:-18, color:0x2299ff, label:'Allied Trench' },
  { x: 22, z:-40, color:0x22ffdd, label:'The Village'   },
  { x:-18, z: 17, color:0xaa22ff, label:'Crater Post'   },
  { x: 18, z: 20, color:0xff4455, label:'German Line'   },
];

export function pctToThreeColor(pct) {
  const c = new THREE.Color(1, 1, 1);
  if (pct > 0) c.lerp(new THREE.Color(0x1a44b2), pct / 100);
  else if (pct < 0) c.lerp(new THREE.Color(0xb21a1a), -pct / 100);
  return c;
}

export function pctToCSSColor(pct) {
  if (pct === 0) return '#ffffff';
  const t = Math.abs(pct) / 100;
  const hue = pct > 0 ? 220 : 0;
  return `hsl(${hue},${(t*70).toFixed(0)}%,${(100-t*65).toFixed(0)}%)`;
}

export function makeZone(def, idx) {
  const POS = new THREE.Vector3(def.x, getGroundLevel(def.x, def.z) + 0.05, def.z);
  const RAD = 3.5;
  const grp = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(RAD, RAD, 0.12, 32),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.6 })
  );
  grp.add(ring);

  const fill = new THREE.Mesh(
    new THREE.CylinderGeometry(RAD-0.4, RAD-0.4, 1, 32),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.35 })
  );
  fill.scale.y=0.001; fill.position.y=0.5; grp.add(fill);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 5, 6),
    new THREE.MeshBasicMaterial({ color:0xffffff })
  );
  pole.position.y=2.5; grp.add(pole);

  grp.position.copy(POS); state.scene.add(grp);

  const elFill  = document.getElementById('z'+idx+'-fill');
  const elLabel = document.getElementById('z'+idx+'-label');

  let pct=0, friendlyInside=false, friendlyCaptured=false, enemyCaptured=false;

  function applyLiveColor() {
    const col = pctToThreeColor(pct);
    fill.material.color.copy(col);
    ring.material.color.copy(col);
    pole.material.color.copy(col);
    elFill.style.background = pctToCSSColor(pct);
    elFill.style.width = Math.abs(pct).toFixed(1) + '%';
  }

  return {
    update(dt) {
      const playerIn  = state.player && state.player.alive && state.player.mesh.position.distanceTo(POS) < RAD;
      const allyCount = (playerIn ? 1 : 0) +
                        state.bots.filter(b=>b.type==='ally'&&b.alive&&b.mesh.position.distanceTo(POS)<RAD).length;
      const enemyCount = state.bots.filter(b=>b.type==='enemy'&&b.alive&&b.mesh.position.distanceTo(POS)<RAD).length;
      const fi = allyCount > 0;
      const ei = enemyCount > 0;
      friendlyInside = fi;
      const contested = fi && ei;

      const allyRate  = (100/ZONE_BASE_TIME) * (1 + (allyCount  - 1) * 0.10);
      const enemyRate = (100/ZONE_BASE_TIME) * (1 + (enemyCount - 1) * 0.10);

      if (!friendlyCaptured && !enemyCaptured) {
        if      (fi && !ei) pct = Math.min(100,  pct + allyRate  * dt);
        else if (ei && !fi) pct = Math.max(-100, pct - enemyRate * dt);
        else if (!fi && !ei) {
          if (pct > 0) pct = Math.max(0,    pct - ZONE_DRAIN_RATE*dt);
          else         pct = Math.min(0,    pct + ZONE_DRAIN_RATE*dt);
        }

        if (pct >= 100) {
          friendlyCaptured = true;
          fill.material.color.set(0xffd700); fill.material.opacity=0.65;
          ring.material.color.set(0xffd700); pole.material.color.set(0xffd700);
          elFill.style.background='#ffd700'; elFill.style.width='100%';
          elLabel.textContent=def.label+': CAPTURED ★';
          if (playerIn) { state.pointsVal+=200; updateKDHud(); showMsg('Zone '+def.label+' +200 ★', 3000, '#ffdd00'); }
          else { showMsg('Zone '+def.label+' conquered!', 3000, '#ffdd00'); }
          checkWin();
        } else if (pct <= -100) {
          enemyCaptured = true;
          fill.material.color.set(0xb21a1a); fill.material.opacity=0.65;
          ring.material.color.set(0xb21a1a); pole.material.color.set(0xb21a1a);
          elFill.style.background='#b21a1a'; elFill.style.width='100%';
          elLabel.textContent=def.label+': ENEMY ★';
          showMsg('Zone '+def.label+' captured by enemies!', 3000);
        } else {
          applyLiveColor();
          ring.material.opacity = contested
            ? 0.5 + 0.3*Math.abs(Math.sin(Date.now()*.006))
            : 0.35 + 0.25*Math.sin(Date.now()*.003);
          if (contested) {
            elLabel.textContent = def.label + ': CONTESTED ⚔';
          } else if (fi) {
            const bonus = allyCount > 1 ? ' [×' + allyCount + ']' : '';
            elLabel.textContent = def.label + ': ' + Math.floor(Math.abs(pct)) + '% (Ours)' + bonus;
          } else if (ei) {
            const bonus = enemyCount > 1 ? ' [×' + enemyCount + ']' : '';
            elLabel.textContent = def.label + ': ' + Math.floor(Math.abs(pct)) + '% (Enemy)' + bonus;
          } else {
            elLabel.textContent = def.label + ': ' + Math.floor(Math.abs(pct)) + '%';
          }
        }
      } else if (friendlyCaptured) {
        if (ei && !fi) {
          pct = Math.max(-100, pct - enemyRate * dt);
          if (pct < 100) {
            friendlyCaptured = false;
            fill.material.opacity = 0.35;
            applyLiveColor();
          }
        } else {
          ring.material.opacity=0.6+0.1*Math.sin(Date.now()*.002);
        }
      } else if (enemyCaptured) {
        if (fi && !ei) {
          pct = Math.min(100, pct + allyRate * dt);
          if (pct > -100) {
            enemyCaptured = false;
            fill.material.opacity = 0.35;
            applyLiveColor();
          }
        } else {
          ring.material.opacity=0.6+0.1*Math.sin(Date.now()*.002);
        }
      }

      const p = Math.abs(pct)/100;
      fill.scale.y=Math.max(0.001,p); fill.position.y=0.5*p;
    },
    get underAttack()   { return friendlyInside && !friendlyCaptured; },
    get pos()           { return POS; },
    get pct()           { return pct; },
    get captured()      { return friendlyCaptured; },
    get enemyCaptured() { return enemyCaptured; },
    get capturable()    { return !enemyCaptured; }
  };
}

export function initZones() {
  ZONE_DEFS.forEach((def, i) => state.zones.push(makeZone(def, i)));
}

export function checkWin() {
  if (!state.zones.every(z => z.captured)) return;
  document.getElementById('win-screen').style.display = 'flex';
  if (state.mouseLocked) document.exitPointerLock();
}
