import { state } from './state.js';

// ─── Solid-box collision system ─────────────────────────────────────
export const SOLID_BOXES = [];
export const WIRE_ZONES  = [];

export const TRENCH_ZONES = [
  { x: -8, z:-18, len:24, hw:1.3, depth:-1.2 },
  { x: 14, z:-16, len:18, hw:1.3, depth:-1.2 },
  { x: -6, z: 18, len:22, hw:1.3, depth:-1.2 },
  { x: 16, z: 17, len:16, hw:1.3, depth:-1.2 },
];

export const CRATER_ZONES = [
  { x:  0, z:  2, r:4.2, depth:-0.85 }, { x: -9, z:  6, r:3.3, depth:-0.70 },
  { x: 11, z: -4, r:2.8, depth:-0.60 }, { x: -4, z: -7, r:3.8, depth:-0.70 },
  { x: 16, z:  9, r:2.6, depth:-0.50 }, { x:-13, z:  4, r:3.5, depth:-0.65 },
  { x:  7, z: 13, r:3.0, depth:-0.60 }, { x: -2, z:-14, r:2.4, depth:-0.50 },
  { x: 22, z: -5, r:2.8, depth:-0.50 }, { x:-18, z: 12, r:3.2, depth:-0.60 },
];

export const MAP_LIMIT = 79;

// Register a box that lives inside a group at local offset (lx,lz)
// with half-extents (hw, hd), where the group is at world (gx,gz) rotated ry.
// Stores both AABB (for player collision) and OBB data (for accurate bullet collision).
export function regBox(gx, gz, ry, lx, lz, hw, hd, topY=99) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const wcx = gx + lx*cos - lz*sin;
  const wcz = gz + lx*sin + lz*cos;
  const abx = Math.abs(hw*cos) + Math.abs(hd*sin);
  const abz = Math.abs(hw*sin) + Math.abs(hd*cos);
  SOLID_BOXES.push({ minX:wcx-abx, maxX:wcx+abx, minZ:wcz-abz, maxZ:wcz+abz, topY,
                     cx:wcx, cz:wcz, hw, hd, cos, sin });
}

export function regWire(gx, gz, ry, len) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const hw = len/2 + 0.2, hd = 0.55;
  const abx = Math.abs(hw*cos) + Math.abs(hd*sin);
  const abz = Math.abs(hw*sin) + Math.abs(hd*cos);
  WIRE_ZONES.push({ minX:gx-abx, maxX:gx+abx, minZ:gz-abz, maxZ:gz+abz });
}

// Player can auto-step over anything shorter than STEP_H above their current Y.
const STEP_H = 0.7;
export function resolvePlayerCollision(pos) {
  const R = 0.44;
  for (let iter = 0; iter < 3; iter++) {
    for (const b of SOLID_BOXES) {
      if (pos.y + STEP_H >= b.topY) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 < R*R) {
        const d = Math.sqrt(d2) || 0.001;
        pos.x = cx + (dx/d)*R;
        pos.z = cz + (dz/d)*R;
      }
    }
  }
}

export function inWire(pos) {
  for (const w of WIRE_ZONES)
    if (pos.x>w.minX && pos.x<w.maxX && pos.z>w.minZ && pos.z<w.maxZ) return true;
  return false;
}

export function terrainBaseHeight(x, z) {
  let h  = Math.sin(x*0.028 + 0.70) * Math.cos(z*0.024 + 1.10) * 0.30;
  h     += Math.sin(x*0.052 - 1.30) * Math.sin(z*0.046 - 0.60) * 0.18;
  h     += Math.cos(x*0.090 + 2.10) * Math.cos(z*0.080 - 1.80) * 0.12;
  const nmf = Math.exp(-(z * z) / 90);
  h += (Math.sin(x*0.20+1.50)*Math.cos(z*0.18-0.70)*0.50 +
        Math.cos(x*0.29-2.20)*Math.sin(z*0.25+1.00)*0.35 +
        Math.sin(x*0.38+0.80)*Math.cos(z*0.33-1.40)*0.22) * nmf;
  const sr = Math.sqrt(x*x + (z+76)*(z+76));
  if (sr < 22) h *= Math.max(0, (sr - 5) / 17);
  return h;
}

