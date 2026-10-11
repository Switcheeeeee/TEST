// Monde 3D isométrique de la vidéo moto (Three.js, caméra orthographique).
// Tout l'état (caméra, moto, lumières, apparitions) est une fonction pure du
// temps HyperFrames : renderAt(t) peut être appelé dans n'importe quel ordre.
import * as THREE from "three";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";

const W = 1080;
const H = 1920;
const ASPECT = W / H;
const VIEW_H = 64; // unités monde visibles en hauteur au zoom 1

const COL = {
  navy: 0x061a47,
  navy2: 0x0d2766,
  brand: 0x0d52d9,
  brandDeep: 0x0a3aa6,
  field: 0x3b74f0,
  field2: 0x3469e2,
  asphalt: 0x12306f,
  paint: 0xf2f6ff,
  tree: 0x1d52c9,
  treeLight: 0x5b8cf7,
  trunk: 0x0f2e7a,
  signal: 0xff5b3a,
  white: 0xffffff,
  tyre: 0x0a1f4d,
  sky: 0x8fb3ff,
  metal: 0xc9d6f2,
  engine: 0x23345f,
  glass: 0x1a3a86,
};

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const EASE = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  quartOut: (t) => 1 - Math.pow(1 - t, 4),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  backOut: (t) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

// Pistes d'images clés : [[temps, valeur, ease], ...] ; l'ease s'applique au
// segment qui se termine sur la clé.
function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const p = EASE[e || "inOut"]((t - t0) / Math.max(1e-6, t1 - t0));
        return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], p)) : lerp(v0, v1, p);
      }
    }
    return keys[keys.length - 1][1];
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map();
function lambert(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}

function mesh(geo, material, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Membre (capsule) tendu entre deux points.
function limb(a, b, r, material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r), 4, 10), material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function extrude(points, depth, bevel = 0.025) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ------------------------------------------------------------------ */
/* Géographie                                                          */
/* ------------------------------------------------------------------ */

const ISLAND = { x0: -16, x1: 16, z0: -12.5, z1: 12.5, r: 3 };
const PLATEAU = { x0: -9, x1: 14, z0: -10, z1: 10, r: 3.2 };
const LOOP = { x0: -7.5, x1: 12.5, z0: -8.3, z1: 8.3, r: 3.6, startX: -2 };
const FENCE = { x0: -9.7, x1: 14.7, z0: -10.7, z1: 10.7 };
const GATE = { x0: -6.2, x1: -1.8, z: 10.7 };
const CITY = { x0: -13, x1: 5, z0: 15.6, z1: 29, r: 2.4 };
const LANES = { slalom: 4, brake: -0.5, evit: -5 };
const SLALOM_CONES = [-4, -1, 2, 5, 8];
const STOP_X = -1;
const OBSTACLE_X = 1.8;

/* ------------------------------------------------------------------ */
/* Trajectoires de la moto                                             */
/* ------------------------------------------------------------------ */

class Path {
  constructor(pts) {
    const n = pts.length;
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.s = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = pts[i][0];
      this.z[i] = pts[i][1];
      if (i > 0) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.length = this.s[n - 1];
  }
  pos(s) {
    s = clamp(s, 0, this.length);
    let lo = 0;
    let hi = this.s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid] <= s) lo = mid;
      else hi = mid;
    }
    const seg = this.s[hi] - this.s[lo] || 1;
    const f = (s - this.s[lo]) / seg;
    return [lerp(this.x[lo], this.x[hi], f), lerp(this.z[lo], this.z[hi], f)];
  }
  angle(s) {
    const d = 0.12;
    const a = this.pos(s - d);
    const b = this.pos(s + d);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  sample(s) {
    const [x, z] = this.pos(s);
    const th = this.angle(s);
    const d = 0.35;
    let dth = this.angle(s + d) - this.angle(s - d);
    if (dth > Math.PI) dth -= 2 * Math.PI;
    if (dth < -Math.PI) dth += 2 * Math.PI;
    return { x, z, th, kappa: dth / (2 * d) };
  }
}

function loopPoints({ x0, x1, z0, z1, r, startX }, step = 0.04) {
  const pts = [];
  const line = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i < n; i++) pts.push([lerp(ax, bx, i / n), lerp(az, bz, i / n)]);
  };
  const arc = (cx, cz, a0, a1) => {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i < n; i++) {
      const a = lerp(a0, a1, i / n);
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  const D = Math.PI / 180;
  line(startX, z1, x1 - r, z1);
  arc(x1 - r, z1 - r, 90 * D, 0);
  line(x1, z1 - r, x1, z0 + r);
  arc(x1 - r, z0 + r, 0, -90 * D);
  line(x1 - r, z0, x0 + r, z0);
  arc(x0 + r, z0 + r, -90 * D, -180 * D);
  line(x0, z0 + r, x0, z1 - r);
  arc(x0 + r, z1 - r, -180 * D, -270 * D);
  line(x0 + r, z1, startX, z1);
  pts.push([startX, z1]);
  return pts;
}

function lanePoints(xa, xb, zfn, step = 0.04) {
  const pts = [];
  const n = Math.ceil(Math.abs(xb - xa) / step);
  for (let i = 0; i <= n; i++) {
    const x = lerp(xa, xb, i / n);
    pts.push([x, zfn(x)]);
  }
  return pts;
}

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const PATHS = {
  loop: new Path(loopPoints(LOOP)),
  slalom: new Path(
    lanePoints(-8.5, 13, (x) => {
      const env = smoothstep(-7.4, -5.2, x) * (1 - smoothstep(8.8, 11, x));
      return LANES.slalom + 1.05 * env * Math.cos((Math.PI * (x - SLALOM_CONES[0])) / 3);
    }),
  ),
  brake: new Path(lanePoints(15, -6, () => LANES.brake)),
  evit: new Path(
    lanePoints(-9, 13.5, (x) => {
      const up = smoothstep(OBSTACLE_X - 4, OBSTACLE_X - 1.2, x);
      const down = smoothstep(OBSTACLE_X + 1.2, OBSTACLE_X + 4, x);
      return LANES.evit + 1.9 * (up - down);
    }),
  ),
};

// Trajectoire de sortie : arrivée par le couloir intérieur, virage, portail, pont, ville.
(() => {
  const pts = [];
  const step = 0.04;
  const push = (x, z) => pts.push([x, z]);
  // ligne droite vers -x sur z = 2.2
  for (let x = 6; x > -1; x -= step) push(x, 2.2);
  // virage à gauche vers +z (centre -1, 5.2, rayon 3)
  const cx = -1;
  const cz = 5.2;
  const r = 3;
  for (let a = -Math.PI / 2; a > -Math.PI; a -= step / r) push(cx + r * Math.cos(a), cz + r * Math.sin(a));
  // tout droit vers le portail, le pont et la ville
  for (let z = 5.2; z < 26; z += step) push(-4, z);
  PATHS.exit = new Path(pts);
})();

// Profil de vitesse : v0 puis phases [durée, vitesse visée] à accélération constante.
function profile(v0, phases) {
  return (tau) => {
    let s = 0;
    let v = v0;
    let rest = Math.max(0, tau);
    for (const [dur, v1] of phases) {
      if (rest <= dur) {
        const a = (v1 - v) / dur;
        return { s: s + v * rest + 0.5 * a * rest * rest, v: v + a * rest, a };
      }
      s += ((v + v1) / 2) * dur;
      v = v1;
      rest -= dur;
    }
    return { s: s + v * rest, v, a: 0 };
  };
}

const BRAKE_PROFILE = profile(5, [
  [0.95, 12.5],
  [0.85, 0],
  [5, 0],
]);
const BRAKE_ACCEL_DIST = BRAKE_PROFILE(0.95).s;
const BRAKE_TOTAL_DIST = BRAKE_PROFILE(1.8).s;
const BRAKE_S0 = 15 - (STOP_X + 0.95) - BRAKE_TOTAL_DIST;
const BRAKE_START_X = 15 - (BRAKE_S0 + BRAKE_ACCEL_DIST);

const HERO_PROFILE = profile(7, [
  [2.6, 7],
  [1.4, 0],
  [10, 0],
]);
const HERO_S0 = PATHS.loop.length - HERO_PROFILE(4.0).s;

