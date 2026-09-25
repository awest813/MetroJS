// Builds the starter GLB building kits in public/models/.
//
//   node scripts/build-models.mjs
//
// Each model is a few dozen boxes, gables, wedges, and cylinders in the city's
// zone colours, written as glTF 2.0 binary with no dependencies. They stand in
// for artist-made kits: any GLB that follows the same conventions (see
// public/models/ASSET_LICENSE.md) can replace a file here.
//
// Conventions: 1 unit = one map tile; the model stands on y = 0, centred on
// the origin, inside the tile; its front (door, shopfront) faces +Z.
//
// Faces nobody sees are left out: the camera never goes below the ground, so
// nothing has a bottom, and a door, window, or sign (a box thinner than
// DECAL) keeps only its outward face. A house is drawn hundreds of times.

/** Boxes thinner than this are surface details: only their outward face is drawn. */
const DECAL = 0.02;

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');

// ── Colours (linear RGB, the procedural kits' palettes) ───────────────────────

const shade = (c, f) => c.map((v) => Math.min(1, v * f));
const RES = [0.42, 0.62, 0.90];
const COM = [0.92, 0.78, 0.22];
const IND = [0.68, 0.48, 0.78];
const MIX = [0.20, 0.75, 0.65];
const GLASS = [0.10, 0.18, 0.28];
const DOOR = [0.38, 0.24, 0.14];
const STONE = [0.52, 0.50, 0.47];
const METAL = [0.28, 0.28, 0.30];
const WHITE = [0.90, 0.88, 0.82];

// ── Parts ─────────────────────────────────────────────────────────────────────
// Every part is a list of flat quads/triangles: { c, pts: [[x,y,z]...], n }.

function face(c, pts, n) {
  return { c, pts, n };
}

/** Axis box: w (x) × h (y) × d (z), bottom at y, centred on x, z; optional tilt about x. */
function box(c, w, h, d, x, y, z, rx = 0) {
  const X = [x - w / 2, x + w / 2];
  const Y = [0, h];
  const Z = [z - d / 2, z + d / 2];
  const cos = Math.cos(rx);
  const sin = Math.sin(rx);
  // Tilt about the box's bottom-front edge's axis through its centre height.
  const p = (i, j, k) => {
    const ly = Y[j] - h / 2;
    const lz = Z[k] - z;
    return [X[i], y + h / 2 + ly * cos - lz * sin, z + ly * sin + lz * cos];
  };
  const r = (v) => [v[0], v[1] * cos - v[2] * sin, v[1] * sin + v[2] * cos];
  const faces = {
    front: face(c, [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], r([0, 0, 1])),
    back: face(c, [p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(1, 1, 0)], r([0, 0, -1])),
    right: face(c, [p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)], [1, 0, 0]),
    left: face(c, [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)], [-1, 0, 0]),
    top: face(c, [p(0, 1, 1), p(1, 1, 1), p(1, 1, 0), p(0, 1, 0)], r([0, 1, 0])),
  };
  // A detail on a wall faces out from the building's middle; one lying flat faces up.
  if (d < DECAL && rx === 0) return [z >= 0 ? faces.front : faces.back];
  if (w < DECAL) return [x >= 0 ? faces.right : faces.left];
  if (h < DECAL && rx === 0) return [faces.top];
  return Object.values(faces);
}

/** Gable roof: w (x) × d (z) at its eaves, ridge h above y, running along x. */
function gable(c, w, h, d, x, y, z) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, top = y + h;
  const slope = Math.hypot(h, d / 2);
  const front = [0, (d / 2) / slope, h / slope];
  const back = [0, (d / 2) / slope, -h / slope];
  return [
    face(c, [[x0, y, z1], [x1, y, z1], [x1, top, z], [x0, top, z]], front),
    face(c, [[x1, y, z0], [x0, y, z0], [x0, top, z], [x1, top, z]], back),
    face(c, [[x1, y, z1], [x1, y, z0], [x1, top, z]], [1, 0, 0]),
    face(c, [[x0, y, z0], [x0, y, z1], [x0, top, z]], [-1, 0, 0]),
  ];
}

