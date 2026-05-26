import { state } from './state.js';
import { getGroundLevel, MAP_LIMIT } from './world.js';
import { makeCapsule } from './meshes.js';
import { spawnParticles } from './fx.js';
import { spawnBullet } from './bullets.js';
import { triggerMuzzleFlash } from './fx.js';
import { showMsg, updateKDHud } from './hud.js';
import { startBombardment } from './fx.js';

export const ROLES = {
  charger:    { speed:4.5, chaseR:22, shootR:11, retreatHP:18, cd:1.8 },
  suppressor: { speed:3.0, chaseR:26, shootR:20, retreatHP:45, cd:1.2  },
  flanker:    { speed:4.2, chaseR:20, shootR:14, retreatHP:28, cd:2.0  },
  defender:   { speed:3.6, chaseR:18, shootR:13, retreatHP:38, cd:2.0  },
};

export function addBot(type, x, z, patrol=[], role='charger') {
  const mesh = makeCapsule(type==='ally' ? 0x00bb44 : 0xcc2200, type==='enemy' ? 'gew98' : 'smle');
  mesh.position.set(x, 0, z);
  state.scene.add(mesh);

  const R = ROLES[role] || ROLES.charger;

  const ang = Math.random()*Math.PI*2;
  const spr = role==='suppressor' ? 7 : role==='charger' ? 3 : 5;
  const offX = Math.cos(ang)*spr, offZ = Math.sin(ang)*spr;

  const flankSide = Math.random()>.5 ? 1 : -1;

  let hp=100, alive=true, botState=type==='ally'?'follow':'patrol';
  let pidx=0, ft=Math.random()*R.cd, defendPos=null;
  let strafeT=0, strafeDX=1, strafeDZ=0;
  let retreatTimer=0;
  let botSta=80+Math.random()*20, botStaDrained=false;
  let dying=false, deathAnimTimer=0;
  let botAmmo=30, meleeCd=0;
  const BOT_MELEE_R=2.2;
  let lastHitBy='', damagedByPlayer=false;
  const isGunner = type === 'enemy' && Math.random() < 0.1;
  let myMG = null;

  let hpEl=null;
  if (type==='enemy') {
    hpEl=document.createElement('div'); hpEl.className='ehp-wrap';
    hpEl.innerHTML='<div class="ehp-fill"></div>';
    document.getElementById('hud').appendChild(hpEl);
  }

  function hit(dmg, src='') {
    if (!alive) return;
    if (src) lastHitBy=src;
    if (src==='player') damagedByPlayer=true;
    hp=Math.max(0,hp-dmg);
    if (hpEl) hpEl.firstElementChild.style.width=hp+'%';
    if (hp<=R.retreatHP && botState!=='retreat') { botState='retreat'; retreatTimer=3+Math.random()*2; if(myMG){myMG.botUnmount();myMG=null;} }
    if (hp<=0) die();
  }
  function die() {
    if (myMG) { myMG.botUnmount(); myMG=null; }
    alive=false; dying=true; deathAnimTimer=0.7;
    if (hpEl) hpEl.style.display='none';
    if (type==='enemy') {
      if (lastHitBy==='player') {
        state.killCount++; state.pointsVal+=10; updateKDHud(); showMsg('+10', 2000, '#ff4444');
      } else if (damagedByPlayer) {
        state.pointsVal+=2; updateKDHud(); showMsg('+2 assist', 1500, '#ffaa44');
      }
    }
    const dp=mesh.position.clone(); dp.y+=0.8;
    spawnParticles(dp, 8, type==='enemy'?'spark':'dirt', 5);
  }
  function getTarget() {
    let best=null, bd=Infinity;
    if (type==='ally') {
      state.bots.forEach(b=>{ if(b.type!=='enemy'||!b.alive) return; const d=mesh.position.distanceTo(b.mesh.position); if(d<bd){bd=d;best=b;} });
    } else {
      if (state.player && state.player.alive) { bd=mesh.position.distanceTo(state.player.mesh.position); best=state.player; }
      state.bots.forEach(b=>{ if(b.type!=='ally'||!b.alive) return; const d=mesh.position.distanceTo(b.mesh.position); if(d<bd){bd=d;best=b;} });
    }
    return best;
  }
  function step(pos, dt, spd=R.speed) {
    const d=new THREE.Vector3().subVectors(pos,mesh.position); d.y=0;
    const l=d.length(); if(l<0.3) return l;
    d.normalize();
    const effSpd = botStaDrained ? spd*0.55 : spd;
    mesh.position.addScaledVector(d, effSpd*dt);
    mesh.rotation.y=Math.atan2(d.x,d.z); return l;
  }
  function meleeAttack(tgt) {
    if (meleeCd > 0 || botSta < 50) return;
    const dist = mesh.position.distanceTo(tgt.mesh.position);
    if (dist >= BOT_MELEE_R) return;
    meleeCd = 1.5; botSta = Math.max(0, botSta - 50);
    tgt.hit(50);
    const dp = tgt.mesh.position.clone(); dp.y += 0.8;
    spawnParticles(dp, 4, type==='enemy' ? 'spark' : 'dirt', 3);
  }
  function fire(tgt,dt) {
    if (botAmmo <= 0) return;
    const cdMult = type==='enemy' ? 1.4 : 1.0;
    ft-=dt; if(ft>0) return; ft=R.cd*cdMult;
    botAmmo--;
    const wep = type==='enemy' ? 'gew98' : 'smle';
    const o=mesh.position.clone(); o.y+=1.2;
    const a=tgt.mesh.position.clone(); a.y+=1.0;
    const d=new THREE.Vector3().subVectors(a,o).normalize();
    const sp = type==='enemy'
      ? (role==='suppressor' ? 0.20 : 0.55)
      : (role==='suppressor' ? 0.40 : 1.15);
    d.x+=(Math.random()-.5)*sp; d.y+=(Math.random()-.5)*0.4;
    const dNorm = d.normalize();
    spawnBullet(o, dNorm, type, wep);
    triggerMuzzleFlash(o.clone().addScaledVector(dNorm, 0.6));
  }

  function offsetPos(base) {
    return new THREE.Vector3(base.x+offX, base.y, base.z+offZ);
  }
  function flankPos(base) {
    const toT=new THREE.Vector3().subVectors(base,mesh.position); toT.y=0;
    if(toT.length()<0.1) return base.clone();
    toT.normalize();
    return base.clone().addScaledVector(new THREE.Vector3(-toT.z,0,toT.x), flankSide*9);
  }

  function findBestZone() {
    let best=null, bestScore=-Infinity;
    state.zones.forEach(z => {
      if(type==='enemy' && z.enemyCaptured) return;
      if(type==='ally'  && z.captured)      return;
      const d = mesh.position.distanceTo(z.pos);
      const urg = type==='enemy' ? (100+z.pct) : (100-z.pct);
      const score = urg*0.5 - d*0.1;
      if(score>bestScore){ bestScore=score; best=z; }
    });
    return best;
  }

  function update(dt) {
    if (!alive) {
      if (dying) {
        deathAnimTimer -= dt;
        const t = 1 - Math.max(0, deathAnimTimer) / 0.7;
        mesh.rotation.x = t * (Math.PI / 2);
        if (deathAnimTimer <= 0) { state.scene.remove(mesh); dying=false; }
      }
      return;
    }
    if (botState==='chase' || botState==='retreat' || botState==='bayonet') {
      botSta = Math.max(0, botSta - 18*dt);
      if (botSta===0) botStaDrained=true;
    } else {
      botSta = Math.min(100, botSta + 9*dt);
      if (botStaDrained && botSta>=30) botStaDrained=false;
    }
    if (meleeCd > 0) meleeCd = Math.max(0, meleeCd - dt);
    mesh.position.y = getGroundLevel(mesh.position.x, mesh.position.z);
    const tgt=getTarget(), dist=tgt?mesh.position.distanceTo(tgt.mesh.position):Infinity;

    if (botState!=='retreat' && botState!=='chase' && botState!=='shoot') {
      if (role==='charger' || role==='flanker') {
        if (type==='ally' || dist > R.chaseR) {
          const bz = findBestZone();
          if (bz) { defendPos=bz.pos; botState='capture'; }
        }
        if (botState==='capture' && !findBestZone()) {
          botState = type==='ally' ? 'follow' : 'patrol'; defendPos=null;
        }
      } else if (role==='defender') {
        if (type==='enemy') {
          const t=state.zones.find(z=>z.underAttack);
          if(t && dist>R.chaseR){ defendPos=t.pos; botState='defend'; }
        } else {
          const bz = findBestZone();
          if (bz) { defendPos=bz.pos; botState='capture'; }
          if (botState==='capture' && !findBestZone()) { botState='follow'; defendPos=null; }
        }
      } else if (role==='suppressor') {
        if (botState==='patrol' || botState==='follow') {
          const bz = findBestZone();
          if (bz) {
            const backOff = type==='enemy' ? 18 : -5;
            const sz = Math.max(-MAP_LIMIT+5, Math.min(MAP_LIMIT-5, bz.pos.z + backOff));
            defendPos = new THREE.Vector3(bz.pos.x + offX*0.5, 0, sz);
            botState = 'defend';
          }
        }
      }
    }

    // Gunner: seek the German MG when not already engaged
    if (isGunner && !myMG && botState !== 'retreat' && botState !== 'gunner') {
      const mg = state.machineguns.find(m => m.mountPos.z > 0 && !m.botMounted && state.mountedMG !== m);
      if (mg) botState = 'gunner';
    }

    switch(botState) {
      case 'gunner': {
        const mg = state.machineguns.find(m => m.mountPos.z > 0);
        if (!mg || state.mountedMG === mg) { if(myMG){myMG.botUnmount();myMG=null;} botState='patrol'; break; }
        if (mg.botMounted && !myMG) { botState='patrol'; break; } // someone else got there first
        const distToMG = mesh.position.distanceTo(mg.mountPos);
        if (distToMG > 1.5) {
          step(mg.mountPos, dt);
        } else {
          if (!myMG) { mg.botMount(); myMG = mg; }
          mesh.position.x = mg.mountPos.x;
          mesh.position.z = mg.mountPos.z;
          mesh.position.y = mg.mountPos.y - 0.55;
          mesh.rotation.y = mg.baseYaw + Math.PI;
        }
        break;
      }

      case 'retreat': {
        retreatTimer -= dt;
        if (retreatTimer <= 0) {
          botState = tgt ? 'chase' : (type==='enemy' ? 'patrol' : 'follow');
          break;
        }
        const th=type==='ally'
          ? state.bots.find(b=>b.type==='enemy'&&b.alive)
          : (state.player && state.player.alive ? state.player : null);
        if(th){
          const aw=new THREE.Vector3().subVectors(mesh.position,th.mesh.position);
          aw.y=0; aw.normalize();
          mesh.position.addScaledVector(aw, R.speed*1.3*dt);
          mesh.rotation.y=Math.atan2(aw.x,aw.z);
        }
        break;
      }
      case 'defend':
        if(dist<R.chaseR){ botState='chase'; defendPos=null; break; }
        if(role!=='suppressor' && tgt && dist<R.chaseR*2.5)
          step(offsetPos(tgt.mesh.position), dt);
        else
          step(offsetPos(defendPos), dt);
        break;

      case 'capture': {
        if (tgt && dist < BOT_MELEE_R) meleeAttack(tgt);
        else if (tgt && dist < R.shootR) fire(tgt, dt);
        if (type==='enemy' && dist < R.shootR*0.4){ botState='chase'; defendPos=null; break; }
        const dest = role==='flanker' ? flankPos(defendPos) : offsetPos(defendPos);
        step(dest, dt); break;
      }
      case 'patrol':
        if (dist < BOT_MELEE_R && tgt){ botState='bayonet'; break; }
        if (dist < R.chaseR){ botState='chase'; break; }
        if(tgt) step(role==='flanker' ? flankPos(tgt.mesh.position) : offsetPos(tgt.mesh.position), dt);
        else if(patrol.length){
          const wp=new THREE.Vector3(patrol[pidx][0],0,patrol[pidx][1]);
          if(step(wp,dt)<0.5) pidx=(pidx+1)%patrol.length;
        }
        break;

      case 'chase':
        if(!tgt){
          if(type==='ally'){ const bz=findBestZone(); if(bz){ botState='capture'; defendPos=bz.pos; break; } }
          botState=type==='enemy'?'patrol':'follow'; break;
        }
        if (dist < BOT_MELEE_R){ botState='bayonet'; break; }
        if (botAmmo <= 0){ botState='bayonet'; break; }
        if(dist<R.shootR){ botState='shoot'; break; }
        if(dist>R.chaseR*2.2){
          if(type==='ally'){ const bz=findBestZone(); if(bz){ botState='capture'; defendPos=bz.pos; break; } }
          botState=type==='enemy'?'patrol':'follow'; break;
        }
        step(role==='flanker' ? flankPos(tgt.mesh.position) : offsetPos(tgt.mesh.position), dt);
        break;

      case 'shoot':
        if(!tgt){ if(type==='ally'){ const bz=findBestZone(); if(bz){ botState='capture'; defendPos=bz.pos; break; } } botState='chase'; break; }
        if (dist < BOT_MELEE_R){ botState='bayonet'; break; }
        if (botAmmo <= 0){ botState='bayonet'; break; }
        if(dist>R.shootR*1.3){ botState='chase'; break; }
        { const f=new THREE.Vector3().subVectors(tgt.mesh.position,mesh.position); f.y=0; f.normalize(); mesh.rotation.y=Math.atan2(f.x,f.z); }
        fire(tgt, dt);
        if (role==='suppressor') {
          strafeT-=dt;
          if(strafeT<=0){
            strafeT=1.5+Math.random()*1.5;
            const a2=Math.random()*Math.PI*2; strafeDX=Math.cos(a2); strafeDZ=Math.sin(a2);
          }
          mesh.position.x+=strafeDX*R.speed*0.45*dt;
          mesh.position.z+=strafeDZ*R.speed*0.45*dt;
        }
        break;

      case 'bayonet': {
        if (!tgt) {
          if(type==='ally'){ const bz=findBestZone(); if(bz){ botState='capture'; defendPos=bz.pos; break; } }
          botState=type==='enemy'?'patrol':'follow'; break;
        }
        step(tgt.mesh.position, dt, R.speed * 1.35);
        meleeAttack(tgt);
        if (botAmmo > 0 && dist > BOT_MELEE_R * 3) botState = 'chase';
        break;
      }

      case 'follow':
        if(tgt&&dist<BOT_MELEE_R){ botState='bayonet'; break; }
        if(tgt&&dist<R.chaseR*1.8){ botState= botAmmo>0 ? 'chase' : 'bayonet'; break; }
        if(tgt&&dist<R.shootR){ botState= botAmmo>0 ? 'shoot' : 'bayonet'; break; }
        if(tgt) step(role==='flanker' ? flankPos(tgt.mesh.position) : offsetPos(tgt.mesh.position), dt);
        else {
          const anchor = role==='defender' ? state.player.mesh.position : offsetPos(state.player.mesh.position);
          if(mesh.position.distanceTo(anchor)>10) step(anchor, dt);
        }
        break;
    }

    mesh.position.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, mesh.position.x));
    mesh.position.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, mesh.position.z));

    if (hpEl) {
      const hp3=mesh.position.clone(); hp3.y+=2.4;
      const s=hp3.project(state.camera);
      const tooFar=hp3.distanceTo(state.camera.position)>35;
      if(s.z>=1||tooFar){ hpEl.style.display='none'; }
      else {
        hpEl.style.display='block';
        hpEl.style.left=((s.x*.5+.5)*window.innerWidth)+'px';
        hpEl.style.top =((-s.y*.5+.5)*window.innerHeight)+'px';
        hpEl.firstElementChild.style.background=hp>50?'#cc2200':hp>25?'#ff8800':'#ff2200';
      }
    }
  }
  const bot={mesh,type,role,update,hit,hpEl,get alive(){return alive;}};
  state.bots.push(bot); return bot;
}

