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
  new THREE.MeshBasicMaterial({ color: 0x3a7bd5 }),
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

const STAGE_NAMES = ['Kota'];
const TOTAL_STAGES = STAGE_NAMES.length;

function buildLevel() {
  /* ---- Tanah kota (permukaan atas di y = 0) ---- */
  plat(0, 0, 0, 300, 300, { type: 'solid', color: 0x6bbf59 });

  /* ---- Titik spawn ---- */
  cpPos[0] = { x: 0, y: 0.05, z: 0 };
}

/* ---------------------------------------------------------------------
   Tahap 2: jalan aspal, trotoar, dan garis putus-putus
--------------------------------------------------------------------- */
const ROAD_W = 6;          // lebar jalan
const WALK_W = 2;          // lebar trotoar
const ROAD_LINES = [-40, 0, 40];      // pusat jalan (vertikal & horizontal)
const GRID_LINES = [-150, -40, 0, 40, 150]; // batas blok (ujung peta = -150 & 150)
const ROAD_H = 0.12;
const WALK_H = 0.25;
const ROAD_TOP = 0.06;     // permukaan jalan sedikit di atas tanah
const WALK_TOP = 0.25;     // trotoar lebih tinggi (seperti trotoar sungguhan)
const ASPHALT = 0x3a3d42;
const CONCRETE = 0xc9ccd1;
const lineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

const isRoad = (v) => ROAD_LINES.includes(v);

function buildRoads() {
  const MIN = GRID_LINES[0];
  const MAX = GRID_LINES[GRID_LINES.length - 1];

  /* jalan aspal vertikal & horizontal */
  for (const c of ROAD_LINES) {
    plat(c, ROAD_TOP, (MIN + MAX) / 2, ROAD_W, MAX - MIN, { h: ROAD_H, color: ASPHALT });
    plat((MIN + MAX) / 2, ROAD_TOP, c, MAX - MIN, ROAD_W, { h: ROAD_H, color: ASPHALT });
  }

  /* trotoar: cincin di dalam setiap blok */
  for (let i = 0; i < GRID_LINES.length - 1; i++) {
    for (let j = 0; j < GRID_LINES.length - 1; j++) {
      const a = GRID_LINES[i], b = GRID_LINES[i + 1];
      const c = GRID_LINES[j], d = GRID_LINES[j + 1];
      const X0 = a + (isRoad(a) ? ROAD_W / 2 : 0);
      const X1 = b - (isRoad(b) ? ROAD_W / 2 : 0);
      const Z0 = c + (isRoad(c) ? ROAD_W / 2 : 0);
      const Z1 = d - (isRoad(d) ? ROAD_W / 2 : 0);
      const cx = (X0 + X1) / 2;
      const cz = (Z0 + Z1) / 2;
      const w = X1 - X0;
      const dz = Z1 - Z0;
      const opts = { h: WALK_H, color: CONCRETE };
      plat(cx, WALK_TOP, Z1 - WALK_W / 2, w, WALK_W, opts);       // atas
      plat(cx, WALK_TOP, Z0 + WALK_W / 2, w, WALK_W, opts);       // bawah
      plat(X0 + WALK_W / 2, WALK_TOP, cz, WALK_W, dz - 2 * WALK_W, opts); // kiri
      plat(X1 - WALK_W / 2, WALK_TOP, cz, WALK_W, dz - 2 * WALK_W, opts); // kanan
    }
  }

  /* garis putus-putus putih (dekorasi, tidak bisa ditabrak) */
  const DASH = 4;
  for (const c of ROAD_LINES) {
    for (let z = MIN + 2; z < MAX - 2; z += DASH) {
      if (ROAD_LINES.some((h) => Math.abs(z - h) < ROAD_W / 2 + 1)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 2), lineMat);
      m.position.set(c, ROAD_TOP + ROAD_H / 2 + 0.01, z);
      scene.add(m);
    }
    for (let x = MIN + 2; x < MAX - 2; x += DASH) {
      if (ROAD_LINES.some((v) => Math.abs(x - v) < ROAD_W / 2 + 1)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 0.25), lineMat);
      m.position.set(x, ROAD_TOP + ROAD_H / 2 + 0.01, c);
      scene.add(m);
    }
  }
}

/* ---------------------------------------------------------------------
   Tahap 3: rumah-rumah di setiap blok
--------------------------------------------------------------------- */
const HOUSE_STYLES = [
  { wall: 0xf4e3c1, roof: 0xb5523b, roofType: 'gable' }, // krem, atap genteng
  { wall: 0xf2b8a2, roof: 0x5a6c7d, roofType: 'flat' },  // pink, atap datar
  { wall: 0xbfe3f2, roof: 0x7a4a2a, roofType: 'gable' }, // biru muda, atap kayu
];
const HOUSE_DOORS = [];
const WINDOW_MAT = new THREE.MeshLambertMaterial({ color: 0x9fd8ff, emissive: 0x1d3a4f });
const DOOR_MAT = new THREE.MeshLambertMaterial({ color: 0x6b3f1d });

/* hiasan visual (tidak bisa ditabrak) */
function deco(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  return m;
}

