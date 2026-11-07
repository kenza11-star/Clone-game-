import * as THREE from 'three';
import './style.css';

/* =====================================================================
   BLOCK OBBY - game obby 3D dengan karakter kotak ala Roblox
   ===================================================================== */

const $ = (id) => document.getElementById(id);
const canvas = $('game');

/* ---------------------------------------------------------------------
   Renderer, scene, kamera, cahaya
--------------------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const SKY = 0x8fd3ff;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 210);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8fa6, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* lautan lava di bawah semua */
const lavaSea = new THREE.Mesh(
  new THREE.PlaneGeometry(1200, 1200),
  new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
);
lavaSea.rotation.x = -Math.PI / 2;
lavaSea.position.set(0, -16, -130);
scene.add(lavaSea);

/* awan dekorasi */
{
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(6 + Math.random() * 6, 2 + Math.random() * 1.5, 4 + Math.random() * 4),
        cloudMat,
      );
      b.position.set(j * 5 - n * 2.5, Math.random() * 1.5, Math.random() * 3);
      g.add(b);
    }
    g.position.set((Math.random() - 0.5) * 220, 28 + Math.random() * 22, 40 - Math.random() * 360);
    scene.add(g);
  }
}

/* ---------------------------------------------------------------------
   Level
--------------------------------------------------------------------- */
const solids = []; // semua bagian level (platform + lava)
const movers = []; // yang bergerak
const crumbles = []; // yang runtuh
const flags = []; // bendera checkpoint
const cpPos = []; // posisi respawn tiap checkpoint

const PAL = [0xff6b6b, 0xffb84d, 0xffe14d, 0x6bd66b, 0x4dc3ff, 0xa27bff, 0xff7bd1];
let palIdx = 0;
const nextColor = () => PAL[palIdx++ % PAL.length];

const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });

function updateBounds(p) {
  const m = p.mesh.position;
  p.minX = m.x - p.hw;
  p.maxX = m.x + p.hw;
  p.minY = m.y - p.hh;
  p.maxY = m.y + p.hh;
  p.minZ = m.z - p.hd;
  p.maxZ = m.z + p.hd;
}

function addPart(cx, cy, cz, w, h, d, color, props = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color, emissive: props.emissive || 0x000000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
  mesh.position.set(cx, cy, cz);
  scene.add(mesh);

  const p = {
    mesh,
    hw: w / 2,
    hh: h / 2,
    hd: d / 2,
    type: props.type || 'solid',
    cp: props.cp,
    move: props.move || null,
    crumble: !!props.crumble,
    cstate: 0,
    ctimer: 0,
    active: true,
    ox: cx,
    oy: cy,
    oz: cz,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    minZ: 0,
    maxZ: 0,
  };
  updateBounds(p);
  solids.push(p);
  if (p.move) movers.push(p);
  if (p.crumble) crumbles.push(p);
  return p;
}

/* platform: y = permukaan atas */
function plat(x, yTop, z, w, d, props = {}) {
  const h = props.h ?? 1;
  return addPart(x, yTop - h / 2, z, w, h, d, props.color ?? nextColor(), props);
}

/* lava: y = sisi bawah */
function lava(x, yBottom, z, w, d, props = {}) {
  const h = props.h ?? 0.6;
  return addPart(x, yBottom + h / 2, z, w, h, d, 0xff4a1a, { ...props, type: 'lava', emissive: 0xb02a00 });
}

function flag(x, y, z) {
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 0.16), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
  pole.position.set(x - 3.5, y + 1.5, z);
  pole.castShadow = true;
  const cloth = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.8, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x777777, emissive: 0x000000 }),
  );
  cloth.position.set(0.7, 1.0, 0);
  pole.add(cloth);
  scene.add(pole);
  flags.push(cloth);
  return cloth;
}

function checkpoint(n, x, yTop, z) {
  plat(x, yTop, z, 10, 10, { type: 'check', cp: n, color: 0x3ddc84 });
  cpPos[n] = { x, y: yTop + 0.05, z };
  flag(x, yTop, z);
}