const MOTO_SEGMENTS = [
  { start: 0, path: "loop", s0: 0, prof: profile(0, [[1.9, 0], [1.25, 7.5]]) },
  { start: 8, path: "slalom", s0: 1.9, prof: profile(6.4, []) },
  { start: 10, path: "brake", s0: BRAKE_S0, prof: BRAKE_PROFILE },
  { start: 12, path: "evit", s0: 0.6, prof: profile(8.2, []) },
  { start: 14, path: "loop", s0: 30, prof: profile(6, []) },
  { start: 16, path: "exit", s0: 6.6, prof: profile(6.5, [[1.0, 10.5]]) },
  { start: 18, path: "loop", s0: 12, prof: profile(7, []) },
  { start: 26, path: "loop", s0: HERO_S0, prof: HERO_PROFILE },
];

// Instant où la moto passe à l'abscisse x pendant un segment (balayage déterministe).
function timeAtX(t0, t1, x, dir = 1) {
  for (let t = t0; t <= t1; t += 1 / 240) if ((motoAt(t).x - x) * dir >= 0) return t;
  return t1;
}

function motoAt(t) {
  let seg = MOTO_SEGMENTS[0];
  for (const s of MOTO_SEGMENTS) if (t >= s.start) seg = s;
  const tau = t - seg.start;
  const path = PATHS[seg.path];
  const pr = seg.prof(tau);
  let s = seg.s0 + pr.s;
  if (seg.path === "loop") s = ((s % path.length) + path.length) % path.length;
  const smp = path.sample(s);
  return { ...smp, v: pr.v, a: pr.a, s, seg: seg.path, tau, pathRef: path };
}

const PASS_TIMES = {
  slalom: SLALOM_CONES.map((x) => timeAtX(8, 10.5, x)),
  obstacle: timeAtX(12, 14, OBSTACLE_X),
};

/* ------------------------------------------------------------------ */
/* Moteur de rendu                                                     */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById("world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(
  (-VIEW_H * ASPECT) / 2,
  (VIEW_H * ASPECT) / 2,
  VIEW_H / 2,
  -VIEW_H / 2,
  1,
  900,
);

const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x0a1f4d, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x6d9bff, 0.0);
scene.add(rim, rim.target);

const props = []; // objets qui surgissent du sol au moment du reveal
const POP_ORIGIN = [LOOP.startX, LOOP.z1];
function addProp(obj, { delay = 0, mode = "xyz" } = {}) {
  const d = Math.hypot(obj.position.x - POP_ORIGIN[0], obj.position.z - POP_ORIGIN[1]);
  props.push({ obj, t0: 2.12 + d * 0.034 + delay, mode, base: obj.scale.clone() });
  return obj;
}

/* --------------------------- Îles --------------------------------- */

function islandSlab(w, d, r, h, y, color, receive = true) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2 - 0.001, w / 2, d / 2)), lambert(color), {
    cast: false,
    receive,
  });
  m.position.y = y;
  return m;
}

const cityGroup = new THREE.Group();
scene.add(cityGroup);

function buildIsland(b, seed, parent = scene) {
  const g = new THREE.Group();
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  g.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  // dessus herbeux puis couches de « roche » en escalier
  const top = mesh(new RoundedBoxGeometry(w, 0.8, d, 4, 0.38), lambert(COL.field), { cast: false, receive: true });
  top.position.y = -0.4;
  g.add(top);
  const layers = [
    [0.5, 1.6, COL.brandDeep],
    [2.2, 1.8, COL.navy2],
    [4.6, 1.8, 0x0a1f57],
    [7.4, 1.6, 0x071743],
  ];
  let y = -0.8;
  for (const [inset, h, color] of layers) {
    const slab = islandSlab(w - inset * 2, d - inset * 2, b.r, h, y - h / 2, color, false);
    g.add(slab);
    y -= h;
  }
  // quelques blocs de roche suspendus sous l'île
  const rnd = mulberry32(seed);
  for (let i = 0; i < 7; i++) {
    const s = 0.8 + rnd() * 1.6;
    const rock = mesh(new THREE.DodecahedronGeometry(s, 0), lambert(i % 2 ? 0x0a1f57 : COL.navy2, { flatShading: true }), {
      cast: false,
    });
    rock.position.set((rnd() - 0.5) * (w - 12), y - 0.4 - rnd() * 1.4, (rnd() - 0.5) * (d - 12));
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(rock);
  }
  parent.add(g);
  return g;
}

buildIsland(ISLAND, 7);
buildIsland(CITY, 21, cityGroup);

// Pont entre la piste et la ville
{
  const bridge = new THREE.Group();
  const deck = mesh(new THREE.BoxGeometry(3.4, 0.5, CITY.z0 - ISLAND.z1 + 1.2), lambert(COL.brandDeep), {
    cast: true,
    receive: true,
  });
  deck.position.set(-4, -0.3, (CITY.z0 + ISLAND.z1) / 2);
  const road = mesh(new THREE.BoxGeometry(3, 0.06, CITY.z0 - ISLAND.z1 + 1.2), lambert(COL.asphalt), {
    cast: false,
    receive: true,
  });
  road.position.set(-4, -0.02, (CITY.z0 + ISLAND.z1) / 2);
  bridge.add(deck, road);
  for (const side of [-1.55, 1.55]) {
    const rail = mesh(new THREE.BoxGeometry(0.12, 0.12, CITY.z0 - ISLAND.z1 + 1.2), lambert(COL.paint));
    rail.position.set(-4 + side, 0.55, (CITY.z0 + ISLAND.z1) / 2);
    bridge.add(rail);
    for (let k = 0; k < 4; k++) {
      const post = mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), lambert(COL.paint));
      post.position.set(-4 + side, 0.27, ISLAND.z1 - 0.3 + k * 1.3);
      bridge.add(post);
    }
  }
  scene.add(bridge);
}

/* --------------------------- Piste -------------------------------- */

const fontsReady = Promise.all([
  document.fonts.load('italic 900 120px "Barlow Condensed"'),
  document.fonts.load('italic 800 120px "Barlow Condensed"'),
  document.fonts.load('700 60px "Geist Mono"'),
]).catch(() => null);