// ── Spawn configs ──────────────────────────────────────────────────
export const ENEMY_SPAWNS = [
  { x:-50, z:70, role:'charger',    patrol:[[-53,67],[-47,67],[-47,73],[-53,73]] },
  { x:-25, z:72, role:'charger',    patrol:[[-28,69],[-22,69],[-22,75],[-28,75]] },
  { x:  0, z:71, role:'charger',    patrol:[[-3,68],[3,68],[3,74],[-3,74]] },
  { x: 25, z:72, role:'charger',    patrol:[[22,69],[28,69],[28,75],[22,75]] },
  { x: 50, z:70, role:'charger',    patrol:[[47,67],[53,67],[53,73],[47,73]] },
  { x:-40, z:74, role:'suppressor', patrol:[[-43,71],[-37,71],[-37,77],[-43,77]] },
  { x:-13, z:75, role:'suppressor', patrol:[[-16,72],[-10,72],[-10,78],[-16,78]] },
  { x: 13, z:75, role:'suppressor', patrol:[[10,72],[16,72],[16,78],[10,78]] },
  { x: 40, z:74, role:'suppressor', patrol:[[37,71],[43,71],[43,77],[37,77]] },
  { x:  0, z:76, role:'suppressor', patrol:[[-3,73],[3,73],[3,79],[-3,79]] },
  { x:-60, z:68, role:'flanker',    patrol:[[-63,65],[-57,65],[-57,71],[-63,71]] },
  { x:-30, z:69, role:'flanker',    patrol:[[-33,66],[-27,66],[-27,72],[-33,72]] },
  { x:  0, z:68, role:'flanker',    patrol:[[-3,65],[3,65],[3,71],[-3,71]] },
  { x: 30, z:69, role:'flanker',    patrol:[[27,66],[33,66],[33,72],[27,72]] },
  { x: 60, z:68, role:'flanker',    patrol:[[57,65],[63,65],[63,71],[57,71]] },
];