const STAGE_NAMES = [
  'Batu Loncatan',
  'Jalur Lava',
  'Platform Bergerak',
  'Ubin Runtuh',
  'Titian Sempit',
  'Lompatan Langit',
  'Penyapu Lava',
];
const TOTAL_STAGES = STAGE_NAMES.length;

function buildLevel() {
  /* ---- Start / checkpoint 0 ---- */
  plat(0, 0, 0, 12, 12, { type: 'check', cp: 0, color: 0x3ddc84 });
  cpPos[0] = { x: 0, y: 0.05, z: 0 };
  flag(0, 0, 0);

  /* ---- Stage 1: batu loncatan ---- */
  plat(0, 0, -11, 5, 5);
  plat(4, 0, -18, 4, 4);
  plat(-3, 0, -25, 4, 4);
  plat(0, 0, -32, 4, 4);
  checkpoint(1, 0, 0, -41);

  /* ---- Stage 2: jalur lava ---- */
  plat(0, 0, -65, 10, 32, { color: 0xd9c7a0 });
  lava(-2, 0, -54, 6, 2);
  lava(2, 0, -59, 6, 2);
  lava(-2, 0, -64, 6, 2);
  lava(2, 0, -69, 6, 2);
  lava(0, 0, -74, 10, 2);
  checkpoint(2, 0, 0, -88);

  /* ---- Stage 3: platform bergerak ---- */
  plat(0, 0, -98, 4, 4, { move: { axis: 'x', range: 4, speed: 1.3, phase: 0 }, color: 0x4dc3ff });
  plat(0, 0, -105, 4, 4, { move: { axis: 'x', range: 4, speed: 1.3, phase: Math.PI }, color: 0x4dc3ff });
  plat(0, 0, -112, 4, 4, { move: { axis: 'x', range: 4, speed: 1.3, phase: 0 }, color: 0x4dc3ff });
  checkpoint(3, 0, 0, -121);

  /* ---- Stage 4: ubin runtuh ---- */
  const tiles = [
    [0, -129],
    [3, -134],
    [0, -139],
    [-3, -144],
    [0, -149],
    [3, -154],
    [0, -159],
  ];
  for (const [x, z] of tiles) plat(x, 0, z, 3, 3, { crumble: true, color: 0xffa94d });
  checkpoint(4, 0, 0, -167);

  /* ---- Stage 5: titian sempit ---- */
  plat(0, 0, -178, 1.6, 12, { color: 0xa27bff });
  plat(0, 0, -187, 3, 3, { color: 0xff7bd1 });
  plat(-8, 0, -187, 13, 1.6, { color: 0xa27bff });
  plat(-16, 0, -187, 3, 3, { color: 0xff7bd1 });
  plat(-16, 0, -196, 1.6, 15, { color: 0xa27bff });
  plat(-16, 0, -206, 3, 3, { color: 0xff7bd1 });
  plat(-8, 0, -206, 13, 1.6, { color: 0xa27bff });
  plat(0, 0, -206, 3, 3, { color: 0xff7bd1 });
  checkpoint(5, 0, 0, -215);

  /* ---- Stage 6: lompatan langit (bounce pad) ---- */
  plat(0, 0, -224, 4, 4, { type: 'bounce', h: 0.6, color: 0xff3b8d });
  plat(0, 4, -232, 8, 8, { color: 0x6bd66b });
  plat(0, 4.3, -234, 3, 3, { type: 'bounce', h: 0.6, color: 0xff3b8d });
  checkpoint(6, 0, 9, -243);

  /* ---- Stage 7: penyapu lava ---- */
  plat(0, 9, -262, 12, 26, { color: 0xd9c7a0 });
  const sweepers = [
    [-256, 0],
    [-262, 0.9],
    [-268, 1.8],
  ];
  for (const [z, ph] of sweepers) {
    lava(0, 9, z, 11.6, 1, { h: 0.8, move: { axis: 'z', range: 2.5, speed: 1.6, phase: ph } });
  }

  /* ---- Garis finish ---- */
  plat(0, 9, -283, 12, 12, { type: 'goal', color: 0xffd23f });
  buildTrophy(0, 9, -283);
}