function paintPlateau() {
  const PX = 110;
  const P = PLATEAU;
  const cw = Math.round((P.x1 - P.x0) * PX);
  const ch = Math.round((P.z1 - P.z0) * PX);
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext("2d");
  const X = (x) => (x - P.x0) * PX;
  const Z = (z) => (z - P.z0) * PX;
  const U = (u) => u * PX;

  g.fillStyle = "#12306f";
  g.fillRect(0, 0, cw, ch);
  // grain de l'enrobé
  const rnd = mulberry32(42);
  for (let i = 0; i < 26000; i++) {
    const a = rnd();
    g.fillStyle = a < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(3,10,40,0.08)";
    const s = 2 + rnd() * 5;
    g.fillRect(rnd() * cw, rnd() * ch, s, s);
  }
  const paint = (alpha = 0.95) => `rgba(242,246,255,${alpha})`;

  // bordure du plateau
  g.strokeStyle = paint(0.9);
  g.lineWidth = U(0.16);
  roundRectPath(g, U(0.35), U(0.35), cw - U(0.7), ch - U(0.7), U(P.r - 0.35));
  g.stroke();

  // circuit : bords de voie
  g.lineWidth = U(0.11);
  g.strokeStyle = paint(0.85);
  for (const off of [-1.3, 1.3]) {
    const L = LOOP;
    roundRectPath(g, X(L.x0 - off), Z(L.z0 - off), U(L.x1 - L.x0 + 2 * off), U(L.z1 - L.z0 + 2 * off), U(L.r + off));
    g.stroke();
  }
  // ligne de départ en damier
  const cs = 0.325;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? "#0a1f4d" : paint(1);
      g.fillRect(X(LOOP.startX - 0.33 + j * cs), Z(LOOP.z1 - 1.3 + i * cs), U(cs), U(cs));
    }
  }

  // couloirs d'exercices
  const laneEdges = (z, xa, xb, dashed) => {
    g.lineWidth = U(0.09);
    g.strokeStyle = paint(0.7);
    g.setLineDash(dashed ? [U(0.7), U(0.5)] : []);
    for (const off of [-1.7, 1.7]) {
      g.beginPath();
      g.moveTo(X(xa), Z(z + off));
      g.lineTo(X(xb), Z(z + off));
      g.stroke();
    }
    g.setLineDash([]);
  };
  laneEdges(LANES.slalom, -6.2, 11.2, true);
  laneEdges(LANES.brake, -6.2, 11.2, false);
  laneEdges(LANES.evit, -6.2, 11.2, true);

  // emplacements des cônes de slalom
  g.strokeStyle = paint(0.85);
  g.lineWidth = U(0.07);
  for (const x of SLALOM_CONES) {
    g.beginPath();
    g.arc(X(x), Z(LANES.slalom), U(0.48), 0, Math.PI * 2);
    g.stroke();
  }
  // zone de freinage : chevrons + ligne d'arrêt
  g.fillStyle = paint(0.55);
  for (let k = 0; k < 5; k++) {
    const x = STOP_X + 1.2 + k * 1.15;
    g.beginPath();
    g.moveTo(X(x), Z(LANES.brake - 1.2));
    g.lineTo(X(x - 0.55), Z(LANES.brake));
    g.lineTo(X(x), Z(LANES.brake + 1.2));
    g.lineTo(X(x + 0.3), Z(LANES.brake + 1.2));
    g.lineTo(X(x - 0.25), Z(LANES.brake));
    g.lineTo(X(x + 0.3), Z(LANES.brake - 1.2));
    g.closePath();
    g.fill();
  }
  g.fillStyle = paint(1);
  g.fillRect(X(STOP_X - 0.32), Z(LANES.brake - 1.7), U(0.32), U(3.4));
  // zone d'évitement : rectangle pointillé + flèche
  g.setLineDash([U(0.35), U(0.25)]);
  g.strokeStyle = "rgba(255,91,58,0.9)";
  g.lineWidth = U(0.1);
  g.strokeRect(X(OBSTACLE_X - 0.9), Z(LANES.evit - 0.9), U(1.8), U(1.8));
  g.setLineDash([]);
  g.strokeStyle = paint(0.75);
  g.lineWidth = U(0.13);
  g.beginPath();
  g.moveTo(X(OBSTACLE_X - 4.4), Z(LANES.evit));
  g.bezierCurveTo(X(OBSTACLE_X - 2), Z(LANES.evit), X(OBSTACLE_X - 2.2), Z(LANES.evit + 1.9), X(OBSTACLE_X), Z(LANES.evit + 1.9));
  g.stroke();

  // libellés peints au sol
  g.fillStyle = paint(0.72);
  g.textBaseline = "middle";
  const label = (txt, x, z, size) => {
    g.font = `italic 900 ${U(size)}px "Barlow Condensed"`;
    g.fillText(txt, X(x), Z(z));
  };
  label("01 SLALOM", -6, LANES.slalom - 2.35, 0.95);
  label("02 FREINAGE", 4.6, LANES.brake - 2.35, 0.95);
  label("03 ÉVITEMENT", -6, LANES.evit + 2.3, 0.95);
  g.font = `italic 900 ${U(1.25)}px "Barlow Condensed"`;
  g.fillStyle = "rgba(255,91,58,0.95)";
  g.fillText("PISTE PRIVÉE", X(1.2), Z(LOOP.z0 + 1.95));

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function signTexture(lines, { w = 1024, h = 256, bg = "#ff5b3a", fg = "#061a47", border = null, font = 900 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = h * 0.06;
    g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  }
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const n = lines.length;
  lines.forEach((ln, i) => {
    const size = ln.size || (h * 0.72) / n;
    g.font = `${ln.mono ? "700" : `italic ${font}`} ${size}px ${ln.mono ? '"Geist Mono"' : '"Barlow Condensed"'}`;
    if (ln.color) g.fillStyle = ln.color;
    g.fillText(ln.text, w / 2, (h * (i + 0.5)) / n + (ln.dy || 0));
    g.fillStyle = fg;
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

let plateauMesh;
let gateSign;

function buildPlateau() {
  const P = PLATEAU;
  const w = P.x1 - P.x0;
  const d = P.z1 - P.z0;
  const base = mesh(new RoundedBoxGeometry(w, 0.16, d, 3, 0.07), lambert(0x0d2766), { cast: false, receive: true });
  base.position.set((P.x0 + P.x1) / 2, 0.0, (P.z0 + P.z1) / 2);
  scene.add(base);
  const shape = new THREE.Shape();
  const r = P.r;
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0);
  shape.lineTo(w / 2, d / 2 - r);
  shape.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5);
  const geo = new THREE.ShapeGeometry(shape, 24);
  // UV : x → u, y (shape) → v ; la forme est dans le plan XY puis couchée
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + w / 2) / w;
    uv[i * 2 + 1] = (pos.getY(i) + d / 2) / d;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  plateauMesh = mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), { cast: false, receive: true });
  plateauMesh.rotation.x = -Math.PI / 2;
  plateauMesh.position.set((P.x0 + P.x1) / 2, 0.085, (P.z0 + P.z1) / 2);
  scene.add(plateauMesh);
  // route du portail jusqu'au pont
  const road = mesh(new THREE.BoxGeometry(3, 0.1, ISLAND.z1 - P.z1 + 0.4), lambert(COL.asphalt), {
    cast: false,
    receive: true,
  });
  road.position.set(-4, 0.03, (ISLAND.z1 + P.z1) / 2);
  scene.add(road);
}

/* --------------------------- Décor -------------------------------- */

function cone(x, z, { s = 1 } = {}) {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.62), lambert(COL.signal));
  base.position.y = 0.03;
  const body = mesh(new THREE.ConeGeometry(0.27, 0.8, 18), lambert(COL.signal));
  body.position.y = 0.44;
  const band = mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.13, 18), lambert(COL.white), { cast: false });
  band.position.y = 0.5;
  g.add(base, body, band);
  g.position.set(x, 0.09, z);
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}

function tree(x, z, { s = 1, kind = 0 } = {}) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.9, 7), lambert(COL.trunk));
  trunk.position.y = 0.45;
  g.add(trunk);
  if (kind === 0) {
    const a = mesh(new THREE.IcosahedronGeometry(0.85, 0), lambert(COL.tree, { flatShading: true }));
    a.position.y = 1.45;
    const b = mesh(new THREE.IcosahedronGeometry(0.55, 0), lambert(COL.treeLight, { flatShading: true }));
    b.position.set(0.35, 1.9, 0.25);
    g.add(a, b);
  } else {
    const a = mesh(new THREE.ConeGeometry(0.85, 1.5, 7), lambert(COL.tree, { flatShading: true }));
    a.position.y = 1.4;
    const b = mesh(new THREE.ConeGeometry(0.62, 1.1, 7), lambert(COL.treeLight, { flatShading: true }));
    b.position.y = 2.15;
    g.add(a, b);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}

const floodHeads = [];
function floodMast(x, z, bank) {
  const faceAngle = Math.atan2(-(0 - z), 2.5 - x);
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.4, 8), lambert(COL.metal));
  pole.position.y = 2.7;
  const head = new THREE.Group();
  head.position.y = 5.4;
  head.rotation.y = faceAngle;
  const frame = mesh(new THREE.BoxGeometry(0.25, 0.7, 1.3), lambert(COL.navy2));
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a3a66, emissive: 0xfff4d6, emissiveIntensity: 0 });
  head.add(frame);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const lamp = mesh(new THREE.BoxGeometry(0.06, 0.28, 0.5), lampMat, { cast: false });
      lamp.position.set(0.15, -0.16 + i * 0.32, -0.3 + j * 0.6);
      head.add(lamp);
    }
  g.add(pole, head);
  g.position.set(x, 0, z);
  scene.add(g);
  floodHeads.push({ mat: lampMat, bank });
  return g;
}

function buildFence() {
  const postMat = lambert(0xdbe8ff);
  const railMat = lambert(0xdbe8ff);
  const F = FENCE;
  const corners = [
    [F.x0 + 1.4, F.z1],
    [F.x1 - 1.4, F.z1],
    [F.x1, F.z1 - 1.4],
    [F.x1, F.z0 + 1.4],
    [F.x1 - 1.4, F.z0],
    [F.x0 + 1.4, F.z0],
    [F.x0, F.z0 + 1.4],
    [F.x0, F.z1 - 1.4],
  ];
  const segs = [];
  for (let i = 0; i < corners.length; i++) segs.push([corners[i], corners[(i + 1) % corners.length]]);
  // le côté avant est coupé par le portail
  const front = segs.shift();
  segs.unshift([front[0], [GATE.x0 - 0.2, F.z1]], [[GATE.x1 + 0.2, F.z1], front[1]]);
  for (const [[ax, az], [bx, bz]] of segs) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2));
    const ang = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k <= n; k++) {
      const post = mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), postMat);
      post.position.set(lerp(ax, bx, k / n), 0.5, lerp(az, bz, k / n));
      scene.add(post);
      addProp(post, { mode: "y", delay: 0.12 });
    }
    for (const h of [0.45, 0.85]) {
      const rail = mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
      rail.position.set((ax + bx) / 2, h, (az + bz) / 2);
      rail.rotation.y = ang;
      scene.add(rail);
      addProp(rail, { mode: "x", delay: 0.22 });
    }
  }
}