/** Sawtooth tooth: a wedge w (x) × d (z), glazed upright face h tall at its +z end. */
function wedge(roof, glass, w, h, d, x, y, z) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const slope = Math.hypot(h, d);
  const up = [0, d / slope, -h / slope];
  return [
    face(roof, [[x1, y, z0], [x0, y, z0], [x0, y + h, z1], [x1, y + h, z1]], up),
    face(glass, [[x0, y, z1], [x1, y, z1], [x1, y + h, z1], [x0, y + h, z1]], [0, 0, 1]),
    face(roof, [[x1, y, z1], [x1, y, z0], [x1, y + h, z1]], [1, 0, 0]),
    face(roof, [[x0, y, z0], [x0, y, z1], [x0, y + h, z1]], [-1, 0, 0]),
  ];
}

/** Upright cylinder or cone: radius r at the bottom, r2 at the top, n sides. */
function cyl(c, r, h, x, y, z, n = 12, r2 = r, caps = true) {
  const out = [];
  const at = (i, rad, yy) => {
    const a = (i / n) * Math.PI * 2;
    return [x + Math.cos(a) * rad, yy, z + Math.sin(a) * rad];
  };
  const slant = Math.atan2(r - r2, h);
  for (let i = 0; i < n; i++) {
    const mid = ((i + 0.5) / n) * Math.PI * 2;
    const nrm = [Math.cos(mid) * Math.cos(slant), Math.sin(slant), Math.sin(mid) * Math.cos(slant)];
    if (r2 > 0) out.push(face(c, [at(i, r, y), at(i + 1, r, y), at(i + 1, r2, y + h), at(i, r2, y + h)], nrm));
    else out.push(face(c, [at(i, r, y), at(i + 1, r, y), [x, y + h, z]], nrm));
  }
  if (caps) {
    if (r2 > 0) {
      const top = [];
      for (let i = 0; i < n; i++) top.push(at(i, r2, y + h));
      out.push(face(c, top, [0, 1, 0]));
    }
  }
  return out;
}

// ── Models ────────────────────────────────────────────────────────────────────

function smallHouse() {
  const body = RES, roof = shade(RES, 0.42), trim = shade(RES, 1.12);
  return [
    box(STONE, 0.48, 0.03, 0.44, 0, 0, 0),
    box(body, 0.44, 0.22, 0.40, 0, 0.03, 0),
    gable(roof, 0.52, 0.16, 0.48, 0, 0.25, 0),
    box(METAL, 0.06, 0.14, 0.06, 0.12, 0.30, -0.08),
    box(DOOR, 0.07, 0.12, 0.012, 0, 0.03, 0.206),
    box(STONE, 0.11, 0.015, 0.05, 0, 0, 0.235),
    box(GLASS, 0.08, 0.07, 0.01, -0.12, 0.11, 0.203),
    box(GLASS, 0.08, 0.07, 0.01, 0.12, 0.11, 0.203),
    box(trim, 0.10, 0.012, 0.02, -0.12, 0.10, 0.205),
    box(trim, 0.10, 0.012, 0.02, 0.12, 0.10, 0.205),
    box(GLASS, 0.01, 0.07, 0.08, 0.223, 0.11, 0),
    box(GLASS, 0.01, 0.07, 0.08, -0.223, 0.11, 0),
  ].flat();
}

function rowhouse() {
  const parts = [box(STONE, 0.70, 0.03, 0.42, 0, 0, 0)];
  const tones = [RES, shade(RES, 0.9), shade(RES, 1.06)];
  [-0.23, 0, 0.23].forEach((x, i) => {
    const body = tones[i];
    parts.push(
      box(body, 0.22, 0.40, 0.40, x, 0.03, 0),
      box(shade(RES, 0.42), 0.22, 0.03, 0.40, x, 0.43, 0),
      box(METAL, 0.05, 0.08, 0.05, x + 0.06, 0.46, -0.1),
      box(DOOR, 0.06, 0.13, 0.012, x - 0.05, 0.03, 0.206),
      box(STONE, 0.08, 0.03, 0.05, x - 0.05, 0, 0.23),
      box(GLASS, 0.06, 0.08, 0.01, x + 0.05, 0.08, 0.203),
      box(GLASS, 0.06, 0.08, 0.01, x - 0.05, 0.26, 0.203),
      box(GLASS, 0.06, 0.08, 0.01, x + 0.05, 0.26, 0.203),
    );
  });
  parts.push(box(shade(RES, 1.12), 0.70, 0.025, 0.43, 0, 0.40, 0));
  return parts.flat();
}