/* rumah: dinding (solid), atap, pintu, dan jendela di sisi depan & samping */
function buildHouse(x, z, style = 0, opts = {}) {
  const s = HOUSE_STYLES[style % HOUSE_STYLES.length];
  const w = opts.w ?? 8;
  const d = opts.d ?? 8;
  const h = opts.h ?? 4.5;

  /* dinding utama, ikut sistem collision */
  addPart(x, h / 2, z, w, h, d, s.wall);

  /* atap */
  if (s.roofType === 'gable') {
    const r = Math.hypot(w, d) / 2 + 0.3;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(r, 2.2, 4),
      new THREE.MeshLambertMaterial({ color: s.roof }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, h + 1.1, z);
    roof.castShadow = true;
    scene.add(roof);
  } else {
    deco(w + 0.6, 0.5, d + 0.6, new THREE.MeshLambertMaterial({ color: s.roof }), x, h + 0.25, z);
  }

  /* pintu di sisi depan (+z) */
  deco(1.2, 2.2, 0.1, DOOR_MAT, x, 1.1, z + d / 2 + 0.05);

  /* jendela depan (2 buah) */
  deco(1.3, 1.3, 0.1, WINDOW_MAT, x - w / 3, 2.8, z + d / 2 + 0.05);
  deco(1.3, 1.3, 0.1, WINDOW_MAT, x + w / 3, 2.8, z + d / 2 + 0.05);

  /* jendela samping kiri & kanan */
  deco(0.1, 1.3, 1.3, WINDOW_MAT, x - w / 2 - 0.05, 2.8, z);
  deco(0.1, 1.3, 1.3, WINDOW_MAT, x + w / 2 + 0.05, 2.8, z);

  const houseNo = HOUSE_DOORS.length + 1;
  numberSign(x, 3.85, z + d / 2 + 0.06, houseNo);
  HOUSE_DOORS.push({ x, z: z + d / 2 + 1.2, n: houseNo }); // titik berdiri di depan pintu

  /* cerobong asap untuk rumah atap genteng */
  if (s.roofType === 'gable') {
    deco(0.8, 2.0, 0.8, new THREE.MeshLambertMaterial({ color: 0x8a8a8a }), x + w / 4, h + 1.6, z - d / 4);
  }
}

function buildHouses() {
  const MIN = GRID_LINES[0];
  const MAX = GRID_LINES[GRID_LINES.length - 1];
  let n = 0;
  for (let i = 0; i < GRID_LINES.length - 1; i++) {
    for (let j = 0; j < GRID_LINES.length - 1; j++) {
      const a = GRID_LINES[i], b = GRID_LINES[i + 1];
      const c = GRID_LINES[j], d = GRID_LINES[j + 1];
      /* area kosong di dalam trotoar */
      const IX0 = a + (isRoad(a) ? ROAD_W / 2 : 0) + WALK_W;
      const IX1 = b - (isRoad(b) ? ROAD_W / 2 : 0) - WALK_W;
      const IZ0 = c + (isRoad(c) ? ROAD_W / 2 : 0) + WALK_W;
      const IZ1 = d - (isRoad(d) ? ROAD_W / 2 : 0) - WALK_W;
      const cx = (IX0 + IX1) / 2;
      const cz = (IZ0 + IZ1) / 2;
      const w = Math.min(8, IX1 - IX0 - 4);
      const dd = Math.min(8, IZ1 - IZ0 - 4);
      const style = (i * 2 + j) % HOUSE_STYLES.length;
      buildHouse(cx, cz, style, { w, d: dd, h: 4 + (n % 3) * 0.5 });
      n++;
    }
  }
}

/* ---------------------------------------------------------------------
   Tahap 4: pohon, bangku, lampu jalan, tong sampah, dan mobil parkir
   (semua hiasan visual dulu; collision menyusul di Tahap 5)
--------------------------------------------------------------------- */
const TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x7a4a2a });
const LEAF_MATS = [0x3f9e4a, 0x4fae55, 0x2f8a3d].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const BENCH_MAT = new THREE.MeshLambertMaterial({ color: 0x9b6b43 });
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x444444 });
const LAMP_MAT = new THREE.MeshLambertMaterial({ color: 0xfff3b0, emissive: 0xffd966 });
const BIN_MAT = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
const TIRE_MAT = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const CAR_COLORS = [0xe53935, 0xfdd835, 0xffffff, 0x1e88e5, 0x8e24aa];

/* pohon: batang + 3 tajuk kubus bertumpuk */
function buildTree(x, z, s = 1) {
  const g = new THREE.Group();
  addPart(x, 1.5 * s, z, 0.8 * s, 3 * s, 0.8 * s, 0x7a4a2a); // batang: bisa ditabrak
  const tiers = [
    [4 * s, 2.2 * s, 4 * s, 3.8 * s],
    [3 * s, 2 * s, 3 * s, 5.2 * s],
    [1.8 * s, 1.6 * s, 1.8 * s, 6.6 * s],
  ];
  tiers.forEach(([w, h, d, y], i) => {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), LEAF_MATS[i % LEAF_MATS.length]);
    leaf.position.y = y;
    leaf.castShadow = true;
    g.add(leaf);
  });
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, 0, z);
  scene.add(g);
}

/* bangku taman */
function buildBench(x, z) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.7), BENCH_MAT);
  seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.12), BENCH_MAT);
  back.position.set(0, 0.9, -0.3);
  g.add(seat, back);
  for (const lx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.6), POLE_MAT);
    leg.position.set(lx, 0.25, 0);
    g.add(leg);
  }
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, 0, z);
  scene.add(g);
}