export const ALLY_SPAWNS = [
  { x:-50, z:-70, role:'charger'    },
  { x:-25, z:-72, role:'charger'    },
  { x:  0, z:-71, role:'charger'    },
  { x: 25, z:-72, role:'charger'    },
  { x: 50, z:-70, role:'charger'    },
  { x:-40, z:-74, role:'suppressor' },
  { x:-13, z:-75, role:'suppressor' },
  { x: 13, z:-75, role:'suppressor' },
  { x: 40, z:-74, role:'suppressor' },
  { x:-60, z:-68, role:'flanker'    },
  { x:-30, z:-69, role:'defender'   },
  { x:  0, z:-68, role:'defender'   },
  { x: 30, z:-69, role:'defender'   },
  { x: 60, z:-68, role:'flanker'    },
];

export function initBots() {
  ALLY_SPAWNS.forEach(s => addBot('ally', s.x, s.z, [], s.role));
  ENEMY_SPAWNS.forEach(s => addBot('enemy', s.x, s.z, s.patrol, s.role));
}

// ─── Respawn systems ─────────────────────────────────────────────────
let respawnTimer = -1;
const RESPAWN_DELAY = 15;
const elRespawn = document.getElementById('respawn-hud');

export function tickRespawn(dt) {
  const living = state.bots.filter(b => b.type==='enemy' && b.alive).length;

  if (living > 0) {
    if (respawnTimer >= 0) { respawnTimer=-1; elRespawn.style.display='none'; }
    return;
  }

  if (respawnTimer < 0) {
    respawnTimer = RESPAWN_DELAY;
    elRespawn.style.display = 'block';
    startBombardment('ally');
  }

  respawnTimer -= dt;
  elRespawn.textContent = 'Enemy reinforcements inbound in: ' + Math.ceil(respawnTimer) + 's';

  if (respawnTimer <= 0) {
    respawnTimer = -1;
    elRespawn.style.display = 'none';
    for (let i=state.bots.length-1; i>=0; i--) {
      if (state.bots[i].type==='enemy') {
        if (state.bots[i].hpEl) state.bots[i].hpEl.remove();
        state.bots.splice(i,1);
      }
    }
    ENEMY_SPAWNS.forEach(s => addBot('enemy', s.x, s.z, s.patrol, s.role));
    showMsg('Enemy reinforcements inbound!', 2500);
  }
}

let allyRespawnTimer = -1;
const elAllyRespawn = document.getElementById('ally-respawn-hud');

export function tickAllyRespawn(dt) {
  const living = state.bots.filter(b => b.type==='ally' && b.alive).length;

  if (living > 0) {
    if (allyRespawnTimer >= 0) { allyRespawnTimer=-1; elAllyRespawn.style.display='none'; }
    return;
  }

  if (allyRespawnTimer < 0) {
    allyRespawnTimer = RESPAWN_DELAY;
    elAllyRespawn.style.display = 'block';
    startBombardment('enemy');
  }

  allyRespawnTimer -= dt;
  elAllyRespawn.textContent = 'Ally reinforcements inbound in: ' + Math.ceil(allyRespawnTimer) + 's';

  if (allyRespawnTimer <= 0) {
    allyRespawnTimer = -1;
    elAllyRespawn.style.display = 'none';
    for (let i=state.bots.length-1; i>=0; i--) {
      if (state.bots[i].type==='ally') state.bots.splice(i,1);
    }
    ALLY_SPAWNS.forEach(s => addBot('ally', s.x, s.z, [], s.role));
    showMsg('Ally reinforcements inbound!', 2500);
  }
}