function smallShop() {
  const body = COM, roof = shade(COM, 0.42), trim = shade(COM, 1.12);
  return [
    box(body, 0.60, 0.30, 0.56, 0, 0, 0),
    box(roof, 0.60, 0.02, 0.56, 0, 0.30, 0),
    box(trim, 0.62, 0.05, 0.03, 0, 0.30, 0.27),
    box(GLASS, 0.44, 0.14, 0.01, 0.04, 0.04, 0.283),
    box(shade(GLASS, 0.7), 0.08, 0.16, 0.012, -0.22, 0, 0.284),
    box(WHITE, 0.40, 0.06, 0.015, 0, 0.23, 0.287),
    box([0.80, 0.16, 0.12], 0.52, 0.015, 0.12, 0, 0.19, 0.33, -0.35),
    box(METAL, 0.12, 0.06, 0.10, 0.12, 0.32, -0.1),
  ].flat();
}

function officeBlock() {
  const body = COM, roof = shade(COM, 0.42), trim = shade(COM, 1.12);
  const parts = [
    box(shade(COM, 0.8), 0.70, 0.14, 0.70, 0, 0, 0),
    box(GLASS, 0.24, 0.10, 0.01, 0, 0, 0.353),
    box(trim, 0.30, 0.02, 0.10, 0, 0.11, 0.39),
    box(body, 0.60, 0.90, 0.60, 0, 0.14, 0),
  ];
  for (let k = 0; k < 8; k++) parts.push(box(GLASS, 0.612, 0.055, 0.612, 0, 0.18 + k * 0.105, 0));
  parts.push(
    box(roof, 0.62, 0.02, 0.62, 0, 1.04, 0),
    box(METAL, 0.24, 0.08, 0.20, 0.08, 1.06, -0.08),
    cyl(METAL, 0.01, 0.10, -0.18, 1.06, 0.16, 6),
  );
  return parts.flat();
}

function factory() {
  const body = IND, roof = shade(IND, 0.42);
  const parts = [
    box(body, 0.78, 0.30, 0.70, 0, 0, 0),
    box(DOOR, 0.20, 0.18, 0.012, -0.18, 0, 0.356),
    box(GLASS, 0.30, 0.05, 0.01, 0.17, 0.18, 0.353),
  ];
  for (let i = 0; i < 3; i++) parts.push(wedge(roof, GLASS, 0.78, 0.12, 0.2333, 0, 0.30, -0.35 + 0.2333 * (i + 0.5)));
  parts.push(
    cyl(METAL, 0.05, 0.32, 0.28, 0.30, -0.22, 10),
    cyl([0.80, 0.16, 0.12], 0.056, 0.03, 0.28, 0.56, -0.22, 10),
  );
  return parts.flat();
}

function fireStation() {
  const red = [0.78, 0.18, 0.12], roof = [0.28, 0.10, 0.08];
  return [
    box(red, 0.68, 0.30, 0.56, 0, 0, 0),
    box(roof, 0.70, 0.025, 0.58, 0, 0.30, 0),
    box(WHITE, 0.22, 0.20, 0.012, -0.13, 0, 0.286),
    box(WHITE, 0.22, 0.20, 0.012, 0.13, 0, 0.286),
    box([0.95, 0.72, 0.12], 0.30, 0.04, 0.012, 0, 0.24, 0.287),
    box(red, 0.14, 0.44, 0.14, -0.24, 0.02, -0.16),
    gable(roof, 0.16, 0.06, 0.16, -0.24, 0.46, -0.16),
    box(GLASS, 0.01, 0.06, 0.06, -0.171, 0.34, -0.16),
  ].flat();
}