/* lampu jalan */
function buildLamp(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.5, 0.25), POLE_MAT);
  pole.position.y = 2.25;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), LAMP_MAT);
  head.position.y = 4.6;
  g.add(pole, head);
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, WALK_TOP, z);
  scene.add(g);
}

/* tong sampah */
function buildBin(x, z) {
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 1.1, 8), BIN_MAT);
  bin.position.set(x, WALK_TOP + 0.55, z);
  bin.castShadow = true;
  scene.add(bin);
}

/* mobil kotak diparkir di pinggir jalan */
function buildCar(x, z, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.9, 3.6),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 0.6;
  g.add(body);
  /* lampu depan (kuning) dan belakang (merah) di kedua ujung mobil */
  for (const lz of [-1.81, 1.81]) {
    const lampMat = lz > 0
      ? new THREE.MeshLambertMaterial({ color: 0xfff3b0, emissive: 0xffd966 })
      : new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0x991111 });
    for (const lx of [-0.6, 0.6]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), lampMat);
      light.position.set(lx, 0.6, lz);
      g.add(light);
    }
  }
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.7, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff }),
  );
  cabin.position.set(0, 1.35, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-1.05, -1.2], [1.05, -1.2], [-1.05, 1.2], [1.05, 1.2]]) {
    const tire = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.6), TIRE_MAT);
    tire.position.set(wx, 0.3, wz);
    g.add(tire);
  }
  g.traverse((o) => (o.castShadow = true));
  g.position.set(x, 0, z);
  scene.add(g);
}

function buildDecor() {
  const MIN = GRID_LINES[0];
  const MAX = GRID_LINES[GRID_LINES.length - 1];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  for (let i = 0; i < GRID_LINES.length - 1; i++) {
    for (let j = 0; j < GRID_LINES.length - 1; j++) {
      const a = GRID_LINES[i], b = GRID_LINES[i + 1];
      const c = GRID_LINES[j], d = GRID_LINES[j + 1];
      const X0 = a + (isRoad(a) ? ROAD_W / 2 : 0);
      const X1 = b - (isRoad(b) ? ROAD_W / 2 : 0);
      const Z0 = c + (isRoad(c) ? ROAD_W / 2 : 0);
      const Z1 = d - (isRoad(d) ? ROAD_W / 2 : 0);
      const IX0 = X0 + WALK_W, IX1 = X1 - WALK_W;
      const IZ0 = Z0 + WALK_W, IZ1 = Z1 - WALK_W;
      const cx = (IX0 + IX1) / 2;
      const cz = (IZ0 + IZ1) / 2;

      /* 3 pohon di pojok taman, pojok keempat dikosongkan acak */
      const corners = [
        [IX0 + 1.5, IZ0 + 1.5],
        [IX1 - 1.5, IZ0 + 1.5],
        [IX0 + 1.5, IZ1 - 1.5],
        [IX1 - 1.5, IZ1 - 1.5],
      ];
      const skip = Math.floor(rnd() * 4);
      corners.forEach(([tx, tz], k) => {
        if (k !== skip) buildTree(tx, tz, 0.9 + rnd() * 0.35);
      });

      /* bangku di sisi kiri taman */
      buildBench(IX0 + 3, cz);

      /* lampu jalan & tong sampah di sudut trotoar */
      buildLamp(X0 + 1, Z0 + 1);
      buildBin(X0 + 1, Z0 + 4);
    }
  }

}

/* ---------------------------------------------------------------------
   Tahap 5: interior rumah sederhana & interaksi masuk/keluar
   Semua rumah berbagi satu ruangan interior yang letaknya jauh dari kota.
--------------------------------------------------------------------- */
const ROOM = { x: 400, z: 0 };
const ROOM_EXIT = { x: ROOM.x, z: ROOM.z + 5 }; // titik pintu keluar di dalam
let inside = false;
let returnPt = null;
let actionBuf = false;
const btnAction = $('btnAction');

function buildInterior() {
  const wallCol = 0xf7efe0;
  plat(ROOM.x, 0, ROOM.z, 12, 12, { type: 'solid', color: 0xd9c7a0 }); // lantai
  addPart(ROOM.x, 2, ROOM.z - 6, 12, 4, 0.5, wallCol);   // dinding utara
  addPart(ROOM.x - 6, 2, ROOM.z, 0.5, 4, 12, wallCol);   // dinding barat
  addPart(ROOM.x + 6, 2, ROOM.z, 0.5, 4, 12, wallCol);   // dinding timur
  addPart(ROOM.x - 3.5, 2, ROOM.z + 6, 5, 4, 0.5, wallCol); // dinding selatan kiri
  addPart(ROOM.x + 3.5, 2, ROOM.z + 6, 5, 4, 0.5, wallCol); // dinding selatan kanan (celah = pintu)
  plat(ROOM.x - 3, 1, ROOM.z - 2, 3, 2, { type: 'solid', color: 0x8b5a2b }); // meja
  plat(ROOM.x + 3, 0.6, ROOM.z - 3, 2, 2, { type: 'solid', color: 0x6b6b8a }); // kursi/kotak
}