let trophy = null;
function buildTrophy(x, y, z) {
  const gold = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a5a00 });
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), gold);
  base.position.y = 0.3;
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), gold);
  stem.position.y = 1.15;
  const cup = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.5), gold);
  cup.position.y = 2.2;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), gold);
  star.position.y = 3.4;
  for (const m of [base, stem, cup, star]) {
    m.castShadow = true;
    g.add(m);
  }
  g.position.set(x, y, z - 1);
  scene.add(g);
  trophy = { group: g, star };
}

/* koin */
const coins = [];
const coinGeo = new THREE.BoxGeometry(0.55, 0.55, 0.14);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x8a6400 });
function coin(x, y, z) {
  const mesh = new THREE.Mesh(coinGeo, coinMat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  coins.push({ mesh, y0: y, got: false, ph: Math.random() * 6 });
}

buildLevel();
[
  [0, 1.4, -11],
  [4, 1.4, -18],
  [-3, 1.4, -25],
  [0, 1.4, -32],
  [3, 1.4, -54],
  [-3, 1.4, -59],
  [3, 1.4, -64],
  [-3, 1.4, -69],
  [0, 2.8, -74],
  [0, 2.4, -101.5],
  [0, 2.4, -108.5],
  [3, 1.4, -134],
  [-3, 1.4, -144],
  [3, 1.4, -154],
  [0, 1.4, -178],
  [-8, 1.4, -187],
  [-16, 1.4, -196],
  [-8, 1.4, -206],
  [0, 7.8, -228],
  [0, 11.8, -240],
  [-4, 10.4, -255],
  [4, 10.4, -259],
  [-4, 10.4, -265],
  [4, 10.4, -270],
  [0, 10.4, -278],
].forEach((c) => coin(c[0], c[1], c[2]));

const colliders = solids.filter((s) => s.type !== 'lava');
const hazards = solids.filter((s) => s.type === 'lava');

/* ---------------------------------------------------------------------
   Karakter kotak (ala Roblox)
--------------------------------------------------------------------- */
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f5c518';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#222';
  g.beginPath();
  g.ellipse(44, 56, 8, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(84, 56, 8, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#222';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(64, 64, 28, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const YEL = 0xf5c518;
const BLUE = 0x2f6fed;
const GREEN = 0x3fae49;
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

const char = new THREE.Group();
function part(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function limb(w, h, d, color, px, py) {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, 0);
  char.add(pivot);
  part(w, h, d, lam(color), 0, -h / 2, 0, pivot);
  return pivot;
}

part(0.9, 0.9, 0.5, lam(BLUE), 0, 1.25, 0, char); // badan
{
  const skin = lam(YEL);
  const front = new THREE.MeshLambertMaterial({ map: faceTexture() });
  part(0.65, 0.65, 0.65, [skin, skin, skin, skin, front, skin], 0, 2.04, 0, char); // kepala
}
const legL = limb(0.42, 0.8, 0.42, GREEN, -0.22, 0.8);
const legR = limb(0.42, 0.8, 0.42, GREEN, 0.22, 0.8);
const armL = limb(0.35, 0.9, 0.35, YEL, -0.65, 1.7);
const armR = limb(0.35, 0.9, 0.35, YEL, 0.65, 1.7);
scene.add(char);

/* ---------------------------------------------------------------------
   State & pemain
--------------------------------------------------------------------- */
const PW = 0.4; // setengah lebar
const PH = 2.35; // tinggi
const EPS = 0.0005;
const GRAV = 36;
const MOVE_SPEED = 9;
const JUMP_V = 13.5;
const BOUNCE_V = 24;

const player = {
  pos: new THREE.Vector3(0, 0.05, 0),
  vel: new THREE.Vector3(),
  ground: null,
  grounded: false,
  coyote: 0,
  face: 0,
  walkT: 0,
};

let state = 'menu'; // menu | play | win
let time = 0;
let playTime = 0;
let deaths = 0;
let coinCount = 0;
let currentCP = 0;
let invuln = 0;
let jumpBuf = 0;
let yaw = 0;
let pitch = 0.38;
const camDist = 11;
const camTarget = new THREE.Vector3(0, 1.6, 0);

/* ---------------------------------------------------------------------
   HUD
--------------------------------------------------------------------- */
const hudStage = $('hudStage');
const hudCoins = $('hudCoins');
const hudTime = $('hudTime');
const hudDeaths = $('hudDeaths');
const toastEl = $('toast');
const flashEl = $('flash');

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function updateHud() {
  hudStage.textContent = 'Stage ' + (currentCP + 1) + '/' + TOTAL_STAGES + ' · ' + STAGE_NAMES[currentCP];
  hudCoins.textContent = 'Koin ' + coinCount + '/' + coins.length;
  hudDeaths.textContent = 'Jatuh ' + deaths;
  hudTime.textContent = fmtTime(playTime);
}
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
}
function flash() {
  flashEl.classList.add('on');
  setTimeout(() => flashEl.classList.remove('on'), 40);
}

/* ---------------------------------------------------------------------
   Suara (WebAudio sederhana)
--------------------------------------------------------------------- */
let actx = null;
let muted = false;
function beep(freq, dur = 0.12, type = 'square', vol = 0.05, slide = 0, delay = 0) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
const sfx = {
  jump: () => beep(380, 0.14, 'square', 0.04, 320),
  coin: () => {
    beep(880, 0.08, 'triangle', 0.07);
    beep(1320, 0.12, 'triangle', 0.07, 0, 0.07);
  },
  die: () => beep(320, 0.35, 'sawtooth', 0.06, -260),
  cp: () => {
    beep(523, 0.1, 'triangle', 0.07);
    beep(659, 0.1, 'triangle', 0.07, 0, 0.1);
    beep(784, 0.18, 'triangle', 0.07, 0, 0.2);
  },
  bounce: () => beep(240, 0.3, 'sine', 0.09, 700),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.08, 0, i * 0.14));
  },
};