function banner(x, z, rotY, tex, w = 3.4) {
  const g = new THREE.Group();
  const board = mesh(new THREE.BoxGeometry(w, 0.62, 0.06), [
    lambert(COL.navy2),
    lambert(COL.navy2),
    lambert(COL.navy2),
    lambert(COL.navy2),
    new THREE.MeshLambertMaterial({ map: tex }),
    lambert(COL.navy2),
  ]);
  board.position.y = 0.62;
  g.add(board);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

const gatePanels = { left: null, right: null };
function buildGate() {
  const pillarMat = lambert(COL.white);
  const z = GATE.z;
  for (const x of [GATE.x0 - 0.25, GATE.x1 + 0.25]) {
    const p = mesh(new RoundedBoxGeometry(0.42, 3.2, 0.42, 2, 0.06), pillarMat);
    p.position.set(x, 1.6, z);
    scene.add(p);
    addProp(p, { mode: "y" });
  }
  // fronton « PISTE PRIVÉE »
  const tex = signTexture([{ text: "PISTE PRIVÉE" }], { w: 1400, h: 300, bg: "#ff5b3a", fg: "#061a47" });
  const signW = GATE.x1 - GATE.x0 + 1.2;
  const backTex = signTexture([{ text: "BONNE ROUTE !" }], { w: 1400, h: 300, bg: "#0d52d9", fg: "#ffffff" });
  gateSign = mesh(new THREE.BoxGeometry(signW, 0.95, 0.18), [
    lambert(COL.navy2),
    lambert(COL.navy2),
    lambert(COL.navy2),
    lambert(COL.navy2),
    new THREE.MeshLambertMaterial({ map: tex }),
    new THREE.MeshLambertMaterial({ map: backTex }),
  ]);
  gateSign.position.set((GATE.x0 + GATE.x1) / 2, 3.05, z + 0.02);
  scene.add(gateSign);
  addProp(gateSign, { delay: 0.3 });
  // battants
  const panelLen = (GATE.x1 - GATE.x0) / 2;
  const mk = (dir) => {
    const pivot = new THREE.Group();
    const bars = new THREE.Group();
    const frameMat = lambert(COL.white);
    const top = mesh(new THREE.BoxGeometry(panelLen, 0.1, 0.1), frameMat);
    top.position.set((dir * panelLen) / 2, 1.25, 0);
    const bottom = mesh(new THREE.BoxGeometry(panelLen, 0.1, 0.1), frameMat);
    bottom.position.set((dir * panelLen) / 2, 0.22, 0);
    bars.add(top, bottom);
    for (let k = 0; k <= 6; k++) {
      const b = mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), lambert(k % 3 === 0 ? COL.signal : COL.white));
      b.position.set(dir * (0.08 + (k * (panelLen - 0.16)) / 6), 0.74, 0);
      bars.add(b);
    }
    const plate = mesh(new THREE.BoxGeometry(0.9, 0.42, 0.04), lambert(COL.signal));
    plate.position.set(dir * panelLen * 0.55, 0.74, 0.05);
    bars.add(plate);
    pivot.add(bars);
    scene.add(pivot);
    return pivot;
  };
  gatePanels.left = mk(1);
  addProp(gatePanels.left, { mode: "y", delay: 0.2 });
  gatePanels.left.position.set(GATE.x0, 0.05, z);
  gatePanels.right = mk(-1);
  addProp(gatePanels.right, { mode: "y", delay: 0.2 });
  gatePanels.right.position.set(GATE.x1, 0.05, z);
}

function windowsTexture(cols, rows, { bg = "#f2f6ff", win = "#1a3a86", lit = "#8fb3ff" } = {}) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  const cw = 256 / cols;
  const ch = 256 / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      g.fillStyle = (i * 7 + j * 3) % 5 === 0 ? lit : win;
      g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.25, cw * 0.56, ch * 0.5);
    }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function building(x, z, w, h, d, { roof = COL.brand, cols = 3, rows = 3, popDelay = 0, parent = scene } = {}) {
  const g = new THREE.Group();
  const tex = windowsTexture(cols, rows);
  const wallMat = new THREE.MeshLambertMaterial({ map: tex });
  const body = mesh(new THREE.BoxGeometry(w, h, d), [wallMat, wallMat, lambert(COL.paint), lambert(COL.paint), wallMat, wallMat], {
    cast: true,
    receive: true,
  });
  body.position.y = h / 2;
  const top = mesh(new THREE.BoxGeometry(w + 0.25, 0.25, d + 0.25), lambert(roof));
  top.position.y = h + 0.12;
  g.add(body, top);
  g.position.set(x, 0, z);
  parent.add(g);
  addProp(g, { mode: "y", delay: popDelay });
  return g;
}

/* --------------------------- Moto --------------------------------- */