function teleportPlayer(x, z) {
  player.pos.set(x, 0.05, z);
  player.vel.set(0, 0, 0);
  player.ground = null;
  player.grounded = false;
  invuln = 0.4;
}

function enterHouse(dp) {
  returnPt = { x: dp.x, z: dp.z };
  teleportPlayer(ROOM.x, ROOM.z + 3);
  inside = true;
  toast('Masuk rumah');
  if (missionState === 1 && dp.n === MISSION_HOUSE_NO) completeMission();
}

function exitHouse() {
  teleportPlayer(returnPt.x, returnPt.z);
  inside = false;
  toast('Keluar rumah');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') actionBuf = true;
});
btnAction.addEventListener('pointerdown', (e) => {
  actionBuf = true;
  e.preventDefault();
});

function checkInteract() {
  const pos = player.pos;
  updateNPCs(performance.now() / 1000);
  /* jika pemain jatuh/respawn keluar ruangan, anggap sudah di luar */
  if (inside && Math.abs(pos.x - ROOM.x) > 8) inside = false;

  let label = null;
  let action = null;
  if (inside) {
    if (Math.hypot(pos.x - ROOM_EXIT.x, pos.z - ROOM_EXIT.z) < 2.5) {
      label = 'KELUAR';
      action = exitHouse;
    }
  } else {
    for (const npc of npcs) {
      const p = npc.group.position;
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < 2.5) {
        label = 'BICARA';
        action = () => talkTo(npc);
        break;
      }
    }
    if (!label) {
      for (const dp of HOUSE_DOORS) {
        if (Math.hypot(pos.x - dp.x, pos.z - dp.z) < 2.5) {
          label = 'MASUK';
          action = () => enterHouse(dp);
          break;
        }
      }
    }
  }

  btnAction.style.display = label ? 'block' : 'none';
  btnAction.textContent = label || '';
  if (actionBuf && action) action();
  actionBuf = false;
}

/* ---------------------------------------------------------------------
   Tahap 6: NPC, dialog, dan misi pertama
--------------------------------------------------------------------- */
const MISSION_HOUSE_NO = 3;
const npcs = [];
let missionState = 0; // 0 belum mulai | 1 bawa surat | 2 selesai
let dlgTimer = null;
const dialogEl = $('dialog');
const dlgName = $('dlgName');
const dlgText = $('dlgText');
const hudMission = $('hudMission');

function numberSign(x, y, z, n) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 70);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }),
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

/* ---------- Penampilan NPC: wajah, rambut, baju, celana, aksesoris ---------- */
const SKINS = [0xffd7a8, 0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69];
const HAIR_COLORS = [0x2b1d14, 0x6b4226, 0xd4a017, 0x1a1a1a, 0xb0413e, 0x9e9e9e, 0x3b6fb6];
const SHIRT_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xff7043, 0x26c6da, 0xf5f5f5];
const PANT_COLORS = [0x333366, 0x4e342e, 0x212121, 0x546e7a, 0x7b1fa2, 0x2e7d32];
const HAIRSTYLES = ['short', 'long', 'bun', 'bald', 'curly'];
const ACCESSORIES = ['none', 'none', 'hat', 'glasses', 'backpack', 'scarf', 'bag', 'headphones'];
const EXPRESSIONS = ['smile', 'neutral', 'grin', 'surprised', 'wink', 'sleepy'];
const SHIRT_STYLES = ['plain', 'stripe', 'collar'];
const PANT_STYLES = ['long', 'shorts'];

let lookSeed = 13;
const rndLook = () => ((lookSeed = (lookSeed * 9301 + 49297) % 233280) / 233280);
const pickLook = (arr) => arr[Math.floor(rndLook() * arr.length)];

function randomLook() {
  return {
    skin: pickLook(SKINS),
    hairStyle: pickLook(HAIRSTYLES),
    hair: pickLook(HAIR_COLORS),
    shirt: pickLook(SHIRT_COLORS),
    shirtStyle: pickLook(SHIRT_STYLES),
    accent: pickLook(SHIRT_COLORS),
    pants: pickLook(PANT_COLORS),
    pantStyle: pickLook(PANT_STYLES),
    accessory: pickLook(ACCESSORIES),
    accColor: pickLook(SHIRT_COLORS),
    expression: pickLook(EXPRESSIONS),
  };
}