/* ---------------------------------------------------------------------
   Input: joystick, tombol lompat, geser kamera, keyboard
--------------------------------------------------------------------- */
const keys = Object.create(null);
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') {
    jumpBuf = 0.15;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

const joyZone = $('joyZone');
const joyBase = $('joyBase');
const joyKnob = $('joyKnob');
let joyId = null;
let joyOx = 0;
let joyOy = 0;
let joyX = 0;
let joyY = 0;
const JOY_R = 56;

function joyMove(e) {
  let dx = e.clientX - joyOx;
  let dy = e.clientY - joyOy;
  const len = Math.hypot(dx, dy);
  if (len > JOY_R) {
    dx *= JOY_R / len;
    dy *= JOY_R / len;
  }
  joyX = dx / JOY_R;
  joyY = dy / JOY_R;
  joyKnob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
}
function joyEnd(e) {
  if (e.pointerId !== joyId) return;
  joyId = null;
  joyX = 0;
  joyY = 0;
  joyBase.classList.remove('on');
  joyKnob.style.transform = 'translate(-50%, -50%)';
}
joyZone.addEventListener('pointerdown', (e) => {
  if (joyId !== null) return;
  joyId = e.pointerId;
  try {
    joyZone.setPointerCapture(e.pointerId);
  } catch (_) {}
  joyOx = e.clientX;
  joyOy = e.clientY;
  joyBase.style.left = joyOx + 'px';
  joyBase.style.top = joyOy + 'px';
  joyBase.classList.add('on');
  joyMove(e);
  e.preventDefault();
});
joyZone.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) joyMove(e);
});
joyZone.addEventListener('pointerup', joyEnd);
joyZone.addEventListener('pointercancel', joyEnd);

const btnJump = $('btnJump');
btnJump.addEventListener('pointerdown', (e) => {
  jumpBuf = 0.15;
  btnJump.classList.add('pressed');
  e.preventDefault();
});
const jumpUp = () => btnJump.classList.remove('pressed');
btnJump.addEventListener('pointerup', jumpUp);
btnJump.addEventListener('pointercancel', jumpUp);
btnJump.addEventListener('pointerleave', jumpUp);