function buildMoto({ rider = true, body = COL.white, frame = COL.brand, jacket = COL.signal } = {}) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const pitch = new THREE.Group();
  root.add(lean);
  lean.add(pitch);
  const M = (c, o) => lambert(c, o);
  const put = (m, x, y, z, rx = 0, ry = 0, rz = 0, parent = pitch) => {
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  const wheels = [];
  for (const wx of [0.74, -0.7]) {
    const w = new THREE.Group();
    w.position.set(wx, 0.355, 0);
    w.add(mesh(new THREE.TorusGeometry(0.27, 0.088, 10, 30), M(COL.tyre)));
    const rimM = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 22), M(COL.metal));
    rimM.rotation.x = Math.PI / 2;
    w.add(rimM);
    for (let k = 0; k < 3; k++) {
      const sp = mesh(new THREE.BoxGeometry(0.37, 0.04, 0.095), M(frame));
      sp.rotation.z = (k * Math.PI) / 3;
      w.add(sp);
    }
    const hub = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 10), M(COL.navy2));
    hub.rotation.x = Math.PI / 2;
    w.add(hub);
    pitch.add(w);
    wheels.push(w);
  }
  // fourche
  for (const zz of [-0.11, 0.11]) put(mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.74, 8), M(COL.metal)), 0.63, 0.69, zz, 0, 0, 0.32);
  // garde-boue avant
  const fender = mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.17, 18, 1, true, 1.92, 1.75), M(body, { side: THREE.DoubleSide }));
  put(fender, 0.74, 0.355, 0, Math.PI / 2, 0, 0);
  // cadre treillis
  for (const zz of [-0.19, 0.19]) put(mesh(new THREE.BoxGeometry(0.78, 0.07, 0.06), M(frame)), 0.16, 0.8, zz, 0, 0, 0.56);
  // bras oscillant
  for (const zz of [-0.13, 0.13]) put(mesh(new THREE.BoxGeometry(0.6, 0.07, 0.05), M(COL.navy2)), -0.43, 0.465, zz, 0, 0, 0.42);
  // moteur
  put(mesh(new RoundedBoxGeometry(0.5, 0.36, 0.34, 2, 0.05), M(COL.engine)), 0.08, 0.6, 0);
  put(mesh(new RoundedBoxGeometry(0.3, 0.2, 0.3, 2, 0.04), M(0x2d4378)), 0.26, 0.84, 0, 0, 0, -0.3);
  for (let k = 0; k < 3; k++) put(mesh(new THREE.BoxGeometry(0.34, 0.02, 0.38), M(COL.metal)), 0.08, 0.5 + k * 0.08, 0);
  // échappement
  put(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), M(COL.metal)), 0.3, 0.42, -0.12, 0, 0, -0.5);
  put(mesh(new THREE.CylinderGeometry(0.078, 0.066, 0.52, 14), M(COL.metal)), -0.4, 0.48, -0.19, 0, 0, Math.PI / 2 - 0.28);
  // réservoir, bande, selle, coque arrière
  put(
    mesh(
      extrude(
        [
          [0.5, 0.86],
          [0.53, 1.0],
          [0.39, 1.13],
          [0.06, 1.15],
          [-0.15, 1.04],
          [-0.19, 0.89],
          [0.1, 0.8],
        ],
        0.4,
        0.03,
      ),
      M(body),
    ),
    0,
    0,
    0,
  );
  put(
    mesh(
      extrude(
        [
          [0.47, 0.94],
          [0.42, 1.03],
          [-0.12, 1.0],
          [-0.15, 0.93],
        ],
        0.5,
        0,
      ),
      M(frame),
    ),
    0,
    0,
    0,
  );
  put(
    mesh(
      extrude(
        [
          [-0.14, 0.99],
          [-0.62, 0.96],
          [-0.7, 1.0],
          [-0.66, 1.04],
          [-0.15, 1.08],
        ],
        0.3,
        0.03,
      ),
      M(0x142a5c),
    ),
    0,
    0,
    0,
  );
  put(
    mesh(
      extrude(
        [
          [-0.6, 0.92],
          [-0.97, 1.1],
          [-1.0, 1.05],
          [-0.67, 0.86],
        ],
        0.24,
        0.025,
      ),
      M(body),
    ),
    0,
    0,
    0,
  );
  const tail = mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), new THREE.MeshLambertMaterial({ color: COL.signal, emissive: COL.signal, emissiveIntensity: 0.6 }));
  put(tail, -0.99, 1.06, 0);
  // garde-boue arrière
  const rf = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.15, 14, 1, true, 2.5, 1.2), M(COL.navy2, { side: THREE.DoubleSide }));
  put(rf, -0.7, 0.355, 0, Math.PI / 2, 0, 0);
  // tête de fourche et phare
  put(mesh(new RoundedBoxGeometry(0.2, 0.24, 0.32, 2, 0.05), M(frame)), 0.6, 1.1, 0, 0, 0, 0.25);
  const lensMat = new THREE.MeshLambertMaterial({ color: 0x9aa6c4, emissive: 0xfff3cf, emissiveIntensity: 0 });
  const lens = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 20), lensMat, { cast: false });
  put(lens, 0.715, 1.08, 0, 0, 0, Math.PI / 2);
  // guidon et rétroviseurs
  put(mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.74, 8), M(COL.navy2)), 0.42, 1.25, 0, Math.PI / 2, 0, 0);
  for (const zz of [-0.34, 0.34]) {
    put(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 8), M(COL.tyre)), 0.42, 1.25, zz, Math.PI / 2, 0, 0);
    put(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), M(COL.navy2)), 0.4, 1.36, zz * 0.85, 0, 0, 0.2);
    put(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), M(COL.navy2)), 0.37, 1.47, zz * 0.85, 0, 0, Math.PI / 2 - 0.2);
  }

  // faisceau du phare (cône additif) + lumière + halo
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c8,
    alphaMap: beamFadeTexture(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.25, 5.2, 28, 1, true), beamMat);
  beam.position.set(0.72 + 2.6, 0.82, 0);
  beam.rotation.z = Math.PI / 2 - 0.1;
  pitch.add(beam);
  const spot = new THREE.SpotLight(0xfff1c8, 0, 16, 0.55, 0.6, 1.2);
  spot.position.set(0.75, 1.08, 0);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(6, -0.2, 0);
  pitch.add(spot, spotTarget);
  spot.target = spotTarget;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTexture(), color: 0xfff1c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.position.set(0.78, 1.08, 0);
  halo.scale.setScalar(0.9);
  pitch.add(halo);

  if (rider) {
    const pants = M(0x10224f);
    const jac = M(jacket);
    const glove = M(COL.navy);
    for (const zz of [-1, 1]) {
      pitch.add(limb([-0.3, 1.08, 0.15 * zz], [0.16, 0.96, 0.25 * zz], 0.088, pants));
      pitch.add(limb([0.16, 0.96, 0.25 * zz], [0.0, 0.54, 0.21 * zz], 0.075, pants));
      put(mesh(new RoundedBoxGeometry(0.26, 0.13, 0.11, 2, 0.04), M(COL.navy)), 0.05, 0.5, 0.21 * zz);
      pitch.add(limb([-0.01, 1.57, 0.22 * zz], [0.2, 1.37, 0.29 * zz], 0.072, jac));
      pitch.add(limb([0.2, 1.37, 0.29 * zz], [0.41, 1.26, 0.32 * zz], 0.064, jac));
      put(mesh(new THREE.SphereGeometry(0.07, 10, 8), glove), 0.42, 1.25, 0.33 * zz);
    }
    put(mesh(new RoundedBoxGeometry(0.34, 0.58, 0.44, 3, 0.1), jac), -0.12, 1.36, 0, 0, 0, -0.42);
    // bande blanche sur le dos
    put(mesh(new THREE.BoxGeometry(0.36, 0.07, 0.46), M(COL.white)), -0.075, 1.46, 0, 0, 0, -0.42);
    put(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), M(COL.navy)), 0.04, 1.66, 0);
    const helmet = mesh(new THREE.SphereGeometry(0.205, 24, 18), M(COL.white));
    put(helmet, 0.08, 1.83, 0);
    const visor = mesh(
      new THREE.SphereGeometry(0.212, 24, 12, Math.PI - 0.95, 1.9, 1.05, 0.62),
      new THREE.MeshPhongMaterial({ color: 0x0a1633, shininess: 90, specular: 0x8fb3ff }),
    );
    put(visor, 0.08, 1.83, 0);
    put(mesh(new THREE.TorusGeometry(0.207, 0.03, 6, 30, Math.PI), M(frame)), 0.08, 1.83, 0);
  }
  root.traverse((o) => {
    if (o.isMesh && o.material !== beamMat) o.castShadow = true;
  });
  beam.castShadow = false;
  return { root, lean, pitch, wheels, lensMat, beamMat, spot, halo };
}

let beamTex = null;
function beamFadeTexture() {
  if (beamTex) return beamTex;
  const cv = document.createElement("canvas");
  cv.width = 4;
  cv.height = 256;
  const g = cv.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.55, "#555555");
  grd.addColorStop(1, "#000000");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  beamTex = new THREE.CanvasTexture(cv);
  return beamTex;
}

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,240,200,0.6)");
  grd.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(cv);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

/* --------------------------- Montage ------------------------------ */

let moto;
const slalomCones = [];
const obstacleCones = [];
const brakeCones = [];
let skid;
let skidMat;
const clouds = [];