/* tekstur wajah: mata & mulut sesuai ekspresi */
const faceCache = {};
function faceMaterial(expr, skin) {
  const key = expr + skin;
  if (faceCache[key]) return faceCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#' + skin.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#111111';
  ctx.strokeStyle = '#111111';
  ctx.lineCap = 'round';

  const big = expr === 'surprised';
  const sz = big ? 16 : 12;
  if (expr === 'sleepy') {
    ctx.fillRect(34, 60, 16, 4);
    ctx.fillRect(78, 60, 16, 4);
  } else if (expr === 'wink') {
    ctx.fillRect(34, 60, 16, 4);
    ctx.fillRect(78, 56, 12, 12);
  } else {
    ctx.fillRect(42 - sz / 2, 56 - sz / 2, sz, sz);
    ctx.fillRect(86 - sz / 2, 56 - sz / 2, sz, sz);
  }

  ctx.lineWidth = 5;
  ctx.beginPath();
  if (expr === 'smile' || expr === 'wink') {
    ctx.arc(64, 82, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,110,120,0.35)';
    ctx.beginPath(); ctx.arc(28, 80, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(100, 80, 8, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'grin') {
    ctx.beginPath();
    ctx.arc(64, 84, 18, 0, Math.PI);
    ctx.fill();
  } else if (expr === 'surprised') {
    ctx.arc(64, 90, 8, 0, Math.PI * 2);
    ctx.stroke();
  } else if (expr === 'sleepy') {
    ctx.fillRect(52, 90, 24, 4);
  } else {
    ctx.fillRect(50, 88, 28, 5);
  }

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  faceCache[key] = mat;
  return mat;
}

/* aksesoris kecil dipasang di kepala / badan */
function attachAccessory(g, look) {
  const acc = look.accessory;
  const m = (w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (acc === 'hat') {
    m(0.8, 0.35, 0.8, look.accColor, 0, 3.0, 0);
    m(1.1, 0.07, 1.1, look.accColor, 0, 2.83, 0);
  } else if (acc === 'glasses') {
    m(0.2, 0.2, 0.03, 0x111111, -0.12, 2.52, 0.37);
    m(0.2, 0.2, 0.03, 0x111111, 0.12, 2.52, 0.37);
    m(0.36, 0.04, 0.04, 0x111111, 0, 2.55, 0.37);
  } else if (acc === 'backpack') {
    m(0.7, 0.9, 0.35, look.accColor, 0, 1.4, -0.45);
  } else if (acc === 'scarf') {
    m(0.82, 0.18, 0.56, look.accColor, 0, 1.84, 0);
    m(0.18, 0.4, 0.1, look.accColor, 0.15, 1.6, 0.3);
  } else if (acc === 'bag') {
    /* tas dijinjing di tangan kanan (dipasang di lengan kanan) */
    return 'bag';
  } else if (acc === 'headphones') {
    m(0.85, 0.1, 0.1, 0x222222, 0, 2.9, 0);
    m(0.12, 0.3, 0.25, 0x222222, -0.45, 2.5, 0);
    m(0.12, 0.3, 0.25, 0x222222, 0.45, 2.5, 0);
  }
  return null;
}

function buildNPC(name, look, walk, lines, giver = false) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: look.shirt });
  const pantMat = new THREE.MeshLambertMaterial({ color: look.pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: look.skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: look.hair });

  /* badan + pola baju */
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5), shirtMat);
  torso.position.y = 1.3;
  g.add(torso);
  if (look.shirtStyle === 'stripe') {
    const stripeMat = new THREE.MeshLambertMaterial({ color: look.accent });
    for (const y of [1.0, 1.3, 1.6]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.52), stripeMat);
      s.position.y = y;
      g.add(s);
    }
  } else if (look.shirtStyle === 'collar') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.53), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    c.position.y = 1.85;
    g.add(c);
  }

  /* kepala dengan ekspresi di keempat sisi horizontal */
  const face = faceMaterial(look.expression, look.skin);
  const headMats = [face, face, skinMat, skinMat, face, face];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), headMats);
  head.position.y = 2.5;
  g.add(head);

  /* rambut */
  if (look.hairStyle === 'short') {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.22, 0.76), hairMat);
    r.position.y = 2.9;
    g.add(r);
  } else if (look.hairStyle === 'long') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.22, 0.76), hairMat);
    top.position.y = 2.9;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.0, 0.14), hairMat);
    back.position.set(0, 2.3, -0.4);
    g.add(top, back);
  } else if (look.hairStyle === 'bun') {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.2, 0.74), hairMat);
    r.position.y = 2.9;
    const bun = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), hairMat);
    bun.position.set(0, 3.15, -0.1);
    g.add(r, bun);
  } else if (look.hairStyle === 'curly') {
    for (const [x, z] of [[-0.22, 0.2], [0.22, 0.2], [0, -0.22]]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), hairMat);
      k.position.set(x, 2.93, z);
      g.add(k);
    }
  }

  /* lengan (berayun) */
  const arms = [];
  for (const ax of [-0.6, 0.6]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(ax, 1.85, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), shirtMat);
    sleeve.position.y = -0.45;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.28), skinMat);
    hand.position.y = -0.95;
    shoulder.add(sleeve, hand);
    g.add(shoulder);
    arms.push(shoulder);
  }

  /* celana: panjang atau pendek (kaki kulit di bawah celana pendek) */
  const legs = [];
  for (const lx of [-0.22, 0.22]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 0.7, 0);
    if (look.pantStyle === 'shorts') {
      const short = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.42), pantMat);
      short.position.y = -0.12;
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.3), skinMat);
      shin.position.y = -0.47;
      hip.add(short, shin);
    } else {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.4), pantMat);
      leg.position.y = -0.35;
      hip.add(leg);
    }
    g.add(hip);
    legs.push(hip);
  }

  attachAccessory(g, look);
  if (look.accessory === 'bag') {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.3), new THREE.MeshLambertMaterial({ color: look.accColor }));
    bag.position.set(0.1, -1.2, 0);
    arms[1].add(bag);
  }

  g.traverse((o) => (o.castShadow = true));
  scene.add(g);
  const npc = { name, group: g, legs, arms, lines, walk, giver };
  npcs.push(npc);
  return npc;
}