/* geser layar = putar kamera */
let lookId = null;
let lookX = 0;
let lookY = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (lookId !== null) return;
  lookId = e.pointerId;
  lookX = e.clientX;
  lookY = e.clientY;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId) return;
  const dx = e.clientX - lookX;
  const dy = e.clientY - lookY;
  lookX = e.clientX;
  lookY = e.clientY;
  yaw -= dx * 0.0065;
  pitch = Math.min(1.3, Math.max(0.05, pitch + dy * 0.0045));
});
const lookEnd = (e) => {
  if (e.pointerId === lookId) lookId = null;
};
canvas.addEventListener('pointerup', lookEnd);
canvas.addEventListener('pointercancel', lookEnd);
window.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------------------------------------------------------------
   Logika game
--------------------------------------------------------------------- */
function setCheckpoint(n) {
  currentCP = n;
  const f = flags[n];
  if (f) {
    f.material.color.setHex(0x22e06b);
    f.material.emissive.setHex(0x0a7a35);
  }
  if (n > 0) {
    toast('CHECKPOINT ' + n + '!');
    sfx.cp();
  }
  updateHud();
}

function respawn(countDeath) {
  const p = cpPos[currentCP];
  player.pos.set(p.x, p.y, p.z);
  player.vel.set(0, 0, 0);
  player.ground = null;
  player.grounded = false;
  invuln = 0.4;
  if (countDeath) {
    deaths++;
    flash();
    sfx.die();
  }
  updateHud();
}

function resetGame() {
  deaths = 0;
  coinCount = 0;
  playTime = 0;
  currentCP = 0;
  for (const c of coins) {
    c.got = false;
    c.mesh.visible = true;
  }
  for (const f of flags) {
    f.material.color.setHex(0x777777);
    f.material.emissive.setHex(0x000000);
  }
  for (const p of crumbles) {
    p.cstate = 0;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.set(p.ox, p.oy, p.oz);
    updateBounds(p);
  }
  respawn(false);
  updateHud();
}

function winGame() {
  state = 'win';
  sfx.win();
  $('winStats').textContent =
    'Waktu ' + fmtTime(playTime) + '  •  Koin ' + coinCount + '/' + coins.length + '  •  Jatuh ' + deaths;
  $('winScreen').classList.remove('hidden');
}

function overlaps(b) {
  const p = player.pos;
  return (
    p.x + PW > b.minX &&
    p.x - PW < b.maxX &&
    p.y + PH > b.minY + EPS &&
    p.y < b.maxY - EPS &&
    p.z + PW > b.minZ &&
    p.z - PW < b.maxZ
  );
}

function stepPlayer(dt) {
  const pos = player.pos;
  const vel = player.vel;

  /* ---- input arah ---- */
  let f = -joyY;
  let r = joyX;
  if (keys.KeyW) f += 1;
  if (keys.KeyS) f -= 1;
  if (keys.KeyD) r += 1;
  if (keys.KeyA) r -= 1;
  let len = Math.hypot(f, r);
  if (len > 1) {
    f /= len;
    r /= len;
    len = 1;
  }
  if (len < 0.12) {
    f = 0;
    r = 0;
  }
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const tvx = (-sy * f + cy * r) * MOVE_SPEED;
  const tvz = (-cy * f - sy * r) * MOVE_SPEED;
  const k = 1 - Math.exp(-(player.grounded ? 16 : 6) * dt);
  vel.x += (tvx - vel.x) * k;
  vel.z += (tvz - vel.z) * k;

  /* ---- lompat ---- */
  player.coyote = player.grounded ? 0.1 : player.coyote - dt;
  jumpBuf -= dt;
  if (jumpBuf > 0 && player.coyote > 0) {
    vel.y = JUMP_V;
    jumpBuf = 0;
    player.coyote = 0;
    player.grounded = false;
    player.ground = null;
    sfx.jump();
  }
  vel.y -= GRAV * dt;
  if (vel.y < -45) vel.y = -45;

  /* ---- gerak sumbu X ---- */
  pos.x += vel.x * dt;
  for (const b of colliders) {
    if (!b.active || !overlaps(b)) continue;
    if (b.maxY - pos.y <= 0.45) {
      pos.y = b.maxY;
      if (vel.y < 0) vel.y = 0;
    } else {
      pos.x = pos.x < (b.minX + b.maxX) / 2 ? b.minX - PW - EPS : b.maxX + PW + EPS;
      vel.x = 0;
    }
  }

  /* ---- gerak sumbu Z ---- */
  pos.z += vel.z * dt;
  for (const b of colliders) {
    if (!b.active || !overlaps(b)) continue;
    if (b.maxY - pos.y <= 0.45) {
      pos.y = b.maxY;
      if (vel.y < 0) vel.y = 0;
    } else {
      pos.z = pos.z < (b.minZ + b.maxZ) / 2 ? b.minZ - PW - EPS : b.maxZ + PW + EPS;
      vel.z = 0;
    }
  }

  /* ---- gerak sumbu Y ---- */
  pos.y += vel.y * dt;
  player.grounded = false;
  player.ground = null;
  for (const b of colliders) {
    if (!b.active || !overlaps(b)) continue;
    if (pos.y + PH / 2 >= (b.minY + b.maxY) / 2) {
      pos.y = b.maxY;
      if (vel.y <= 0) {
        if (b.type === 'bounce') {
          vel.y = BOUNCE_V;
          sfx.bounce();
        } else {
          vel.y = 0;
          player.grounded = true;
          player.ground = b;
        }
      }
    } else {
      pos.y = b.minY - PH - EPS;
      if (vel.y > 0) vel.y = 0;
    }
  }
}