export function getGroundLevel(x, z) {
  for (const t of TRENCH_ZONES) {
    if (Math.abs(x - t.x) < t.len/2 && Math.abs(z - t.z) < t.hw) return t.depth;
  }
  for (const c of CRATER_ZONES) {
    const dx = x - c.x, dz = z - c.z;
    if (dx*dx + dz*dz < c.r*c.r) return c.depth;
  }
  return terrainBaseHeight(x, z);
}

// ═══════════════════════════════════════════════
//  WW1 PROPS
// ═══════════════════════════════════════════════

function addCrater(x, z, r=4) {
  const bh = terrainBaseHeight(x, z);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r*0.72, 20),
    new THREE.MeshLambertMaterial({ color:0x2a1a08 }));
  inner.rotation.x = -Math.PI/2; inner.position.set(x, bh-0.50, z); state.scene.add(inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.45, 5, 22),
    new THREE.MeshLambertMaterial({ color:0x3d2a12 }));
  rim.rotation.x = -Math.PI/2; rim.position.set(x, bh+0.16, z); state.scene.add(rim);
}

function addDeadTree(x, z, h=6) {
  const mat = new THREE.MeshLambertMaterial({ color:0x2d1f0e });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, h, 6), mat);
  trunk.position.set(x, h/2, z); trunk.castShadow = true; state.scene.add(trunk);
  [[0.9, h*0.75, 0, 1.6, 0.65], [-0.7, h*0.55, 0.5, 1.3, -0.55], [0.4, h*0.4, -0.6, 1.0, 0.4]].forEach(([bx,by,bz,bl,rz]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, bl, 5), mat);
    b.position.set(x+bx, by, z+bz); b.rotation.z = rz; b.castShadow = true; state.scene.add(b);
  });
  regBox(x, z, 0, 0, 0, 0.28, 0.28, h);
}

function addBrokenTree(x, z, h=2.0) {
  const mat = new THREE.MeshLambertMaterial({ color:0x2a1c0c });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.28, h, 6), mat);
  trunk.position.set(x, h/2, z); trunk.castShadow = true; state.scene.add(trunk);
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.11, 0.5, 5), mat);
  stub.position.set(x+0.22, h-0.05, z+0.1); stub.rotation.z = 0.85; stub.castShadow = true; state.scene.add(stub);
  regBox(x, z, 0, 0, 0, 0.35, 0.35, h);
}

function addBarbedWire(x, z, len=8, ry=0) {
  const mat = new THREE.MeshBasicMaterial({ color:0x4a4a33 });
  const g = new THREE.Group();
  const np = Math.max(2, Math.floor(len/3)+1);
  for (let i=0; i<np; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4), mat);
    post.position.set(i*(len/(np-1)) - len/2, 0.65, 0); g.add(post);
  }
  [-0.1, 0.1].forEach(dz => {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.02), mat);
    wire.position.set(0, 0.9, dz); g.add(wire);
  });
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
  regWire(x, z, ry, len);
}

function addSandbags(x, z, len=4, ry=0) {
  const mat = new THREE.MeshLambertMaterial({ color:0x8b7355 });
  const g = new THREE.Group();
  for (let i=0; i<len; i++) {
    const px = i - len/2 + 0.5;
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 0.52), mat);
    b1.position.set(px, 0.22, 0); b1.castShadow = true; g.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 0.52), mat);
    b2.position.set(px + 0.1, 0.65, 0); b2.castShadow = true; g.add(b2);
  }
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
  regBox(x, z, ry, 0, 0, len*0.525+0.1, 0.38, 0.87);
}

function addRuinedWall(x, z, w=5, h=3, ry=0) {
  const mat = new THREE.MeshLambertMaterial({ color:0x7a6a5a });
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), mat);
  wall.position.y = h/2; wall.castShadow = wall.receiveShadow = true; g.add(wall);
  const rubble = new THREE.Mesh(new THREE.BoxGeometry(w+1.2, 0.35, 1.4), mat);
  rubble.position.y = 0.18; rubble.receiveShadow = true; g.add(rubble);
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
}

function addArtillery(x, z, ry=0) {
  const mat = new THREE.MeshLambertMaterial({ color:0x3d3d2a });
  const wm  = new THREE.MeshLambertMaterial({ color:0x2a1a0a });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.55, 1.0), mat);
  body.position.y = 0.85; body.castShadow = true; g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 2.8, 8), mat);
  barrel.rotation.z = Math.PI/2 - 0.28; barrel.position.set(1.1, 1.25, 0); g.add(barrel);
  [-0.65, 0.65].forEach(wz => {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.18, 14), wm);
    wh.rotation.x = Math.PI/2; wh.position.set(-0.9, 0.48, wz); g.add(wh);
  });
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
  regBox(x, z, ry, 0.5, 0, 2.0, 0.85, 1.4);
}