function buildNPCs() {
  /* Pak Pos: pemberi misi, penampilan tetap, berdiri di trotoar blok (1,2) */
  buildNPC(
    'Pak Pos',
    {
      skin: 0xf1c27d, hairStyle: 'short', hair: 0x2b1d14,
      shirt: 0xe53935, shirtStyle: 'collar', accent: 0xffffff,
      pants: 0x1e3a8a, pantStyle: 'long',
      accessory: 'hat', accColor: 0x1e3a8a, expression: 'smile',
    },
    null,
    [],
    true,
  ).group.position.set(-35.8, WALK_TOP, 6);

  /* warga yang berjalan bolak-balik di trotoar, penampilan acak */
  const wanderers = [
    { i: 0, j: 0 },
    { i: 2, j: 1 },
    { i: 3, j: 3 },
    { i: 1, j: 3 },
    { i: 0, j: 2 },
  ];
  const WORDS = [
    ['Selamat pagi!', 'Cuacanya cerah hari ini, ya.'],
    ['Hati-hati menyeberang, jalannya ramai.', 'Mau ke taman?'],
    ['Lampu jalan di sini sering mati lho.', 'Semoga diperbaiki segera.'],
  ];
  wanderers.forEach((w, k) => {
    const a = GRID_LINES[w.i], b = GRID_LINES[w.i + 1];
    const d = GRID_LINES[w.j + 1];
    const X0 = a + (isRoad(a) ? ROAD_W / 2 : 0);
    const X1 = b - (isRoad(b) ? ROAD_W / 2 : 0);
    const Z1 = d - (isRoad(d) ? ROAD_W / 2 : 0);
    const cx = (X0 + X1) / 2;
    const amp = (X1 - X0) / 2 - 1.5;
    buildNPC('Warga', randomLook(), {
      cx,
      amp,
      z: Z1 - WALK_W / 2,
      speed: 0.6 + (k % 3) * 0.15,
      ph: k * 1.3,
    }, WORDS[k % WORDS.length]);
  });
}

function updateNPCs(t) {
  for (const npc of npcs) {
    if (!npc.walk) continue;
    const { cx, amp, z, speed, ph } = npc.walk;
    const s = t * speed + ph;
    npc.group.position.set(cx + Math.sin(s) * amp, WALK_TOP, z);
    npc.group.rotation.y = Math.cos(s) > 0 ? Math.PI / 2 : -Math.PI / 2;
    const swing = Math.sin(t * speed * 5 + ph) * 0.6;
    npc.legs[0].rotation.x = swing;
    npc.legs[1].rotation.x = -swing;
    npc.arms[0].rotation.x = -swing;
    npc.arms[1].rotation.x = swing;
  }
}

function showDialog(name, text) {
  dlgName.textContent = name;
  dlgText.textContent = text;
  dialogEl.classList.remove('hidden');
  clearTimeout(dlgTimer);
  dlgTimer = setTimeout(hideDialog, 6000);
}
function hideDialog() {
  dialogEl.classList.add('hidden');
  clearTimeout(dlgTimer);
}
dialogEl.addEventListener('pointerdown', hideDialog);

function updateMissionHud() {
  if (missionState === 0) hudMission.textContent = 'Misi: bicara dengan Pak Pos';
  else if (missionState === 1) hudMission.textContent = 'Misi: antar surat ke rumah nomor ' + MISSION_HOUSE_NO;
  else hudMission.textContent = 'Misi selesai ✔';
}

function resetMission() {
  missionState = 0;
  updateMissionHud();
  hideDialog();
}

function talkTo(npc) {
  if (npc.shop) {
    if (coinCount >= 2) {
      coinCount -= 2;
      updateHud();
      toast('-2 koin');
      showDialog(npc.name, 'Terima kasih! Ini jajanannya, selamat menikmati.');
    } else {
      showDialog(npc.name, 'Uangmu kurang, Kak. Jajan ini harganya 2 koin.');
    }
    return;
  }
  if (npc.giver) {
    if (missionState === 0) {
      missionState = 1;
      updateMissionHud();
      showDialog(npc.name, 'Halo! Tolong antar surat ini ke rumah nomor ' + MISSION_HOUSE_NO + ' ya. Nomornya ada di atas pintu.');
    } else if (missionState === 1) {
      showDialog(npc.name, 'Surat untuk rumah nomor ' + MISSION_HOUSE_NO + ' masih kamu bawa, kan? Cari nomornya di atas pintu.');
    } else {
      showDialog(npc.name, 'Terima kasih sudah membantu! Hati-hati di jalan.');
    }
    return;
  }
  const line = npc.lines[Math.floor(Math.random() * npc.lines.length)];
  showDialog(npc.name, line);
}

function completeMission() {
  missionState = 2;
  coinCount += 5;
  updateHud();
  updateMissionHud();
  sfx.win();
  showDialog('Pak Pos', 'Suratnya sudah sampai! Ini hadiah 5 koin untukmu.');
}

/* ---------------------------------------------------------------------
   Tahap 7: mobil berjalan (lalu lintas) di jalan
   Mobil visual saja: lewat di lajur, berputar (loop) di sepanjang jalan.
--------------------------------------------------------------------- */
const traffic = [];
const CAR_COLORS_TRAFFIC = [0xe53935, 0xfdd835, 0xffffff, 0x1e88e5, 0x8e24aa, 0x43a047, 0xff7043];
let lastTrafficT = 0;