function updatePlatforms(dt) {
  for (const p of movers) {
    const s = Math.sin(time * p.move.speed + p.move.phase) * p.move.range;
    const nx = p.ox + (p.move.axis === 'x' ? s : 0);
    const ny = p.oy + (p.move.axis === 'y' ? s : 0);
    const nz = p.oz + (p.move.axis === 'z' ? s : 0);
    const m = p.mesh.position;
    const dx = nx - m.x;
    const dy = ny - m.y;
    const dz = nz - m.z;
    m.set(nx, ny, nz);
    updateBounds(p);
    if (state === 'play' && player.ground === p) {
      player.pos.x += dx;
      player.pos.y += dy;
      player.pos.z += dz;
    }
  }

  for (const p of crumbles) {
    if (p.cstate === 0) {
      if (state === 'play' && player.ground === p) {
        p.cstate = 1;
        p.ctimer = 0.55;
      }
    } else if (p.cstate === 1) {
      p.ctimer -= dt;
      p.mesh.position.x = p.ox + (Math.random() - 0.5) * 0.14;
      p.mesh.position.z = p.oz + (Math.random() - 0.5) * 0.14;
      if (p.ctimer <= 0) {
        p.cstate = 2;
        p.ctimer = 2.8;
        p.active = false;
        p.mesh.visible = false;
        p.mesh.position.set(p.ox, p.oy, p.oz);
      }
    } else {
      p.ctimer -= dt;
      if (p.ctimer <= 0) {
        p.cstate = 0;
        p.active = true;
        p.mesh.visible = true;
        p.mesh.position.set(p.ox, p.oy, p.oz);
        updateBounds(p);
      }
    }
  }
}

function checkEvents() {
  const pos = player.pos;

  /* lava & jatuh */
  if (invuln <= 0) {
    if (pos.y < -14) {
      respawn(true);
      return;
    }
    for (const b of hazards) {
      if (overlaps(b)) {
        respawn(true);
        return;
      }
    }
  }

  /* checkpoint & finish */
  const g = player.ground;
  if (g) {
    if (g.type === 'check' && g.cp > currentCP) setCheckpoint(g.cp);
    if (g.type === 'goal' && state === 'play') {
      winGame();
      return;
    }
  }

  /* koin */
  for (const c of coins) {
    if (c.got) continue;
    const m = c.mesh.position;
    if (Math.abs(m.x - pos.x) < 1.1 && Math.abs(m.z - pos.z) < 1.1 && Math.abs(m.y - (pos.y + 1.15)) < 1.5) {
      c.got = true;
      c.mesh.visible = false;
      coinCount++;
      sfx.coin();
      updateHud();
    }
  }
}