function addCrate(x, z) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75),
    new THREE.MeshLambertMaterial({ color:0x6b4c2a }));
  c.position.set(x, 0.38, z); c.castShadow = c.receiveShadow = true; state.scene.add(c);
}

function addTrench(x, z, len, ry=0) {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8),
    new THREE.MeshLambertMaterial({ color:0x1e1208 }));
  floor.rotation.x = -Math.PI/2; floor.position.y = 0.02; g.add(floor);
  const dm = new THREE.MeshLambertMaterial({ color:0x3d2a12 });
  [-1.3, 1.3].forEach(dz => {
    const dw = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 0.22), dm);
    dw.position.set(0, -0.55, dz); dw.receiveShadow = true; g.add(dw);
  });
  const bm = new THREE.MeshLambertMaterial({ color:0x7a6444 });
  const nb = Math.floor(len / 1.15);
  for (let i=0; i<nb; i++) {
    const bx = i*1.15 - len/2 + 0.58;
    [-1.55, 1.55].forEach(bz => {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.48), bm);
      bag.position.set(bx, 0.33, bz); bag.castShadow = true; g.add(bag);
    });
  }
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
}

function addHouse(x, z, ry=0) {
  const wm = new THREE.MeshLambertMaterial({ color:0x9a8070 });
  const rm = new THREE.MeshLambertMaterial({ color:0x7a4030 });
  const g = new THREE.Group();
  const W=5, D=4, H=3.5, T=0.3, DW=1.3, DH=2.2, RH=1.2;
  [[-W/2, D], [W/2, D]].forEach(([wx, depth]) => {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(T, H, depth+T*2), wm);
    sw.position.set(wx, H/2, 0); sw.castShadow = sw.receiveShadow = true; g.add(sw);
  });
  const bk = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), wm);
  bk.position.set(0, H/2, D/2); bk.castShadow = bk.receiveShadow = true; g.add(bk);
  const fw = (W-DW)/2;
  const fl = new THREE.Mesh(new THREE.BoxGeometry(fw, H, T), wm);
  fl.position.set(-DW/2-fw/2, H/2, -D/2); fl.castShadow = true; g.add(fl);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(fw, H, T), wm);
  fr.position.set(DW/2+fw/2, H/2, -D/2); fr.castShadow = true; g.add(fr);
  const fa = new THREE.Mesh(new THREE.BoxGeometry(DW, H-DH, T), wm);
  fa.position.set(0, DH+(H-DH)/2, -D/2); fa.castShadow = true; g.add(fa);
  const rSlope = Math.atan2(RH, W/2);
  const rLen   = Math.sqrt((W/2)**2 + RH**2);
  [-1, 1].forEach(side => {
    const rp = new THREE.Mesh(new THREE.BoxGeometry(rLen, 0.18, D+0.9), rm);
    rp.rotation.z = side * -rSlope;
    rp.position.set(side * W/4, H+RH/2, 0);
    rp.castShadow = true; g.add(rp);
  });
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
  regBox(x, z, ry, -W/2,           0,      0.25,      D/2+T+0.05, H);
  regBox(x, z, ry,  W/2,           0,      0.25,      D/2+T+0.05, H);
  regBox(x, z, ry,  0,             D/2,    W/2+0.05,  0.25,       H);
  regBox(x, z, ry, -DW/2-fw/2,    -D/2,   fw/2,      0.25,       H);
  regBox(x, z, ry,  DW/2+fw/2,    -D/2,   fw/2,      0.25,       H);
}