function waterTower() {
  const tank = [0.22, 0.48, 0.62], roof = [0.14, 0.28, 0.38], trim = [0.55, 0.55, 0.52];
  const parts = [];
  for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
    parts.push(box(METAL, 0.03, 0.50, 0.03, x, 0, z));
  }
  for (const y of [0.18, 0.36]) {
    parts.push(
      box(trim, 0.26, 0.015, 0.015, 0, y, 0.13),
      box(trim, 0.26, 0.015, 0.015, 0, y, -0.13),
      box(trim, 0.015, 0.015, 0.26, 0.13, y, 0),
      box(trim, 0.015, 0.015, 0.26, -0.13, y, 0),
    );
  }
  parts.push(
    cyl(METAL, 0.025, 0.50, 0, 0, 0, 8),
    cyl(trim, 0.2, 0.012, 0, 0.50, 0, 16),
    cyl(tank, 0.17, 0.22, 0, 0.512, 0, 16),
    cyl(roof, 0.18, 0.10, 0, 0.732, 0, 16, 0),
  );
  return parts.flat();
}

function shopRow() {
  const upper = shade(COM, 0.95), trim = shade(COM, 1.12);
  const parts = [
    box(COM, 0.78, 0.22, 0.56, 0, 0, 0),
    box(upper, 0.74, 0.24, 0.50, 0, 0.22, -0.02),
    box(WHITE, 0.66, 0.03, 0.012, 0, 0.175, 0.286),
    box([0.16, 0.45, 0.30], 0.80, 0.015, 0.14, 0, 0.19, 0.33, -0.3),
    box(trim, 0.76, 0.03, 0.52, 0, 0.46, -0.02),
    box(shade(COM, 0.42), 0.72, 0.02, 0.48, 0, 0.49, -0.02),
    box(METAL, 0.10, 0.05, 0.08, -0.2, 0.51, -0.08),
    box(METAL, 0.10, 0.05, 0.08, 0.2, 0.51, -0.08),
  ];
  for (const x of [-0.25, 0, 0.25]) {
    parts.push(
      box(GLASS, 0.20, 0.12, 0.01, x, 0.04, 0.283),
      box(GLASS, 0.12, 0.08, 0.01, x, 0.31, 0.233),
    );
  }
  return parts.flat();
}

function lightWorkshop() {
  const roof = shade(IND, 0.42);
  return [
    box(IND, 0.72, 0.32, 0.68, 0, 0, 0),
    gable(roof, 0.76, 0.10, 0.72, 0, 0.32, 0),
    box([0.62, 0.62, 0.60], 0.22, 0.20, 0.012, -0.12, 0, 0.346),
    box(shade(IND, 1.1), 0.20, 0.20, 0.10, 0.22, 0, 0.39),
    box(DOOR, 0.06, 0.12, 0.012, 0.22, 0, 0.446),
    box(GLASS, 0.07, 0.06, 0.01, 0.28, 0.10, 0.444),
    box(GLASS, 0.30, 0.05, 0.01, -0.12, 0.24, 0.343),
    cyl(METAL, 0.04, 0.20, 0.22, 0.38, -0.18, 8),
  ].flat();
}

function industrialWorks() {
  const roof = shade(IND, 0.42);
  return [
    box(IND, 0.58, 0.42, 0.82, -0.15, 0, 0),
    box(roof, 0.62, 0.03, 0.84, -0.15, 0.42, 0),
    box(GLASS, 0.52, 0.06, 0.01, -0.15, 0.30, 0.413),
    box([0.62, 0.62, 0.60], 0.20, 0.20, 0.012, -0.25, 0, 0.416),
    cyl([0.55, 0.55, 0.52], 0.13, 0.40, 0.28, 0, 0.22, 14),
    cyl(shade([0.55, 0.55, 0.52], 0.7), 0.13, 0.06, 0.28, 0.40, 0.22, 14, 0.02),
    box(METAL, 0.30, 0.04, 0.04, 0.10, 0.36, 0.22),
    cyl(METAL, 0.06, 0.64, 0.30, 0, -0.24, 10),
    cyl([0.80, 0.16, 0.12], 0.066, 0.04, 0.30, 0.56, -0.24, 10),
    cyl(METAL, 0.045, 0.30, -0.05, 0.45, -0.28, 8),
  ].flat();
}