function buildTraffic() {
  const MIN = GRID_LINES[0];
  const MAX = GRID_LINES[GRID_LINES.length - 1];
  const LEN = MAX - MIN;
  let seed = 21;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const LANE = 1.5; // jarak dari pusat jalan ke tengah lajur

  for (const road of ROAD_LINES) {
    for (const axis of ['z', 'x']) {
      for (const dir of [1, -1]) {
        for (let k = 0; k < 2; k++) {
          const color = CAR_COLORS_TRAFFIC[Math.floor(rnd() * CAR_COLORS_TRAFFIC.length)];
          buildCar(0, 0, color);
          const g = scene.children[scene.children.length - 1];
          traffic.push({
            g,
            axis,
            lane: road + (dir > 0 ? -LANE : LANE),
            dir,
            s: MIN + k * (LEN / 2) + rnd() * 30,
            speed: 6 + rnd() * 4,
          });
        }
      }
    }
  }
}

/* siklus lampu: sumbu Z (arah utara-selatan) & sumbu X bergantian */
const LIGHT_CYCLE = 10;
function lightState(axis, t) {
  const p = t % LIGHT_CYCLE;
  if (axis === 'z') return p < 4 ? 'G' : p < 5 ? 'Y' : 'R';
  return p < 5 ? 'R' : p < 9 ? 'G' : 'Y';
}

const CAR_HW = 1.0;   // setengah lebar mobil
const CAR_HL = 1.8;   // setengah panjang mobil
const STOP_DIST = 4.6; // jarak pusat mobil dari persimpangan saat berhenti
let hitCD = 0;
let knockT = 0;
let knockDir = { x: 0, z: 0 };

function updateTrafficSim(dt) {
  const MIN = GRID_LINES[0];
  const MAX = GRID_LINES[GRID_LINES.length - 1];
  const LEN = MAX - MIN;

  for (const c of traffic) {
    if (c.cur === undefined) c.cur = c.speed;

    /* jarak ke persimpangan terdekat di depan */
    let ahead = Infinity;
    for (const v of ROAD_LINES) {
      let a = (v - c.s) * c.dir;
      if (a < -STOP_DIST) a += LEN;
      if (a < ahead) ahead = a;
    }

    let target = c.speed;
    if (lightState(c.axis, time) === 'R' && ahead > STOP_DIST && ahead < 14) {
      target = Math.min(target, Math.max(0, (ahead - STOP_DIST - 0.4) * 2.5));
    }

    /* jaga jarak dengan mobil di depan di lajur yang sama */
    let gap = Infinity;
    for (const o of traffic) {
      if (o === c || o.axis !== c.axis || o.lane !== c.lane || o.dir !== c.dir) continue;
      let d = (o.s - c.s) * c.dir;
      if (d < 0) d += LEN;
      if (d < gap) gap = d;
    }
    if (gap < 8) target = Math.min(target, c.speed * Math.max(0, (gap - 4.5) / 3.5));

    /* ubah kecepatan perlahan (rem lebih cepat dari akselerasi) */
    const diff = target - c.cur;
    c.cur += Math.max(-12 * dt, Math.min(6 * dt, diff));

    c.s += c.dir * c.cur * dt;
    if (c.s > MAX) c.s -= LEN;
    if (c.s < MIN) c.s += LEN;

    if (c.axis === 'z') {
      c.g.position.set(c.lane, ROAD_TOP, c.s);
      c.g.rotation.y = c.dir > 0 ? 0 : Math.PI;
    } else {
      c.g.position.set(c.s, ROAD_TOP, c.lane);
      c.g.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
}

/* cari ketinggian aman untuk pemain di (x,z); null kalau terhalang dinding */
function clearanceAt(x, z, y) {
  let ny = y;
  for (const b of colliders) {
    if (!b.active) continue;
    if (x + PW <= b.minX || x - PW >= b.maxX || z + PW <= b.minZ || z - PW >= b.maxZ) continue;
    if (b.maxY <= y + 0.35) {
      ny = Math.max(ny, b.maxY); // anak tangga kecil (trotoar)
    } else if (y + PH > b.minY + 0.05) {
      return null;
    }
  }
  return ny;
}

/* mobil menabrak pemain: pemain terpental ke samping mobil, tidak ikut terdorong searah jalan */
function collideTraffic(dt) {
  const pos = player.pos;
  if (state !== 'play') return;

  if (knockT > 0) {
    knockT -= dt;
    const nx = pos.x + knockDir.x * 8 * dt;
    const nz = pos.z + knockDir.z * 8 * dt;
    const ny = clearanceAt(nx, nz, pos.y);
    if (ny === null) {
      knockT = 0;
    } else {
      pos.x = nx;
      pos.z = nz;
      pos.y = Math.max(pos.y, ny);
    }
  }

  if (hitCD > 0) {
    hitCD -= dt;
    return;
  }
  if (pos.y > 1.05 || pos.y + PH < ROAD_TOP) return;

  for (const c of traffic) {
    const cx = c.axis === 'z' ? c.lane : c.s;
    const cz = c.axis === 'z' ? c.s : c.lane;
    const hx = c.axis === 'z' ? CAR_HW : CAR_HL;
    const hz = c.axis === 'z' ? CAR_HL : CAR_HW;
    if (Math.abs(pos.x - cx) < hx + PW && Math.abs(pos.z - cz) < hz + PW) {
      /* arah terpental: tegak lurus dari jalur mobil */
      if (c.axis === 'z') {
        const side = pos.x >= cx ? 1 : -1;
        knockDir = { x: side, z: 0 };
      } else {
        const side = pos.z >= cz ? 1 : -1;
        knockDir = { x: 0, z: side };
      }
      /* kalau arah itu terhalang, coba arah sebaliknya */
      if (clearanceAt(pos.x + knockDir.x * 0.6, pos.z + knockDir.z * 0.6, pos.y) === null) {
        knockDir = { x: -knockDir.x, z: -knockDir.z };
      }
      knockT = 0.5;
      hitCD = 0.9;
      player.vel.y = 4.5;
      player.grounded = false;
      player.ground = null;
      sfx.bounce();
      toast('Tertabrak mobil!');
      break;
    }
  }
}

/* ---------------------------------------------------------------------
   Tahap 8: lampu lalu lintas & pedagang kaki lima
--------------------------------------------------------------------- */
const signalHeads = [];
const LAMP_COLORS = { R: 0xff3b3b, Y: 0xffd23f, G: 0x3ddc84 };

function buildSignal(px, pz) {
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), POLE_MAT);
  pole.position.set(px, WALK_TOP + 1.7, pz);
  pole.castShadow = true;
  scene.add(pole);
  for (const axis of ['z', 'x']) {
    const g = new THREE.Group();
    g.position.set(px, WALK_TOP + 3.5, pz);
    g.rotation.y = axis === 'z' ? 0 : Math.PI / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.25, 0.3), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    g.add(box);
    const lamps = [];
    ['R', 'Y', 'G'].forEach((k, i) => {
      const mat = new THREE.MeshLambertMaterial({ color: LAMP_COLORS[k] });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.05), mat);
      lamp.position.set(0, 0.4 - i * 0.4, 0.17);
      g.add(lamp);
      lamps.push({ key: k, mat });
    });
    scene.add(g);
    signalHeads.push({ axis, lamps });
  }
}