function addRuinedHouse(x, z, ry=0) {
  const wm = new THREE.MeshLambertMaterial({ color:0x8a7060 });
  const rm = new THREE.MeshLambertMaterial({ color:0x6a5a4a });
  const g = new THREE.Group();
  const W=5, D=4, T=0.3, H=2.1;
  const bk = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), wm);
  bk.position.set(0, H/2, D/2); bk.castShadow = bk.receiveShadow = true; g.add(bk);
  const lh = H * 0.75;
  const lw = new THREE.Mesh(new THREE.BoxGeometry(T, lh, D*0.85), wm);
  lw.position.set(-W/2, lh/2, D*0.075); lw.castShadow = true; g.add(lw);
  const rh = H * 0.45;
  const rw = new THREE.Mesh(new THREE.BoxGeometry(T, rh, D*0.5), wm);
  rw.position.set(W/2, rh/2, D*0.25); rw.castShadow = true; g.add(rw);
  const fc = new THREE.Mesh(new THREE.BoxGeometry(1.3, H*0.9, T), wm);
  fc.position.set(-W/2+0.65, H*0.9/2, -D/2); g.add(fc);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(W+1.2, 0.38, D+1.2), rm);
  rb.position.y = 0.19; rb.receiveShadow = true; g.add(rb);
  [[1.5,0.5,-1],[-1.2,0.55,1.5],[2.2,0.48,0.8],[-2.0,0.50,-0.6],[0.4,0.52,1.8]].forEach(([rx,ry2,rz])=>{
    const rc = new THREE.Mesh(new THREE.BoxGeometry(0.5+Math.random()*0.7, 0.3, 0.4+Math.random()*0.5), rm);
    rc.position.set(rx, ry2, rz); rc.rotation.y = Math.random()*Math.PI; g.add(rc);
  });
  g.position.set(x, 0, z); g.rotation.y = ry; state.scene.add(g);
  regBox(x, z, ry,  0,     D/2,    W/2+0.05, 0.25,  H);
  regBox(x, z, ry, -W/2,   D*0.075, 0.25,   D*0.425, H*0.75);
  regBox(x, z, ry,  W/2,   D*0.25,  0.25,   D*0.25,  H*0.45);
  regBox(x, z, ry, -W/2+0.65, -D/2, 0.65,   0.25,    H*0.9);
}

function addSupplyDepot(x, z, ry=0) {
  const bm=new THREE.MeshLambertMaterial({color:0x7a6444});
  const cm=new THREE.MeshLambertMaterial({color:0x6b4c2a});
  const g=new THREE.Group();
  for (let i=0;i<6;i++){
    const a=i/6*Math.PI*2;
    [0.28,0.76].forEach(py=>{
      const b=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.46,0.48),bm);
      b.position.set(Math.cos(a)*2.1,py,Math.sin(a)*2.1);
      b.rotation.y=a; b.castShadow=true; g.add(b);
    });
  }
  [[0.5,0.38,0],[-0.5,0.38,0.4],[0,0.38,-0.5]].forEach(([cx,cy,cz])=>{
    const c=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.75,0.75),cm);
    c.position.set(cx,cy,cz); c.castShadow=true; g.add(c);
  });
  g.position.set(x,0,z); g.rotation.y=ry; state.scene.add(g);
}

function addObsPost(x, z, ry=0) {
  const mat=new THREE.MeshLambertMaterial({color:0x5a3a1a});
  const g=new THREE.Group();
  [[-0.85,-0.85],[0.85,-0.85],[-0.85,0.85],[0.85,0.85]].forEach(([px,pz])=>{
    const s=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,5.5,5),mat);
    s.position.set(px,2.75,pz); s.castShadow=true; g.add(s);
  });
  const fl=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.16,2.5),mat);
  fl.position.y=5.3; fl.castShadow=true; g.add(fl);
  [[0,5.65,1.25],[0,5.65,-1.25]].forEach(([rx,ry2,rz])=>{
    const r=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.45,0.09),mat);
    r.position.set(rx,ry2,rz); g.add(r);
  });
  [[1.25,5.65,0],[-1.25,5.65,0]].forEach(([rx,ry2,rz])=>{
    const r=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.45,2.5),mat);
    r.position.set(rx,ry2,rz); g.add(r);
  });
  const lad=new THREE.Mesh(new THREE.BoxGeometry(0.38,5.5,0.09),mat);
  lad.position.set(1.0,2.75,-0.9); g.add(lad);
  g.position.set(x,0,z); g.rotation.y=ry; state.scene.add(g);
  regBox(x, z, ry, 0, 0, 1.1, 1.1, 5.5);
}