/* ---------------------------------------------------------------------
   Animasi karakter & kamera
--------------------------------------------------------------------- */
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function animateChar(dt) {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (state === 'play' && speed > 0.8) {
    player.face = lerpAngle(player.face, Math.atan2(player.vel.x, player.vel.z), 1 - Math.exp(-16 * dt));
  }
  if (state === 'win') player.face += dt * 4;

  char.position.copy(player.pos);
  char.rotation.y = player.face;

  let aL = 0;
  let aR = 0;
  let lL = 0;
  let lR = 0;
  if (state === 'win') {
    aL = -2.6;
    aR = -2.6;
  } else if (!player.grounded) {
    aL = -2.5;
    aR = -2.5;
    lL = 0.35;
    lR = -0.35;
  } else if (speed > 0.8) {
    player.walkT += dt * speed * 1.5;
    const sw = Math.sin(player.walkT) * Math.min(1, speed / 6) * 0.95;
    lL = sw;
    lR = -sw;
    aL = -sw;
    aR = sw;
  }
  const t = Math.min(1, dt * 22);
  legL.rotation.x += (lL - legL.rotation.x) * t;
  legR.rotation.x += (lR - legR.rotation.x) * t;
  armL.rotation.x += (aL - armL.rotation.x) * t;
  armR.rotation.x += (aR - armR.rotation.x) * t;
}

function updateCamera(dt) {
  if (state === 'menu') yaw += dt * 0.35;
  if (keys.ArrowLeft) yaw += 1.9 * dt;
  if (keys.ArrowRight) yaw -= 1.9 * dt;
  if (keys.ArrowUp) pitch = Math.max(0.05, pitch - 1.2 * dt);
  if (keys.ArrowDown) pitch = Math.min(1.3, pitch + 1.2 * dt);

  const want = new THREE.Vector3(player.pos.x, player.pos.y + 1.7, player.pos.z);
  camTarget.lerp(want, 1 - Math.exp(-12 * dt));
  const cp = Math.cos(pitch);
  camera.position.set(
    camTarget.x + Math.sin(yaw) * cp * camDist,
    camTarget.y + Math.sin(pitch) * camDist,
    camTarget.z + Math.cos(yaw) * cp * camDist,
  );
  camera.lookAt(camTarget);

  sun.position.set(player.pos.x + 24, player.pos.y + 44, player.pos.z + 16);
  sun.target.position.copy(player.pos);
}

/* ---------------------------------------------------------------------
   Loop utama
--------------------------------------------------------------------- */
let last = performance.now();
let hudTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;

  updatePlatforms(dt);

  if (state === 'play') {
    playTime += dt;
    invuln -= dt;
    const n = Math.max(1, Math.ceil(dt / 0.0125));
    for (let i = 0; i < n; i++) stepPlayer(dt / n);
    checkEvents();
    hudTimer += dt;
    if (hudTimer > 0.25) {
      hudTimer = 0;
      hudTime.textContent = fmtTime(playTime);
    }
  }

  for (const c of coins) {
    if (c.got) continue;
    c.mesh.rotation.y += dt * 3;
    c.mesh.position.y = c.y0 + Math.sin(time * 2.4 + c.ph) * 0.15;
  }
  if (trophy) {
    trophy.star.rotation.y += dt * 2;
    trophy.star.position.y = 3.4 + Math.sin(time * 2) * 0.12;
  }

  animateChar(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------------
   Tombol UI
--------------------------------------------------------------------- */
$('btnStart').addEventListener('click', () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !actx) actx = new AC();
    if (actx && actx.state === 'suspended') actx.resume();
  } catch (_) {}
  $('startScreen').classList.add('hidden');
  resetGame();
  state = 'play';
  yaw = 0;
  toast('Selamat bermain!');
});

$('btnAgain').addEventListener('click', () => {
  $('winScreen').classList.add('hidden');
  resetGame();
  state = 'play';
  yaw = 0;
});

$('btnRespawn').addEventListener('click', () => {
  if (state === 'play') respawn(false);
});

$('btnMute').addEventListener('click', () => {
  muted = !muted;
  $('btnMute').innerHTML = muted ? '&#128263;' : '&#128266;';
});

/* mulai */
setCheckpoint(0);
resetGame();
requestAnimationFrame(frame);

/* untuk debugging */
window.__game = { player, solids, coins, get state() { return state; } };
