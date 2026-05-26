export const state = {
  scene: null,
  camera: null,
  sun: null,
  ambientLight: null,

  bots: [],
  bullets: [],
  zones: [],
  machineguns: [],
  player: null,

  keys: {},
  yaw: Math.PI,
  pitch: 0,
  mouseLocked: false,
  isADS: false,
  adsProgress: 0,
  reticleKick: 0,

  mountedMG: null,
  mgFireHeld: false,

  killCount: 0,
  deathCount: 0,
  pointsVal: 0,
};