function addCrashedPlane(x, z, ry=0) {
  const wood = new THREE.MeshLambertMaterial({ color:0x7a5c1e });
  const metal= new THREE.MeshLambertMaterial({ color:0x4a4a38 });
  const char = new THREE.MeshLambertMaterial({ color:0x18180a });
  const g = new THREE.Group();

  const fuse = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 4.8), wood);
  fuse.position.set(0, 0.9, 0); fuse.rotation.x = 0.22; fuse.castShadow=true; g.add(fuse);

  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.4,0.65,8), metal);
  cowl.rotation.x = Math.PI/2; cowl.position.set(0, 1.05, -2.3); g.add(cowl);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.05), metal);
  blade.position.set(0, 1.0, -2.65); blade.rotation.z = 0.5; g.add(blade);

  const uwL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.09, 1.1), wood);
  uwL.position.set(-2.0, 1.55, 0.1); uwL.rotation.z = -0.06; uwL.castShadow=true; g.add(uwL);
  const uwR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 1.1), wood);
  uwR.position.set(1.2, 1.1, 0.1); uwR.rotation.z = 0.55; uwR.castShadow=true; g.add(uwR);

  const lwL = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 0.9), wood);
  lwL.position.set(-1.8, 0.12, 0.4); lwL.receiveShadow=true; g.add(lwL);
  const lwR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), wood);
  lwR.position.set(0.8, 0.5, 0.4); lwR.rotation.z = 0.4; g.add(lwR);

  [[-0.8],[ 0.8]].forEach(([sx])=>{
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.5,4), wood);
    st.position.set(sx, 0.85, 0.15); st.rotation.z = 0.08; g.add(st);
  });

  const tailH = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.07, 0.7), wood);
  tailH.position.set(0, 1.3, 2.2); tailH.rotation.x = -0.12; g.add(tailH);
  const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.85), wood);
  tailV.position.set(0, 1.72, 2.25); g.add(tailV);

  const cock = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.55),
    new THREE.MeshLambertMaterial({ color:0x1a2a1a }));
  cock.position.set(0, 1.28, 0.5); g.add(cock);

  const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.8, 18), char);
  scorch.rotation.x = -Math.PI/2; scorch.position.y = 0.015; g.add(scorch);

  [[-1.8,0.06,1.6],[-2.5,0.06,0.8],[1.2,0.06,2.2],[2.0,0.06,-1.4],[-0.6,0.06,-2.8]].forEach(([dx,dy,dz])=>{
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.25+Math.random()*0.35,0.06,0.15+Math.random()*0.25), wood);
    d.position.set(dx,dy,dz); d.rotation.y = Math.random()*Math.PI; g.add(d);
  });

  g.rotation.set(0, ry, 0.18);
  g.position.set(x, 0, z);
  state.scene.add(g);
  regBox(x, z, ry, -1.0, 0, 3.0, 2.8, 2.0);
}

function addBlownTank(x, z, ry=0) {
  const hull  = new THREE.MeshLambertMaterial({ color:0x3a3a26 });
  const track = new THREE.MeshLambertMaterial({ color:0x252518 });
  const char  = new THREE.MeshLambertMaterial({ color:0x18180a });
  const rust  = new THREE.MeshLambertMaterial({ color:0x4a3020 });
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.95, 4.6), hull);
  body.position.y = 0.75; body.castShadow = body.receiveShadow = true; g.add(body);

  [-1.55, 1.55].forEach(tx => {
    const tk = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 4.9), track);
    tk.position.set(tx, 0.34, 0); tk.castShadow=true; g.add(tk);
    [-1.6,-0.6,0.4,1.4].forEach(tz => {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.14,10), track);
      wh.rotation.x = Math.PI/2; wh.position.set(tx, 0.3, tz); g.add(wh);
    });
  });
  const tkPiece = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 1.4), track);
  tkPiece.position.set(-2.2, 0.09, -1.5); tkPiece.rotation.y = 0.45; g.add(tkPiece);

  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.65, 1.75), hull);
  turret.position.set(0.6, 1.62, 0.5);
  turret.rotation.set(0.22, 0.5, 0.18);
  turret.castShadow=true; g.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,1.9,6), hull);
  barrel.position.set(0.9, 2.0, -0.6);
  barrel.rotation.set(0.8, 0.3, -0.6);
  g.add(barrel);

  const interior = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 3.0), char);
  interior.position.y = 1.3; g.add(interior);

  const scorch = new THREE.Mesh(new THREE.CircleGeometry(3.8, 20), char);
  scorch.rotation.x = -Math.PI/2; scorch.position.y = 0.015; g.add(scorch);

  [[-2.2,0.1,2.5],[-1.4,0.12,-2.8],[2.6,0.1,1.8],[3.0,0.1,-0.8],[1.5,0.12,3.0],[-3.0,0.1,0.5]].forEach(([dx,dy,dz])=>{
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.2+Math.random()*0.5,0.14,0.15+Math.random()*0.4), rust);
    d.position.set(dx,dy,dz); d.rotation.y = Math.random()*Math.PI; g.add(d);
  });

  g.rotation.set(0.08, ry, -0.06);
  g.position.set(x, 0, z);
  state.scene.add(g);
  regBox(x, z, ry, 0, 0, 2.0, 2.6, 1.7);
}

