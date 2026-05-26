import { state } from './state.js';
import { showMsg } from './hud.js';

const RAIN_COUNT = 2200;
let rainGeo = null;
let rain = null;
let stars = null;

let gameTime = 8.0;
const REAL_SECS_PER_HOUR = 60;
let currentWeather = 'rain';
let weatherTimer   = 8 * REAL_SECS_PER_HOUR;

const SKY_FRAMES = [
  [  0, 0x03040a, 0x03040a, 0x080e1c, 0.09, 0.00 ],
  [  5, 0x06080f, 0x06080f, 0x080e1c, 0.09, 0.00 ],
  [  6, 0x5c1a06, 0x3e1004, 0x993310, 0.22, 0.18 ],
  [  7, 0xcc4a0e, 0x993a0a, 0xdd7730, 0.36, 0.38 ],
  [  8, 0x4a6a7a, 0x3a5560, 0x8899aa, 0.36, 0.42 ],
  [ 12, 0x3d4a4a, 0x3d4a4a, 0x8899aa, 0.38, 0.42 ],
  [ 17, 0x445050, 0x3a4545, 0x889999, 0.35, 0.40 ],
  [ 18, 0xaa3206, 0x882200, 0xcc4422, 0.27, 0.27 ],
  [ 19, 0x1c0502, 0x110301, 0x280d05, 0.14, 0.03 ],
  [ 21, 0x03040a, 0x03040a, 0x080e1c, 0.09, 0.00 ],
  [ 24, 0x03040a, 0x03040a, 0x080e1c, 0.09, 0.00 ],
];

function lerpHex(c1, c2, t) {
  const r1=(c1>>16)&0xff, g1=(c1>>8)&0xff, b1=c1&0xff;
  const r2=(c2>>16)&0xff, g2=(c2>>8)&0xff, b2=c2&0xff;
  return (Math.round(r1+(r2-r1)*t)<<16)|(Math.round(g1+(g2-g1)*t)<<8)|Math.round(b1+(b2-b1)*t);
}

function getSkyBase(h) {
  let a=SKY_FRAMES[0], b=SKY_FRAMES[SKY_FRAMES.length-1];
  for (let i=0; i<SKY_FRAMES.length-1; i++) {
    if (h>=SKY_FRAMES[i][0] && h<SKY_FRAMES[i+1][0]){ a=SKY_FRAMES[i]; b=SKY_FRAMES[i+1]; break; }
  }
  const t=(h-a[0])/(b[0]-a[0]);
  return {
    bg:lerpHex(a[1],b[1],t), fg:lerpHex(a[2],b[2],t), ac:lerpHex(a[3],b[3],t),
    ai:a[4]+(b[4]-a[4])*t, si:a[5]+(b[5]-a[5])*t
  };
}

function getNightBlend(h) {
  if (h < 5)  return 1.0;
  if (h < 7)  return 1.0-(h-5)/2;
  if (h < 18) return 0.0;
  if (h < 20) return (h-18)/2;
  return 1.0;
}

const elClock   = document.getElementById('clock-display');
const elWxLabel = document.getElementById('weather-display');

export function initWeather() {
  // Rain particles
  const _rainPos = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    _rainPos[i*3]   = (Math.random()-0.5)*100;
    _rainPos[i*3+1] = Math.random()*40;
    _rainPos[i*3+2] = (Math.random()-0.5)*100;
  }
  rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(_rainPos, 3));
  rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color:0x99bbcc, size:0.07, transparent:true, opacity:0.42, sizeAttenuation:true
  }));
  state.scene.add(rain);

  // Stars
  const _starBuf = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const phi = Math.random() * Math.PI * 2;
    const cosT = 0.08 + Math.random() * 0.92;
    const sinT = Math.sqrt(1 - cosT*cosT);
    _starBuf[i*3]   = 160 * sinT * Math.cos(phi);
    _starBuf[i*3+1] = 160 * cosT;
    _starBuf[i*3+2] = 160 * sinT * Math.sin(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(_starBuf, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color:0xeef0ff, size:1.8, transparent:true, opacity:0, sizeAttenuation:false
  }));
  state.scene.add(stars);
}

export function tickRain(dt) {
  if (!rainGeo) return;
  const pos = rainGeo.attributes.position.array;
  for (let i = 0; i < RAIN_COUNT; i++) {
    pos[i*3+1] -= 22 * dt;
    if (pos[i*3+1] < -2) {
      pos[i*3]   = state.camera.position.x + (Math.random()-0.5)*90;
      pos[i*3+1] = state.camera.position.y + 32 + Math.random()*8;
      pos[i*3+2] = state.camera.position.z + (Math.random()-0.5)*90;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
}

export function tickDayNight(dt) {
  gameTime += dt / REAL_SECS_PER_HOUR;
  if (gameTime >= 24) gameTime -= 24;

  weatherTimer -= dt;
  if (weatherTimer <= 0) {
    weatherTimer = 8 * REAL_SECS_PER_HOUR;
    const opts = ['rain','fog','clear'].filter(w => w !== currentWeather);
    currentWeather = opts[Math.floor(Math.random()*opts.length)];
    showMsg('Weather: ' + currentWeather.toUpperCase(), 3000);
    elWxLabel.textContent = currentWeather.toUpperCase();
  }

  const base = getSkyBase(gameTime);
  let bg=base.bg, fg=base.fg, ac=base.ac, ai=base.ai, si=base.si;
  let fogNear, fogFar, rainVis=false;

  if (currentWeather === 'rain') {
    bg = lerpHex(bg, 0x181e1e, 0.45); fg = lerpHex(fg, 0x181e1e, 0.55);
    fogNear=15; fogFar=62; ai*=0.68; si*=0.42; rainVis=true;
  } else if (currentWeather === 'fog') {
    bg = lerpHex(bg, 0x8aadad, 0.65); fg = lerpHex(fg, 0x7aa0a0, 0.70);
    fogNear=5; fogFar=26; ai*=0.80; si*=0.22; rainVis=false;
  } else {
    fogNear=35; fogFar=105; ai*=1.15; si*=1.28; rainVis=false;
  }

  state.scene.background.setHex(bg);
  state.scene.fog.color.setHex(fg);
  state.scene.fog.near = fogNear;
  state.scene.fog.far  = fogFar;
  state.ambientLight.color.setHex(ac);
  state.ambientLight.intensity = ai;
  state.sun.intensity = si;
  if (rain) rain.visible = rainVis;

  const sunAngle = ((gameTime - 6) / 12) * Math.PI;
  state.sun.position.set(Math.cos(sunAngle)*50, Math.sin(sunAngle)*50, 20);

  if (stars) {
    stars.position.copy(state.camera.position);
    stars.material.opacity = getNightBlend(gameTime) * (currentWeather==='clear' ? 0.9 : 0);
  }

  const hh = Math.floor(gameTime);
  const mm = Math.floor((gameTime - hh) * 60);
  elClock.textContent = String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
}