function powerPlant() {
  const body = [1.00, 0.55, 0.08], trim = [0.85, 0.85, 0.80], red = [0.90, 0.15, 0.08];
  return [
    box(body, 0.74, 0.34, 0.64, 0, 0, 0),
    box(trim, 0.76, 0.03, 0.66, 0, 0.34, 0),
    box(red, 0.74, 0.04, 0.012, 0, 0.24, 0.326),
    box(WHITE, 0.14, 0.18, 0.012, -0.2, 0, 0.326),
    box(GLASS, 0.30, 0.06, 0.01, 0.14, 0.12, 0.325),
    cyl(METAL, 0.07, 0.46, -0.16, 0.34, 0.06, 12),
    cyl(red, 0.074, 0.04, -0.16, 0.74, 0.06, 12),
    cyl(METAL, 0.07, 0.40, 0.18, 0.34, 0.06, 12),
    cyl(red, 0.074, 0.04, 0.18, 0.68, 0.06, 12),
    box(METAL, 0.10, 0.10, 0.08, 0.26, 0.34, -0.2),
    box(METAL, 0.10, 0.10, 0.08, 0.10, 0.34, -0.2),
  ].flat();
}

function policeStation() {
  const body = [0.22, 0.34, 0.52], roof = [0.12, 0.16, 0.24], trim = [0.72, 0.74, 0.78], gold = [0.85, 0.70, 0.18];
  return [
    box(body, 0.62, 0.28, 0.54, 0, 0, 0),
    box(roof, 0.66, 0.04, 0.58, 0, 0.28, 0),
    box(trim, 0.18, 0.26, 0.18, -0.18, 0.32, -0.12),
    box(roof, 0.20, 0.02, 0.20, -0.18, 0.58, -0.12),
    cyl(METAL, 0.01, 0.14, -0.18, 0.60, -0.12, 6),
    box(GLASS, 0.10, 0.14, 0.012, 0.08, 0, 0.276),
    box(gold, 0.16, 0.05, 0.012, 0.08, 0.19, 0.276),
    box(GLASS, 0.14, 0.08, 0.01, -0.16, 0.10, 0.275),
    box(STONE, 0.18, 0.02, 0.05, 0.08, 0, 0.30),
    cyl(METAL, 0.008, 0.40, 0.26, 0, 0.24, 6),
    box([0.85, 0.20, 0.18], 0.07, 0.04, 0.005, 0.30, 0.34, 0.24),
  ].flat();
}

/** A village's volunteer fire hall: one bay under a gable, and a bell post. */
function volunteerFireHall() {
  const red = [0.72, 0.22, 0.14], roof = [0.30, 0.12, 0.09], gold = [0.95, 0.72, 0.12];
  return [
    box(STONE, 0.50, 0.02, 0.44, 0, 0, 0),
    box(red, 0.46, 0.22, 0.40, 0, 0.02, 0),
    gable(roof, 0.52, 0.13, 0.46, 0, 0.24, 0),
    box(WHITE, 0.22, 0.17, 0.012, -0.06, 0.02, 0.206),
    box(gold, 0.24, 0.03, 0.012, -0.06, 0.19, 0.207),
    box(GLASS, 0.07, 0.07, 0.01, 0.15, 0.10, 0.205),
    box(METAL, 0.025, 0.38, 0.025, 0.22, 0, -0.17),
    box(METAL, 0.10, 0.02, 0.025, 0.22, 0.38, -0.17),
    cyl(gold, 0.03, 0.05, 0.22, 0.33, -0.17, 8, 0.018),
  ].flat();
}

/** A police post: a small flat-roofed office with a lamp over the door. */
function policePost() {
  const body = [0.24, 0.36, 0.54], roof = [0.12, 0.16, 0.24], trim = [0.72, 0.74, 0.78];
  return [
    box(STONE, 0.42, 0.02, 0.38, 0, 0, 0),
    box(body, 0.38, 0.24, 0.34, 0, 0.02, 0),
    box(roof, 0.42, 0.03, 0.38, 0, 0.26, 0),
    box(DOOR, 0.08, 0.14, 0.012, 0.10, 0.02, 0.176),
    box(GLASS, 0.14, 0.08, 0.01, -0.07, 0.10, 0.175),
    box(trim, 0.16, 0.012, 0.02, -0.07, 0.09, 0.177),
    box([0.25, 0.45, 0.95], 0.05, 0.04, 0.05, 0.10, 0.29, 0.10),
  ].flat();
}