function buildWorld() {
  buildPlateau();
  plateauMesh.material.map = paintPlateau();
  plateauMesh.material.needsUpdate = true;

  moto = buildMoto();
  scene.add(moto.root);

  // cônes
  for (const x of SLALOM_CONES) {
    const c = cone(x, LANES.slalom);
    slalomCones.push(c);
    addProp(c);
  }
  for (const dz of [-0.55, 0, 0.55]) {
    const c = cone(OBSTACLE_X, LANES.evit + dz);
    obstacleCones.push(c);
    addProp(c);
  }
  for (const dz of [-1.7, 1.7]) {
    const c = cone(STOP_X - 0.2, LANES.brake + dz, { s: 0.8 });
    brakeCones.push(c);
    addProp(c);
  }
  for (const [x, z] of [
    [-6.2, LANES.brake - 1.7],
    [-6.2, LANES.brake + 1.7],
    [11.2, LANES.evit - 1.7],
    [11.2, LANES.evit + 1.7],
    [11.2, LANES.slalom + 1.7],
    [11.2, LANES.slalom - 1.7],
  ])
    addProp(cone(x, z, { s: 0.75 }));

  // traces de freinage (bande qui s'allonge)
  skidMat = new THREE.MeshBasicMaterial({ color: 0x050d26, transparent: true, opacity: 0.55, depthWrite: false });
  skid = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.14), skidMat);
  skid.geometry.translate(0.5, 0, 0);
  skid.rotation.x = -Math.PI / 2;
  skid.position.set(0, 0.1, LANES.brake);
  scene.add(skid);

  buildFence();
  buildGate();

  // panneaux publicitaires sur la clôture avant et droite
  const texA = signTexture([{ text: "PISTE PRIVÉE" }], { w: 1100, h: 200, bg: "#ff5b3a", fg: "#061a47" });
  let ecole = "WISSOUS";
  try {
    ecole = (window.__hyperframes?.getVariables?.().ecole || ecole).toUpperCase();
  } catch (e) {
    /* variables indisponibles : nom par défaut */
  }
  const texB = signTexture([{ text: `AUTO-ÉCOLE ${ecole}` }], { w: 1100, h: 200, bg: "#0d52d9", fg: "#ffffff" });
  const texC = signTexture([{ text: "PERMIS A2", mono: false }], { w: 1100, h: 200, bg: "#ffffff", fg: "#0d52d9" });
  const frontXs = [-8.2 + 1.6, 0.6, 4.4, 8.2];
  const frontTex = [texB, texA, texC, texB];
  frontXs.forEach((x, i) => {
    if (x > GATE.x0 - 1.8 && x < GATE.x1 + 1.8) return;
    addProp(banner(x, FENCE.z1 + 0.1, 0, frontTex[i]), { mode: "y", delay: 0.3 });
  });
  addProp(banner(-8.6, FENCE.z1 + 0.1, 0, texA, 1.9), { mode: "y", delay: 0.3 });
  [-6.5, -1.5, 3.5].forEach((z, i) => {
    addProp(banner(FENCE.x1 + 0.1, z, Math.PI / 2, [texA, texB, texC][i]), { mode: "y", delay: 0.3 });
  });

  // mâts d'éclairage
  addProp(floodMast(FENCE.x1 + 0.9, FENCE.z1 + 0.9, 0), { mode: "y" });
  addProp(floodMast(FENCE.x0 - 0.9, FENCE.z1 + 0.9, 1), { mode: "y" });
  addProp(floodMast(FENCE.x1 + 0.9, FENCE.z0 - 0.9, 1), { mode: "y" });
  addProp(floodMast(FENCE.x0 - 0.9, FENCE.z0 - 0.9, 2), { mode: "y" });

  // club-house de l'auto-école
  const club = new THREE.Group();
  const wallTex = windowsTexture(4, 2, { bg: "#f2f6ff" });
  const wall = new THREE.MeshLambertMaterial({ map: wallTex });
  const cb = mesh(new THREE.BoxGeometry(4.2, 2.6, 5.4), [wall, wall, lambert(COL.paint), lambert(COL.paint), wall, wall], { receive: true });
  cb.position.y = 1.3;
  const croof = mesh(new THREE.BoxGeometry(4.8, 0.3, 6.0), lambert(COL.brand));
  croof.position.y = 2.75;
  const awning = mesh(new THREE.BoxGeometry(0.9, 0.12, 4.4), lambert(COL.signal));
  awning.position.set(2.45, 1.95, 0);
  awning.rotation.z = -0.25;
  const signTex = signTexture([{ text: "AUTO-ÉCOLE" }], { w: 1024, h: 256, bg: "#0d52d9", fg: "#ffffff" });
  const roofSign = mesh(new THREE.BoxGeometry(3.6, 0.9, 0.14), [
    lambert(COL.navy2),
    lambert(COL.navy2),
    lambert(COL.navy2),
    lambert(COL.navy2),
    new THREE.MeshLambertMaterial({ map: signTex }),
    lambert(COL.navy2),
  ]);
  roofSign.position.set(0.6, 3.5, 0.6);
  roofSign.rotation.y = Math.PI / 4;
  club.add(cb, croof, awning, roofSign);
  club.position.set(-12.9, 0, -6.8);
  scene.add(club);
  addProp(club, { mode: "y" });

  // abri motos avec deux motos garées
  const shelter = new THREE.Group();
  for (const [px, pz] of [
    [-1.6, -2],
    [1.6, -2],
    [-1.6, 2],
    [1.6, 2],
  ]) {
    const p = mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), lambert(COL.metal));
    p.position.set(px, 1.05, pz);
    shelter.add(p);
  }
  const sroof = mesh(new THREE.BoxGeometry(3.8, 0.14, 4.8), lambert(COL.signal));
  sroof.position.y = 2.15;
  shelter.add(sroof);
  for (const [i, color] of [
    [0, COL.white],
    [1, COL.brand],
  ]) {
    const m = buildMoto({ rider: false, body: color, frame: color === COL.brand ? COL.white : COL.brand });
    m.root.position.set(0, 0.02, -1 + i * 2);
    m.root.rotation.y = Math.PI / 2 + 0.25;
    shelter.add(m.root);
  }
  shelter.position.set(-12.9, 0, 0.6);
  scene.add(shelter);
  addProp(shelter, { mode: "y" });

  // arbres
  const trees = [
    [-14.6, -11.2, 1.1, 0],
    [-10.6, -11.4, 0.9, 1],
    [-14.8, 4.8, 1.0, 1],
    [-14.2, 8.6, 1.2, 0],
    [-11.4, 11.4, 0.8, 1],
    [-12.2, 6.4, 0.7, 0],
    [15.3, -11.4, 1.0, 0],
    [15.2, -7.2, 0.8, 1],
    [11.2, -11.6, 0.9, 1],
    [3.4, -11.6, 1.0, 0],
    [-4.6, -11.6, 0.85, 1],
    [15.4, 4.2, 0.75, 1],
  ];
  for (const [x, z, s, kind] of trees) addProp(tree(x, z, { s, kind }));

  // ville
  const blocks = [
    [-10.6, 17.6, 3.2, 4.6, 3.2],
    [-7.4, 18.0, 2.4, 3.0, 2.4],
    [0.4, 17.8, 3.0, 6.4, 3.0],
    [3.2, 18.2, 2.0, 3.6, 2.6],
    [-10.4, 25.6, 3.6, 3.4, 3.6],
    [-7.2, 26.6, 2.0, 5.2, 2.2],
    [0.6, 25.8, 3.4, 4.2, 3.2],
    [3.4, 26.8, 1.8, 2.4, 2.2],
  ];
  blocks.forEach(([x, z, w, h, d], i) => building(x, z, w, h, d, { roof: i % 3 === 0 ? COL.signal : COL.brand, cols: 3, rows: Math.max(2, Math.round(h / 1.2)), popDelay: 0.15, parent: cityGroup }));
  // routes de la ville
  const rz = mesh(new THREE.BoxGeometry(3, 0.1, CITY.z1 - CITY.z0 - 0.4), lambert(COL.asphalt), { cast: false, receive: true });
  rz.position.set(-4, 0.03, (CITY.z0 + CITY.z1) / 2);
  const rx = mesh(new THREE.BoxGeometry(CITY.x1 - CITY.x0 - 0.4, 0.1, 3), lambert(COL.asphalt), { cast: false, receive: true });
  rx.position.set((CITY.x0 + CITY.x1) / 2, 0.03, 22);
  cityGroup.add(rz, rx);
  // passage piéton
  for (let k = 0; k < 5; k++) {
    const st = mesh(new THREE.BoxGeometry(0.34, 0.02, 1.0), lambert(COL.paint), { cast: false, receive: true });
    st.position.set(-5.1 + k * 0.55, 0.09, 19.6);
    cityGroup.add(st);
  }
  // feu tricolore
  const tl = new THREE.Group();
  const tp = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), lambert(COL.navy2));
  tp.position.y = 1.1;
  const tb = mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), lambert(COL.navy));
  tb.position.y = 2.3;
  const green = mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2fe07a, emissive: 0x2fe07a, emissiveIntensity: 0.9 }));
  green.position.set(0.16, 2.08, 0);
  tl.add(tp, tb, green);
  tl.position.set(-2.1, 0, 20.2);
  cityGroup.add(tl);
  addProp(tl, { mode: "y" });
  // voitures garées
  for (const [x, z, ry, c] of [
    [-1.2, 23.6, 0, COL.white],
    [-6.8, 20.4, Math.PI, COL.signal],
  ]) {
    const car = new THREE.Group();
    const bodyM = mesh(new RoundedBoxGeometry(1.9, 0.5, 0.95, 2, 0.12), lambert(c));
    bodyM.position.y = 0.42;
    const cab = mesh(new RoundedBoxGeometry(1.0, 0.42, 0.85, 2, 0.12), lambert(COL.glass));
    cab.position.set(-0.1, 0.8, 0);
    car.add(bodyM, cab);
    for (const [wx, wz] of [
      [0.6, 0.45],
      [-0.6, 0.45],
      [0.6, -0.45],
      [-0.6, -0.45],
    ]) {
      const wh = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 12), lambert(COL.tyre));
      wh.rotation.x = Math.PI / 2;
      wh.position.set(wx, 0.2, wz);
      car.add(wh);
    }
    car.position.set(x, 0.05, z);
    car.rotation.y = ry;
    cityGroup.add(car);
    addProp(car, { mode: "y" });
  }

  // nuages et petits îlots flottants pour la profondeur
  const rnd = mulberry32(99);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0x9fb9f5, transparent: true, opacity: 0.4, flatShading: true });
  for (const [cx, cy, cz, n] of [
    [24, -15, 16, 4],
    [-14, -17, 30, 3],
    [32, -19, -4, 3],
    [6, -21, 34, 4],
  ]) {
    const c = new THREE.Group();
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + rnd() * 1.4, 0), cloudMat);
      p.position.set(k * 1.7 - n * 0.85, rnd() * 0.7, (rnd() - 0.5) * 1.6);
      c.add(p);
    }
    c.position.set(cx, cy, cz);
    c.userData = { phase: rnd() * Math.PI * 2, speed: 0.15 + rnd() * 0.2, base: c.position.clone() };
    scene.add(c);
    clouds.push(c);
  }
  for (const [x, y, z, s] of [
    [24, -4, -12, 1],
    [-24, -6, -2, 0.8],
    [20, -10, 20, 0.7],
  ]) {
    const isle = new THREE.Group();
    const top = mesh(new THREE.CylinderGeometry(2.4 * s, 1.6 * s, 0.8, 7), lambert(COL.field, { flatShading: true }), { cast: false, receive: true });
    const bottom = mesh(new THREE.ConeGeometry(1.6 * s, 3 * s, 7), lambert(COL.navy2, { flatShading: true }), { cast: false });
    bottom.rotation.x = Math.PI;
    bottom.position.y = -0.4 - 1.5 * s;
    isle.add(top, bottom);
    const tr = tree(0, 0, { s: 0.9 * s, kind: 1 });
    scene.remove(tr);
    tr.position.y = 0.4;
    isle.add(tr);
    isle.position.set(x, y, z);
    isle.userData = { base: isle.position.clone(), phase: x };
    scene.add(isle);
    clouds.push(isle);
  }
}