export function buildWorld() {
  // Ground mesh
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160, 100, 100),
    new THREE.MeshLambertMaterial({ color:0x5c4a2a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  state.scene.add(ground);

  // ── Allied trenches (south side) ──
  addTrench(-8, -18, 24);
  addTrench(14, -16, 18);

  // ── German trenches (north side) ──
  addTrench(-6,  18, 22);
  addTrench(16,  17, 16);

  // ── Craters across No Man's Land ──
  addCrater(  0,   2, 5.0); addCrater( -9,   6, 4.0); addCrater( 11,  -4, 3.5);
  addCrater( -4,  -7, 4.5); addCrater( 16,   9, 3.2); addCrater(-13,   4, 4.2);
  addCrater(  7,  13, 3.8); addCrater( -2, -14, 3.0); addCrater( 22,  -5, 3.5);
  addCrater(-18,  12, 3.8); addCrater(  3,  -20, 2.8);

  // ── Broken stumps — No Man's Land (shell-blasted) ──
  addBrokenTree( -5,   3, 2.2); addBrokenTree(  9,  -4, 1.8);
  addBrokenTree(-16,   7, 2.5); addBrokenTree( 19,   4, 2.0);
  addBrokenTree(  2, -10, 2.3);

  // ── Barbed wire lines ──
  addBarbedWire(-14, -12, 12); addBarbedWire(  2, -12, 10);
  addBarbedWire( 15, -11,  9); addBarbedWire(-10,  13, 14);
  addBarbedWire(  8,  13, 10);

  // ── Sandbag positions ──
  addSandbags( -8, -15, 5);       addSandbags(  5, -14, 4, 0.3);
  addSandbags( -6,  16, 6);       addSandbags( 14,  16, 5, -0.2);
  addSandbags(-18, -19, 4, 0.1);  addSandbags( 20,  20, 4,  0.2);

  // ── Village ──
  addObsPost(36, -38,  0.3);

  addHouse(      18, -35,  0.08);
  addHouse(      29, -45, -0.15);
  addHouse(      16, -53,  0.22);

  addRuinedHouse(24, -32, -0.10);
  addRuinedHouse(33, -43,  0.18);
  addRuinedHouse(20, -49, -0.22);
  addRuinedHouse(28, -57,  0.08);

  addRuinedHouse(-20, -22, Math.PI * 0.7);
  addRuinedHouse( 10,  25, Math.PI * 0.3);

  // ── Craters — mid-map ──
  addCrater(-25,  -8, 3.5); addCrater( 28, -12, 3.8);
  addCrater(-30,   2, 4.0); addCrater( 25,   3, 3.5);
  addCrater( -8, -22, 3.0); addCrater( 15, -28, 3.5);
  // ── Craters — outer sectors ──
  addCrater(-32,  -5, 4.0); addCrater(-40,   8, 3.5); addCrater(-28,  15, 4.5);
  addCrater( 35,   5, 4.0); addCrater( 42,  -6, 3.5); addCrater( 30,  18, 4.0);
  addCrater( -5, -30, 3.5); addCrater( 10, -38, 4.0); addCrater(-20, -35, 3.2);
  addCrater(  5,  35, 3.0); addCrater( -8,  42, 3.5); addCrater( 20,  38, 3.2);

  // ── Dead trees — outer spread ──
  addDeadTree(-28, -15, 7.0); addDeadTree( 26, -20, 5.5);
  addDeadTree(-35,   0, 7.0); addDeadTree(-45,  12, 5.5); addDeadTree(-38,  -8, 6.0);
  addDeadTree( 38,  -2, 6.5); addDeadTree( 44,  10, 5.0); addDeadTree( 32,  20, 6.0);
  addDeadTree(  5, -32, 5.0); addDeadTree(-15, -42, 6.0);
  addDeadTree( -5,  38, 5.5); addDeadTree( 15,  44, 6.0);
  addDeadTree(-22,  28, 6.5); addDeadTree( 30,  25, 5.5);

  // ── Barbed wire — outer sectors ──
  addBarbedWire(-35,   5, 12); addBarbedWire(-42,  -3, 10);
  addBarbedWire( 38,   8, 12); addBarbedWire( 32,  -8, 10);

  // ── Sandbags — outer ──
  addSandbags(  0, -30, 5);       addSandbags(-12, -28, 4, 0.4);
  addSandbags(  8,  35, 5, -0.2); addSandbags(-10,  40, 4,  0.3);

  // ── Artillery batteries ──
  addArtillery(-20, -21,  0.5);
  addArtillery( 17,  23,  Math.PI + 0.3);
  addArtillery( -8, -35,  0.2);
  addArtillery(  5,  42,  Math.PI + 0.1);

  // ── Ammo crates ──
  addCrate( -7, -16); addCrate(-6.2, -15.6);
  addCrate( 11,  21); addCrate(11.8,  20.5);
  addCrate( 20, -12); addCrate(21.0, -12.4);
  addCrate( -2, -31); addCrate(-1.5, -31.5);
  addCrate(  7,  36); addCrate( 7.8,  36.3);

  // ── No Man's Land — west wing ──
  addCrater(-28, -3,4.5); addCrater(-33, 8,4.0); addCrater(-38,-8,3.8);
  addCrater(-25, 14,3.5); addCrater(-42, 1,4.2);
  addBrokenTree(-30, 5,2.1); addBrokenTree(-35,-10,1.9);
  addBarbedWire(-28,-8,10); addBarbedWire(-34,10,12);

  // ── No Man's Land — east wing ──
  addCrater(28, 3,4.5); addCrater(33,-8,4.0); addCrater(38, 8,3.8);
  addCrater(25,-14,3.5); addCrater(42,-1,4.2);
  addBrokenTree(30,-5,2.0); addBrokenTree(35,10,2.3);
  addBarbedWire(28, 8,10); addBarbedWire(34,-10,12);

  // ── Crashed plane — far north ──
  addCrashedPlane(5, 68, 1.2);

  // ── Blown tank — east side ──
  addBlownTank(52, -6, -0.4);

  // ── West sector ──
  addCrater(-50, 4,4.0); addCrater(-58,-8,3.8); addCrater(-65, 6,3.5);
  addCrater(-48,-22,4.2); addCrater(-60,16,3.6); addCrater(-72,-4,4.0);
  addDeadTree(-45, 0,8.0); addDeadTree(-52, 9,6.5); addDeadTree(-62,-2,7.0);
  addDeadTree(-48,-18,6.0); addDeadTree(-58,14,5.5); addDeadTree(-70, 5,7.5);
  addBarbedWire(-45,-14,14); addBarbedWire(-58, 0,12); addBarbedWire(-68,10,10);
  addBarbedWire(-44, 22,12);
  addRuinedHouse(-48,-30, Math.PI*0.3);
  addRuinedHouse(-52, 32, Math.PI*0.8);
  addSupplyDepot(-42,-36, 0.5);
  addSupplyDepot(-40, 30,-0.3);
  addSandbags(-48, -8, 5); addSandbags(-60, 4, 4, 0.4);
  addArtillery(-62,-20, 0.3); addArtillery(-55, 30, Math.PI+0.2);
  addCrate(-43,-37); addCrate(-42.4,-36.4);

  // ── East sector ──
  addCrater(50,-4,4.0); addCrater(58, 8,3.8); addCrater(65,-6,3.5);
  addCrater(48, 22,4.2); addCrater(60,-16,3.6); addCrater(72, 4,4.0);
  addDeadTree(45, 0,8.0); addDeadTree(52,-9,6.5); addDeadTree(62, 2,7.0);
  addDeadTree(48, 18,6.0); addDeadTree(58,-14,5.5); addDeadTree(70,-5,7.5);
  addBarbedWire(45, 14,14); addBarbedWire(58, 0,12); addBarbedWire(68,-10,10);
  addBarbedWire(44,-22,12);
  addRuinedHouse(48, 30, Math.PI*0.5);
  addRuinedHouse(54,-32, Math.PI*0.2);
  addSupplyDepot(42, 36,-0.4);
  addSupplyDepot(40,-30, 0.6);
  addSandbags(48, 8, 5,-0.3); addSandbags(60,-4, 4, 0.2);
  addArtillery(62, 20, Math.PI+0.3); addArtillery(55,-32, 0.1);
  addCrate(43,37); addCrate(43.6,37.5);

  // ── Allied command — far south ──
  addSupplyDepot(-10,-56, 0.3); addSupplyDepot(10,-56,-0.2);
  addArtillery(-16,-60, 0.3);   addArtillery(14,-62, 0.1);
  addBarbedWire( -6,-49,18);
  addCrater(  6,-50,3.5); addCrater(-20,-55,4.0); addCrater(24,-58,3.2);
  addCrater( -9,-65,3.5); addCrater( 18,-68,4.0);
  addDeadTree(-12,-50,6.0); addDeadTree(14,-54,5.5); addDeadTree(-22,-64,7.0);
  addDeadTree( 26,-60,6.5); addDeadTree(  0,-70,5.0);
  addSandbags( -6,-49,6); addSandbags(  6,-51,5, 0.2);
  addSandbags(-14,-58,4,-0.3); addSandbags( 16,-60,4, 0.4);
  addRuinedHouse(-18,-58, Math.PI*0.6); addRuinedHouse(22,-62, 0.2);
  addCrate(-11,-57); addCrate(-10.3,-56.5); addCrate(-12,-56.2);
  addCrate( 11,-57); addCrate( 11.6,-57.5);

  // ── German command — far north ──
  addSupplyDepot(-10, 56,-0.5); addSupplyDepot(10, 56, 0.4);
  addArtillery( 16, 60, Math.PI+0.3); addArtillery(-14, 62, Math.PI+0.1);
  addBarbedWire( -6, 49,18);
  addCrater( -6, 50,3.5); addCrater( 20, 55,4.0); addCrater(-24, 58,3.2);
  addCrater(  9, 65,3.5); addCrater(-18, 68,4.0);
  addDeadTree( 12, 50,6.0); addDeadTree(-14, 54,5.5); addDeadTree( 22, 64,7.0);
  addDeadTree(-26, 60,6.5); addDeadTree(  0, 70,5.0);
  addSandbags(  6, 49,6,-0.2); addSandbags( -6, 51,5, 0.3);
  addSandbags( 14, 58,4, 0.4); addSandbags(-16, 60,4,-0.3);
  addRuinedHouse( 18, 58, Math.PI*0.4); addRuinedHouse(-22, 62, Math.PI+0.2);
  addCrate( 11, 57); addCrate(10.4, 57.5); addCrate(12, 56.8);
  addCrate(-11, 57); addCrate(-11.6, 57.5);

  // ── Far corners ──
  addCrater(-65,-38,3.5); addCrater(-72,-26,4.0); addCrater(-62,-50,3.2);
  addDeadTree(-68,-32,7.5); addDeadTree(-58,-48,6.0); addDeadTree(-74,-18,6.5);
  addRuinedHouse(-62,-44, 0.5);

  addCrater( 65,-38,3.5); addCrater( 72,-26,4.0); addCrater( 62,-50,3.2);
  addDeadTree( 68,-32,7.5); addDeadTree( 58,-48,6.0); addDeadTree( 74,-18,6.5);
  addRuinedHouse( 62,-44,-0.3);

  addCrater(-65, 38,3.5); addCrater(-72, 26,4.0); addCrater(-62, 50,3.2);
  addDeadTree(-68, 32,7.5); addDeadTree(-58, 48,6.0); addDeadTree(-74, 18,6.5);
  addRuinedHouse(-62, 44,-0.5);

  addCrater( 65, 38,3.5); addCrater( 72, 26,4.0); addCrater( 62, 50,3.2);
  addDeadTree( 68, 32,7.5); addDeadTree( 58, 48,6.0); addDeadTree( 74, 18,6.5);
  addRuinedHouse( 62, 44, 0.4);

  // Displace ground mesh vertices so visual matches physics
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, getGroundLevel(pos.getX(i), -pos.getY(i)));
  }
  pos.needsUpdate = true;
  ground.geometry.computeVertexNormals();
}