/** A water pump: a pump house beside a squat tank, joined by a pipe. */
function waterPump() {
  const house = [0.62, 0.66, 0.66], roof = [0.14, 0.28, 0.38], tank = [0.22, 0.48, 0.62];
  return [
    box(STONE, 0.52, 0.02, 0.42, 0, 0, 0),
    box(house, 0.22, 0.18, 0.24, -0.13, 0.02, 0.05),
    gable(roof, 0.26, 0.08, 0.28, -0.13, 0.20, 0.05),
    box(DOOR, 0.06, 0.11, 0.012, -0.13, 0.02, 0.176),
    cyl(tank, 0.12, 0.24, 0.13, 0.02, -0.03, 16),
    cyl(roof, 0.13, 0.06, 0.13, 0.26, -0.03, 16, 0),
    box(METAL, 0.10, 0.03, 0.03, 0.0, 0.08, 0.02),
  ].flat();
}

/** A gas plant: a turbine hall, a round tank, and one slim stack. */
function gasPowerPlant() {
  const body = [0.86, 0.84, 0.78], roof = [0.36, 0.38, 0.42], blue = [0.20, 0.42, 0.72];
  return [
    box(STONE, 0.84, 0.02, 0.76, 0, 0, 0),
    box(body, 0.66, 0.32, 0.56, -0.07, 0.02, 0.04),
    box(roof, 0.68, 0.03, 0.58, -0.07, 0.34, 0.04),
    box(blue, 0.66, 0.04, 0.012, -0.07, 0.24, 0.326),
    box(GLASS, 0.36, 0.08, 0.01, -0.12, 0.12, 0.325),
    box(WHITE, 0.12, 0.18, 0.012, 0.16, 0.02, 0.326),
    cyl(METAL, 0.10, 0.22, 0.30, 0.02, -0.24, 14),
    cyl(roof, 0.105, 0.04, 0.30, 0.24, -0.24, 14, 0),
    cyl(METAL, 0.045, 0.66, -0.28, 0.02, -0.22, 10),
    cyl(blue, 0.048, 0.04, -0.28, 0.64, -0.22, 10),
  ].flat();
}

/** A clinic: a low white building, a red cross, and an entrance canopy. */
function clinic() {
  const body = [0.92, 0.92, 0.90], roof = [0.50, 0.54, 0.58], red = [0.82, 0.14, 0.12];
  return [
    box(STONE, 0.74, 0.02, 0.60, 0, 0, 0),
    box(body, 0.68, 0.28, 0.54, 0, 0.02, 0),
    box(roof, 0.72, 0.03, 0.58, 0, 0.30, 0),
    box(body, 0.30, 0.18, 0.30, 0.16, 0.33, -0.08),
    box(roof, 0.32, 0.02, 0.32, 0.16, 0.51, -0.08),
    box(red, 0.12, 0.04, 0.012, -0.16, 0.20, 0.276),
    box(red, 0.04, 0.12, 0.012, -0.16, 0.16, 0.277),
    box(GLASS, 0.18, 0.14, 0.01, 0.12, 0.02, 0.275),
    box(roof, 0.26, 0.02, 0.10, 0.12, 0.18, 0.31),
    box(GLASS, 0.10, 0.06, 0.01, -0.16, 0.06, 0.275),
  ].flat();
}

/** A college: a gabled hall with tall windows and a clock tower. */
function college() {
  const brick = [0.62, 0.30, 0.22], roof = [0.24, 0.20, 0.22], trim = [0.86, 0.82, 0.72];
  const parts = [
    box(STONE, 0.86, 0.02, 0.66, 0, 0, 0),
    box(brick, 0.80, 0.32, 0.56, 0, 0.02, -0.02),
    gable(roof, 0.86, 0.16, 0.62, 0, 0.34, -0.02),
    box(brick, 0.18, 0.56, 0.18, 0, 0.02, 0.20),
    gable(roof, 0.22, 0.12, 0.22, 0, 0.58, 0.20),
    cyl(trim, 0.05, 0.012, 0, 0.44, 0.292, 12, 0.05),
    box(DOOR, 0.08, 0.14, 0.012, 0, 0.02, 0.292),
  ];
  for (const x of [-0.30, -0.18, 0.18, 0.30]) parts.push(box(GLASS, 0.06, 0.16, 0.01, x, 0.10, 0.262));
  return parts.flat();
}