/* ------------------------------------------------------------------ */
/* Caméra                                                              */
/* ------------------------------------------------------------------ */

const D2R = Math.PI / 180;
const IMPACTS = [
  [1.3, 0.12],
  [2.0, 0.22],
  [6.62, 0.16],
  [11.0, 0.14],
  [18.0, 0.12],
  [22.0, 0.12],
  [30.0, 0.1],
];
function shakeAt(t) {
  let x = 0;
  let y = 0;
  for (const [ti, amp] of IMPACTS) {
    const d = t - ti;
    if (d < 0 || d > 0.6) continue;
    const env = amp * Math.exp(-d * 9);
    x += env * Math.sin(d * 71);
    y += env * Math.cos(d * 53);
  }
  return [x, y];
}

const camHook = {
  zoom: track([
    [0, 10.6],
    [1.27, 11.9, "sine"],
    [1.34, 10.9, "out"],
    [2.0, 11.2, "sine"],
  ]),
};
const camReveal = {
  zoom: track([
    [2.0, 11.2],
    [3.35, 0.97, "expoInOut"],
    [6.0, 1.1, "sine"],
  ]),
  az: track([
    [2.0, 60],
    [3.35, 40, "expoInOut"],
    [6.0, 56, "sine"],
  ]),
  el: track([
    [2.0, 13],
    [3.35, 33, "expoInOut"],
    [6.0, 36, "sine"],
  ]),
  screenY: track([
    [2.0, 0.12],
    [3.35, 0.07, "expoInOut"],
    [6.0, 0.09, "sine"],
  ]),
};
const HOOK_TARGET = [LOOP.startX + 0.55, 1.05, LOOP.z1];

function shotAt(t, m) {
  if (t < 2.0) {
    return { target: HOOK_TARGET, zoom: camHook.zoom(t), az: 60 - 3 * prog(t, 0, 2), el: 13, screenY: 0.12 };
  }
  if (t < 6.0) {
    const k = EASE.expoInOut(prog(t, 2.0, 3.35));
    const wide = [1.5, -1.0, 0.8];
    const target = HOOK_TARGET.map((v, i) => lerp(v, wide[i], k));
    return { target, zoom: camReveal.zoom(t), az: camReveal.az(t), el: camReveal.el(t), screenY: camReveal.screenY(t) };
  }
  if (t < 8.0) {
    const p = prog(t, 6.0, 7.55);
    const whip = EASE.in(prog(t, 7.55, 8.0));
    return {
      target: [-4 + whip * 6, lerp(1.7, 1.5, p) - whip * 1.2, GATE.z - 0.6],
      zoom: lerp(3.4, 4.1, EASE.sine(p)) - whip * 1.2,
      az: 8 + 8 * EASE.sine(p) + whip * 70,
      el: 16 + 3 * p + whip * 26,
      screenY: 0.0,
    };
  }
  if (t < 10.0) {
    const p = prog(t, 8.0, 10.0);
    const settle = EASE.out(prog(t, 8.0, 8.45));
    return {
      target: [m.x + 1.4, 0.4, LANES.slalom],
      zoom: lerp(2.6, 3.5, settle) + 0.15 * p,
      az: lerp(80, 22, settle) + 6 * p,
      el: lerp(40, 47, settle),
      screenY: 0.12,
    };
  }
  if (t < 12.0) {
    const p = prog(t, 10.0, 12.0);
    // la caméra suit avec un léger retard puis se pose sur la ligne d'arrêt
    const follow = clamp(m.x - 1.3, STOP_X - 1.0, 20);
    const punch = t > 11.0 ? Math.exp(-(t - 11.0) * 4) * 0.6 : 0;
    return {
      target: [follow, 0.6, LANES.brake + 0.3],
      zoom: lerp(2.9, 3.5, EASE.sine(p)) + punch,
      az: lerp(-40, -30, p),
      el: 24,
      screenY: 0.1,
    };
  }
  if (t < 14.0) {
    const p = prog(t, 12.0, 14.0);
    return {
      target: [m.x + 1.6, 0.5, LANES.evit + 0.9],
      zoom: lerp(3.3, 3.8, EASE.sine(p)),
      az: lerp(60, 50, p),
      el: lerp(32, 36, p),
      screenY: 0.1,
    };
  }
  if (t < 16.0) {
    const p = prog(t, 14.0, 16.0);
    return { target: [1.8, -0.6, 0.6], zoom: lerp(1.2, 1.32, EASE.sine(p)), az: lerp(30, 42, p), el: 37, screenY: 0.1 };
  }
  if (t < 18.0) {
    // contrechamp : on suit la moto qui quitte la piste vers le pont et la ville
    const p = prog(t, 16.0, 18.0);
    return {
      target: [m.x - 0.4, 0.4, m.z + 2.0],
      zoom: lerp(2.15, 1.6, EASE.sine(p)),
      az: lerp(222, 206, p),
      el: lerp(30, 34, p),
      screenY: 0.15,
    };
  }
  if (t < 26.0) {
    const p = prog(t, 18.0, 26.0);
    return { target: [0.5, -1.5, 5.5], zoom: lerp(0.86, 0.94, p), az: lerp(24, 62, EASE.sine(p)), el: lerp(32, 40, p), screenY: 0.0 };
  }
  const p = prog(t, 26.0, 32.0);
  const intro = EASE.expoOut(prog(t, 26.0, 27.2));
  return {
    target: [1.6, -0.8, 1.6],
    zoom: lerp(0.62, 0.88, intro) + 0.13 * EASE.sine(p),
    az: lerp(70, 38, intro) + 18 * EASE.sine(p),
    el: lerp(48, 33, intro),
    screenY: 0.09,
  };
}