function buildSignals() {
  for (const vx of ROAD_LINES) {
    for (const vz of ROAD_LINES) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          buildSignal(vx + sx * 4, vz + sz * 4);
        }
      }
    }
  }
}

function updateSignals() {
  for (const head of signalHeads) {
    const st = lightState(head.axis, time);
    for (const lamp of head.lamps) {
      const on = lamp.key === st;
      lamp.mat.color.setHex(on ? LAMP_COLORS[lamp.key] : 0x333333);
      lamp.mat.emissive.setHex(on ? LAMP_COLORS[lamp.key] : 0x000000);
    }
  }
}

/* warung kaki lima: meja + atap bergaris + penjual di belakang meja */
function buildStall(cx, cz, name) {
  const sx = cx, sz = cz;
  addPart(sx, 0.55, sz, 2.4, 1.1, 1.2, 0xa1887f); // meja (bisa ditabrak)
  for (const [px, pz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) {
    deco(0.12, 2.4, 0.12, new THREE.MeshLambertMaterial({ color: 0x5d4037 }), sx + px, 1.2, sz + pz);
  }
  const stripes = [0xe53935, 0xffffff, 0xe53935];
  stripes.forEach((col, i) => {
    deco(0.93, 0.12, 1.8, new THREE.MeshLambertMaterial({ color: col }), sx - 0.93 + i * 0.93, 2.45, sz);
  });
  deco(0.45, 0.35, 0.45, new THREE.MeshLambertMaterial({ color: 0xffb300 }), sx - 0.6, 1.3, sz);
  deco(0.45, 0.35, 0.45, new THREE.MeshLambertMaterial({ color: 0x43a047 }), sx + 0.5, 1.3, sz);

  const vendor = buildNPC(name, randomLook(), null, ['Mau jajan? Murah kok!'], false);
  vendor.shop = true;
  vendor.group.position.set(sx, 0, sz + 1.2);
  vendor.group.rotation.y = Math.PI;
}

function buildStalls() {
  /* tiga warung di tengah blok-blok taman */
  const spots = [[1, 2, 'Bu Warung'], [2, 1, 'Pak Kopi'], [3, 3, 'Mbak Roti']];
  for (const [i, j, name] of spots) {
    const a = GRID_LINES[i], b = GRID_LINES[i + 1];
    const c = GRID_LINES[j], d = GRID_LINES[j + 1];
    const IX0 = a + (isRoad(a) ? ROAD_W / 2 : 0) + WALK_W;
    const IX1 = b - (isRoad(b) ? ROAD_W / 2 : 0) - WALK_W;
    const IZ0 = c + (isRoad(c) ? ROAD_W / 2 : 0) + WALK_W;
    const IZ1 = d - (isRoad(d) ? ROAD_W / 2 : 0) - WALK_W;
    const cx = (IX0 + IX1) / 2;
    const cz = (IZ0 + IZ1) / 2;
    buildStall(cx + 8, cz - 7, name);
  }
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
buildRoads();
buildHouses();
buildDecor();
buildInterior();
buildNPCs();
buildTraffic();
buildSignals();
buildStalls();

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
  resetMission();
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
  checkInteract();
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
  updateTrafficSim(dt);
  updateSignals();
  collideTraffic(dt);

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