/** A stadium: four stands around a green pitch, with a roof over the main stand. */
function stadium() {
  const stand = [0.72, 0.72, 0.74], roof = [0.30, 0.34, 0.42], grass = [0.22, 0.56, 0.24], white = WHITE;
  return [
    box(grass, 0.62, 0.02, 0.60, 0, 0, 0),
    box(white, 0.40, 0.004, 0.004, 0, 0.022, 0),
    box(stand, 0.92, 0.26, 0.14, 0, 0, -0.38),
    box(stand, 0.92, 0.20, 0.14, 0, 0, 0.38),
    box(stand, 0.14, 0.22, 0.62, -0.39, 0, 0),
    box(stand, 0.14, 0.22, 0.62, 0.39, 0, 0),
    box(roof, 0.92, 0.03, 0.16, 0, 0.30, -0.38),
    box(METAL, 0.02, 0.44, 0.02, -0.42, 0, -0.42),
    box(METAL, 0.02, 0.44, 0.02, 0.42, 0, -0.42),
    box(white, 0.10, 0.05, 0.02, -0.42, 0.44, -0.42),
    box(white, 0.10, 0.05, 0.02, 0.42, 0.44, -0.42),
  ].flat();
}

/** A city hall: a stone front with columns, a pediment, and a dome. */
function cityHall() {
  const stone = [0.84, 0.80, 0.70], roof = [0.34, 0.46, 0.44], gold = [0.85, 0.70, 0.18];
  const parts = [
    box(STONE, 0.86, 0.03, 0.76, 0, 0, 0),
    box(stone, 0.76, 0.38, 0.50, 0, 0.03, -0.08),
    box(stone, 0.80, 0.04, 0.16, 0, 0.37, 0.24),
    gable(stone, 0.80, 0.10, 0.16, 0, 0.41, 0.24),
    box(roof, 0.78, 0.03, 0.52, 0, 0.41, -0.08),
    cyl(stone, 0.15, 0.16, 0, 0.44, -0.08, 16),
    cyl(roof, 0.15, 0.20, 0, 0.60, -0.08, 16, 0.02),
    cyl(gold, 0.02, 0.08, 0, 0.78, -0.08, 8, 0),
    box(DOOR, 0.10, 0.18, 0.012, 0, 0.03, 0.172),
  ];
  for (const x of [-0.30, -0.18, -0.06, 0.06, 0.18, 0.30]) parts.push(cyl(WHITE, 0.022, 0.34, x, 0.03, 0.26, 8));
  return parts.flat();
}

function shopfrontApartments() {
  const upper = MIX, roof = shade(MIX, 0.42), trim = shade(MIX, 1.12);
  const parts = [
    box(shade(MIX, 0.9), 0.72, 0.18, 0.52, 0, 0, 0),
    box(upper, 0.62, 0.42, 0.42, 0, 0.18, 0),
    box(GLASS, 0.50, 0.10, 0.01, 0, 0.03, 0.263),
    box([0.80, 0.16, 0.12], 0.74, 0.015, 0.12, 0, 0.16, 0.30, -0.3),
    box(roof, 0.64, 0.03, 0.44, 0, 0.60, 0),
  ];
  for (const y of [0.28, 0.44]) {
    for (const x of [-0.19, 0, 0.19]) {
      parts.push(box(GLASS, 0.10, 0.08, 0.01, x, y, 0.213));
      if (y > 0.4) parts.push(box(trim, 0.13, 0.012, 0.05, x, y - 0.012, 0.235));
    }
  }
  return parts.flat();
}

function cornerStoreFlats() {
  const roof = shade(MIX, 0.42);
  const parts = [
    box(shade(MIX, 0.9), 0.62, 0.16, 0.62, 0, 0, 0),
    box(MIX, 0.52, 0.40, 0.52, 0, 0.16, 0),
    box(GLASS, 0.30, 0.10, 0.01, 0.10, 0.03, 0.313),
    box(GLASS, 0.01, 0.10, 0.30, 0.313, 0.03, 0.10),
    box(DOOR, 0.07, 0.12, 0.012, -0.16, 0, 0.314),
    box([0.95, 0.72, 0.12], 0.64, 0.015, 0.12, 0, 0.15, 0.36, -0.3),
    box(roof, 0.54, 0.03, 0.54, 0, 0.56, 0),
  ];
  for (const y of [0.26, 0.40]) {
    for (const t of [-0.12, 0.12]) {
      parts.push(
        box(GLASS, 0.10, 0.08, 0.01, t, y, 0.263),
        box(GLASS, 0.01, 0.08, 0.10, 0.263, y, t),
      );
    }
  }
  return parts.flat();
}