function applyCamera(t, m) {
  const shot = shotAt(t, m);
  const [sx, sy] = shakeAt(t);
  const az = shot.az * D2R;
  const el = shot.el * D2R;
  const R = 200;
  const T = new THREE.Vector3(...shot.target);
  camera.position.set(T.x + Math.sin(az) * Math.cos(el) * R, T.y + Math.sin(el) * R, T.z + Math.cos(az) * Math.cos(el) * R);
  camera.up.set(0, 1, 0);
  camera.lookAt(T);
  camera.zoom = shot.zoom;
  const shift = shot.screenY * (VIEW_H / shot.zoom);
  const hw = (VIEW_H * ASPECT) / 2;
  camera.left = -hw + sx * (VIEW_H / shot.zoom) * 0.08 * ASPECT;
  camera.right = hw + sx * (VIEW_H / shot.zoom) * 0.08 * ASPECT;
  camera.top = VIEW_H / 2 + shift + sy * (VIEW_H / shot.zoom) * 0.05;
  camera.bottom = -VIEW_H / 2 + shift + sy * (VIEW_H / shot.zoom) * 0.05;
  camera.updateProjectionMatrix();
  // ombres nettes : le frustum d'ombre suit la cible et se resserre en gros plan
  const half = clamp(30 / shot.zoom, 5, 34);
  sun.position.set(T.x - 14, T.y + 34, T.z + 20);
  sun.target.position.copy(T);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  rim.position.set(T.x - 20, T.y + 12, T.z - 20);
  rim.target.position.copy(T);
  return shot;
}

/* ------------------------------------------------------------------ */
/* Rendu à l'instant t                                                 */
/* ------------------------------------------------------------------ */

const projV = new THREE.Vector3();
function project(x, y, z) {
  projV.set(x, y, z).project(camera);
  return [(projV.x * 0.5 + 0.5) * W, (-projV.y * 0.5 + 0.5) * H];
}

function lightLevel(t) {
  if (t < 1.5) return 0;
  const steps = [1.5, 1.75, 2.0];
  let lvl = 0;
  let flash = 0;
  steps.forEach((s, i) => {
    if (t >= s) {
      lvl = (i + 1) / 3;
      flash = Math.max(flash, Math.exp(-(t - s) * 14) * 0.35);
    }
  });
  return lvl + flash;
}

function headlightLevel(t) {
  if (t < 0.15) return 0;
  if (t >= 0.2 && t < 0.25) return 0.15;
  let v = 1;
  // double appel de phare final
  for (const s of [30.0, 30.3]) if (t >= s && t < s + 0.12) v = 1.8;
  return v;
}

const anchors = {};
for (const el of document.querySelectorAll("[data-anchor]")) anchors[el.dataset.anchor] = el;
const speedEl = document.getElementById("speed-value");
const gaugeFill = document.getElementById("gauge-fill");
let lastSpeedText = "";

function renderAt(t) {
  t = Math.max(0, t);
  const m = motoAt(t);

  // moto : position, cap, inclinaison, tangage, roues
  moto.root.position.set(m.x, 0.09, m.z);
  moto.root.rotation.y = -m.th;
  const roll = clamp(m.v * m.v * m.kappa * 0.021, -0.42, 0.42);
  moto.lean.rotation.x = roll;
  const pitch = clamp(-m.a * 0.0075, -0.09, 0.05);
  moto.pitch.rotation.z = m.seg === "brake" ? pitch : clamp(pitch, -0.04, 0.03);
  for (const w of moto.wheels) w.rotation.z = -m.s / 0.355;

  // phare
  const hl = headlightLevel(t);
  const L = clamp(lightLevel(t), 0, 1.4);
  const night = 1 - clamp(L, 0, 1);
  moto.lensMat.emissiveIntensity = hl * 1.4;
  moto.beamMat.opacity = hl * (0.03 + 0.14 * night);
  moto.spot.intensity = hl * (14 + 40 * night);
  const flareT = t - 0.15;
  const flare = flareT > 0 ? 1 + 2.2 * Math.exp(-flareT * 7) : 0;
  moto.halo.material.opacity = hl > 0.2 ? clamp(0.55 + 0.4 * night, 0, 1) : 0;
  moto.halo.scale.setScalar(0.8 * Math.max(flare, 1) * (hl > 1.2 ? 1.6 : 1));

  // lumières générales
  hemi.intensity = lerp(0.17, 1.25, Math.min(L, 1)) + Math.max(0, L - 1) * 0.6;
  hemi.color.setHex(L < 0.5 ? 0x5571c4 : 0xdbe8ff);
  sun.intensity = lerp(0.0, 2.3, Math.min(L, 1)) + Math.max(0, L - 1) * 1.0;
  rim.intensity = 1.4 * night;
  for (const f of floodHeads) f.mat.emissiveIntensity = t >= [1.5, 1.75, 2.0][f.bank] ? 1.2 : 0;

  // apparitions du décor
  for (const p of props) {
    const k = prog(t, p.t0, p.t0 + 0.5);
    const s = k <= 0 ? 0 : EASE.backOut(k);
    p.obj.visible = k > 0;
    if (p.mode === "y") p.obj.scale.set(p.base.x, Math.max(1e-4, p.base.y * s), p.base.z);
    else if (p.mode === "x") p.obj.scale.set(Math.max(1e-4, p.base.x * s), p.base.y, p.base.z);
    else p.obj.scale.setScalar(Math.max(1e-4, p.base.x * s));
  }

  // cônes qui vacillent au passage de la moto
  const wobble = (c, tPass, amp) => {
    const d = t - tPass;
    if (d < 0) return;
    const w = amp * Math.exp(-d * 4.2) * Math.sin(d * 19);
    c.rotation.z = w;
    c.rotation.x = w * 0.6;
  };
  slalomCones.forEach((c, i) => {
    c.rotation.set(0, 0, 0);
    if (t >= 8 && t < 10.6) wobble(c, PASS_TIMES.slalom[i], 0.22);
  });
  obstacleCones.forEach((c, i) => {
    c.rotation.set(0, 0, 0);
    if (t >= 12 && t < 14.5) wobble(c, PASS_TIMES.obstacle + i * 0.03, 0.12);
  });

  // trace de freinage : de la roue arrière jusqu'au point de freinage
  if (m.seg === "brake" && t >= 10.95) {
    const rearX = m.x + 0.7;
    const len = clamp(BRAKE_START_X - rearX, 0, 20);
    skid.visible = len > 0.05;
    skid.position.x = rearX;
    skid.scale.x = Math.max(0.01, len);
  } else skid.visible = false;

  // portail : ouvert, se ferme à 6,35 s, se rouvre à 16,3 s
  const close = EASE.backOut(prog(t, 6.32, 6.62));
  const reopen = EASE.inOut(prog(t, 16.25, 16.95));
  const openAmt = clamp(1 - close + reopen, 0, 1);
  gatePanels.left.rotation.y = 1.75 * openAmt;
  gatePanels.right.rotation.y = -1.75 * openAmt;

  // nuages et îlots
  for (const c of clouds) {
    const u = c.userData;
    c.position.y = u.base.y + Math.sin(t * 0.8 + u.phase) * 0.35;
    if (u.speed) c.position.x = u.base.x + Math.sin(t * u.speed + u.phase) * 1.5;
  }

  cityGroup.visible = !(t >= 6.0 && t < 14.0);

  const shot = applyCamera(t, m);
  renderer.render(scene, camera);

  // ancres HTML (étiquettes qui suivent des objets 3D)
  const place = (name, p) => {
    const el = anchors[name];
    if (el) el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
  };
  place("gate", project((GATE.x0 + GATE.x1) / 2, 3.05, GATE.z));
  if (anchors.gate) anchors.gate.style.setProperty("--ppu", ((H / VIEW_H) * shot.zoom).toFixed(2));
  place("moto", project(m.x, 2.35, m.z));
  place("stop", project(STOP_X - 0.15, 0.1, LANES.brake));
  place("obstacle", project(OBSTACLE_X, 0.9, LANES.evit));
  if (speedEl) {
    const kmh = m.seg === "brake" ? Math.round(clamp(m.v, 0, 20) * 4) : 0;
    const txt = String(kmh);
    if (txt !== lastSpeedText) {
      speedEl.textContent = txt;
      lastSpeedText = txt;
    }
    if (gaugeFill) gaugeFill.style.strokeDashoffset = String(100 - (kmh / 50) * 100);
  }
}

window.__world = { renderAt, project, paths: PATHS, motoAt };

window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
const built = fontsReady.then(() => {
  buildWorld();
  renderAt(window.__hfThreeTime || 0);
});
window.__hf.buildReady.world = built;

window.addEventListener("hf-seek", (event) => {
  const time = event.detail.time;
  if (moto) renderAt(time);
  else if (event.waitUntil) event.waitUntil(built.then(() => renderAt(time)));
});
