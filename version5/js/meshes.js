// THREE is a global from the script tag — no import needed

export function makeLeeEnfield() {
  const g = new THREE.Group();
  const wood  = new THREE.MeshLambertMaterial({color:0x5c3317});
  const metal = new THREE.MeshLambertMaterial({color:0x252525});
  // Stock (butt, +Z = toward character's back)
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065,0.065,0.35), wood);
  stock.position.z = 0.19; g.add(stock);
  // Receiver/body (wood fore-stock)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,0.12), wood);
  g.add(body);
  // Barrel — shorter and thicker than GEW98 (-Z = forward)
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.38), metal);
  barrel.position.z = -0.22; g.add(barrel);
  // Box magazine (distinctive SMLE feature)
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.08,0.065), metal);
  mag.position.set(0,-0.07,-0.02); g.add(mag);
  return g;
}

export function makeGewehr98() {
  const g = new THREE.Group();
  const wood  = new THREE.MeshLambertMaterial({color:0x4a2808});
  const metal = new THREE.MeshLambertMaterial({color:0x1a1a1a});
  // Stock — longer, elegant
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,0.44), wood);
  stock.position.z = 0.23; g.add(stock);
  // Receiver
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.065,0.07,0.14), wood);
  g.add(body);
  // Barrel — long and thin (precision sniper)
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.028,0.028,0.54), metal);
  barrel.position.z = -0.31; g.add(barrel);
  // Bolt handle sticking out to the right
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.09,6), metal);
  bolt.rotation.z = Math.PI/2;
  bolt.position.set(0.07,0.02,0.03); g.add(bolt);
  return g;
}

export function makeCapsule(color, weaponType='smle') {
  const mat=new THREE.MeshLambertMaterial({color}), g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,1.1,12),mat);
  body.position.y=.55; body.castShadow=true; g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.26,10,10),mat);
  head.position.y=1.42; head.castShadow=true; g.add(head);
  // Attach rifle at right-hand / chest position, barrel pointing forward (-Z)
  const rifle = weaponType==='gew98' ? makeGewehr98() : makeLeeEnfield();
  rifle.position.set(0.30, 0.82, -0.08);
  g.add(rifle);
  return g;
}