function mainStreetBlock() {
  const roof = shade(MIX, 0.42), trim = shade(MIX, 1.12);
  const parts = [
    box(shade(MIX, 0.9), 0.82, 0.20, 0.56, 0, 0, 0),
    box(MIX, 0.70, 0.48, 0.46, 0, 0.20, 0),
    box(GLASS, 0.62, 0.10, 0.01, 0, 0.04, 0.283),
    box([0.16, 0.45, 0.30], 0.84, 0.015, 0.14, 0, 0.18, 0.33, -0.3),
    box(trim, 0.72, 0.03, 0.48, 0, 0.66, 0),
    box(roof, 0.70, 0.04, 0.46, 0, 0.69, 0),
  ];
  for (const y of [0.30, 0.46]) {
    for (const x of [-0.24, -0.08, 0.08, 0.24]) parts.push(box(GLASS, 0.10, 0.08, 0.01, x, y, 0.233));
  }
  return parts.flat();
}

const MODELS = {
  small_house: smallHouse,
  rowhouse,
  small_shop: smallShop,
  office_block: officeBlock,
  factory,
  small_fire_station: fireStation,
  small_water_tower: waterTower,
  shop_row: shopRow,
  light_workshop: lightWorkshop,
  industrial_works: industrialWorks,
  small_power_plant: powerPlant,
  small_police_station: policeStation,
  shopfront_apartments: shopfrontApartments,
  corner_store_flats: cornerStoreFlats,
  main_street_block: mainStreetBlock,
  volunteer_fire_hall: volunteerFireHall,
  police_post: policePost,
  water_pump: waterPump,
  gas_power_plant: gasPowerPlant,
  clinic,
  college,
  stadium,
  city_hall: cityHall,
};

// ── glTF writer ───────────────────────────────────────────────────────────────

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

/** Faces grouped by colour into primitives: flat normals, counter-clockwise from outside. */
function primitives(faces) {
  const groups = new Map();
  for (const f of faces) {
    const key = f.c.map((v) => v.toFixed(3)).join(',');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { color: f.c, pos: [], nrm: [], idx: [] }));
    const n = unit(f.n);
    const base = g.pos.length / 3;
    for (const p of f.pts) { g.pos.push(...p); g.nrm.push(...n); }
    for (let i = 1; i + 1 < f.pts.length; i++) {
      const tri = [0, i, i + 1];
      // glTF front faces wind counter-clockwise; flip any that face inward.
      const [a, b, c] = tri.map((t) => f.pts[t]);
      if (dot(cross(sub(b, a), sub(c, a)), n) < 0) tri.reverse();
      g.idx.push(...tri.map((t) => base + t));
    }
  }
  return [...groups.values()];
}

function glb(name, faces) {
  const prims = primitives(faces);
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let offset = 0;
  const push = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const materials = [];
  const gltfPrims = prims.map((p, i) => {
    const pos = new Float32Array(p.pos);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < pos.length; k += 3) {
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], pos[k + a]); max[a] = Math.max(max[a], pos[k + a]); }
    }
    accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: push(new Float32Array(p.nrm), 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3' });
    const nrmAcc = accessors.length - 1;
    accessors.push({ bufferView: push(new Uint16Array(p.idx), 34963), componentType: 5123, count: p.idx.length, type: 'SCALAR' });
    materials.push({
      name: `${name}-${i}`,
      pbrMetallicRoughness: { baseColorFactor: [...p.color, 1], metallicFactor: 0, roughnessFactor: 0.8 },
    });
    return { attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: accessors.length - 1, material: i };
  });
  const json = {
    asset: { version: '2.0', generator: 'OpenPublica scripts/build-models.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: gltfPrims }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const bin = Buffer.concat(chunks);
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return { bytes: Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]), triangles: prims.reduce((n, p) => n + p.idx.length / 3, 0) };
}

for (const [defId, build] of Object.entries(MODELS)) {
  const { bytes, triangles } = glb(defId, build());
  writeFileSync(join(OUT, `${defId}.glb`), bytes);
  console.log(`${defId}.glb  ${bytes.length} bytes, ${triangles} triangles`);
}
