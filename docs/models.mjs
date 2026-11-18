import * as T from './vendor/three.module.min.js';

const pi = Math.PI;
const full = 2 * pi;
const half = [pi / 2, pi];
const origin = [0, 0, 0];
const vector = (values) => new T.Vector3(...values);
const surface = (color, metalness = .46, roughness = .36) =>
  new T.MeshStandardMaterial({ color, metalness, roughness, side: T.DoubleSide });

const steel = surface(0x8a9aa2, .60);
const lightSteel = surface(0xb8c3c5, .65, .28);
const darkSteel = surface(0x485761, .50);
const copper = surface(0xbb703d, .55, .29);
const rim = surface(0xd9a061, .60, .28);
const brass = surface(0xc38c49, .55, .31);
const shield = surface(0x9c673f, .59);
const wrap = surface(0x2e363a, .19, .53);
const warm = surface(0xcd692f, .03, .3);
const cool = surface(0x428b98, .04, .31);
const interfaceMat = surface(0xe5bc86, .11, .3);
const cavity = surface(0x253a3d, .06);
const warmDot = new T.MeshBasicMaterial({color: 0xffc16e});
const coolDot = new T.MeshBasicMaterial({color: 0x96e5e9});

function mesh(parent, geometry, material, position = origin) {
  const object = new T.Mesh(geometry, material);
  object.position.set(...position);
  parent.add(object);
  return object;
}

function disk(parent, radius, height, material, position = origin, angles = [0, full], sides = 96) {
  return mesh(parent, new T.CylinderGeometry(radius, radius, height, sides, 1, false, ...angles), material, position);
}

function block(parent, dimensions, material, position) {
  return mesh(parent, new T.BoxGeometry(...dimensions), material, position);
}

function sectionTube(parent, outer, inner, height, material, position = origin, angles = [0, full]) {
  const [start, span] = angles;
  const count = Math.max(24, Math.ceil(96 * span / full));
  const positions = [];
  const normals = [];
  const indexes = [];
  const radial = (angle) => [Math.sin(angle), 0, Math.cos(angle)];
  const point = (radius, angle, y) => [radius * Math.sin(angle), y, radius * Math.cos(angle)];
  const quad = (a, b, c, d, n0, n1 = n0, n2 = n1, n3 = n0) => {
    const i = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    normals.push(...n0, ...n1, ...n2, ...n3);
    indexes.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const top = height / 2;
  const bottom = -top;
  for (let i = 0; i < count; i++) {
    const a = start + span * i / count;
    const b = start + span * (i + 1) / count;
    const oa = point(outer, a, bottom);
    const ob = point(outer, b, bottom);
    const ot = point(outer, a, top);
    const ou = point(outer, b, top);
    const ia = point(inner, a, bottom);
    const ib = point(inner, b, bottom);
    const it = point(inner, a, top);
    const iu = point(inner, b, top);
    const na = radial(a);
    const nb = radial(b);
    quad(oa, ob, ou, ot, na, nb, nb, na);
    quad(ib, ia, it, iu, nb.map((n) => -n), na.map((n) => -n), na.map((n) => -n), nb.map((n) => -n));
    quad(it, ot, ou, iu, [0, 1, 0]);
    quad(oa, ia, ib, ob, [0, -1, 0]);
  }
  if (span < full) {
    for (const [angle, direction] of [[start, -1], [start + span, 1]]) {
      const face = [point(inner, angle, bottom), point(outer, angle, bottom), point(outer, angle, top), point(inner, angle, top)];
      if (direction === 1) face.reverse();
      quad(...face, [direction * Math.cos(angle), 0, -direction * Math.sin(angle)]);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indexes);
  return mesh(parent, geometry, material, position);
}

function rod(parent, a, b, radius, material) {
  const direction = vector(b).sub(vector(a));
  const object = disk(parent, radius, direction.length(), material, vector(a).lerp(vector(b), .5).toArray(), [0, full], 12);
  object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function path(parent, points, radius, material, segments = 64) {
  const curve = new T.CatmullRomCurve3(points.map(vector));
  mesh(parent, new T.TubeGeometry(curve, segments, radius, 8), material);
  return curve;
}

function helix(parent, [x, y, z], radius, height, turns, wire, material) {
  const points = Array.from({length: Math.ceil(turns * 16) + 1}, (_, i) => {
    const t = i / (Math.ceil(turns * 16));
    return [x + radius * Math.cos(full * turns * t), y + height * (.5 - t), z + radius * Math.sin(full * turns * t)];
  });
  return path(parent, points, wire, material, Math.ceil(turns * 36));
}

function bolts(parent, count, radius, y, size, material = darkSteel, x = 0, z = 0, start = 0, angle = full) {
  for (let index = 0; index < count; index++) {
    const phi = start + angle * (index + .5) / count;
    disk(parent, size, size * .62, material, [x + radius * Math.sin(phi), y, z + radius * Math.cos(phi)], [0, full], 6);
  }
}

function flange(parent, radius, height, y, metal, count = 20) {
  const part = new T.Group();
  parent.add(part);
  const plate = disk(part, radius, height, metal.clone(), [0, y, 0]);
  const trim = metal === steel ? lightSteel : rim;
  sectionTube(part, radius + .05, radius - 2.4, 2.2, trim, [0, y + height * .36, 0]);
  bolts(part, count, radius - 9, y + height / 2 + 1.2, 2.5);
  return plate.material;
}

function coldHead(parent) {
  // Drawing datums: mounting face to first station 195.7 mm, then 193.3 mm.
  disk(parent, 93.35, 13, steel, [0, 201, 0]);
  disk(parent, 88, 4, lightSteel, [0, 209.5, 0]);
  disk(parent, 75, 29, steel, [0, 226, 0]);
  bolts(parent, 8, 86.35, 210, 3.4);
  disk(parent, 64.75, 14, copper, [0, 5.8, 0]);
  sectionTube(parent, 64.75, 59, 2.2, rim, [0, 11.5, 0]);
  bolts(parent, 8, 55, 14.4, 3);
  disk(parent, 47, 13, copper, [0, -188, 0]);
  sectionTube(parent, 47, 41, 2, rim, [0, -182, 0]);
  bolts(parent, 6, 37, -180.6, 2.6);
  for (const [x, radius] of [[-25, 20], [25, 14]]) {
    disk(parent, radius, 181.7, lightSteel, [x, 103.65, 0]);
    disk(parent, radius * .81, 180.3, lightSteel, [x, -91.35, 0]);
    for (const y of [174, 18, -10, -175]) disk(parent, radius + 1.2, 5, darkSteel, [x, y, 0]);
  }
  for (const [x, direction] of [[-26, -1], [26, 1]]) {
    disk(parent, 11, 12, darkSteel, [x, 245, 27]);
    path(parent, [[x, 248, 27], [x, 263, 27], [x + direction * 11, 273, 27],
      [x + direction * 38, 275, 27]], 6.2, lightSteel, 22);
  }
}

// Elevations of unlabeled flanges are measured from the published side view.
const stages = [650, 460, 174, -73, -179, -267];
const radii = [258, 157, 106, 94, 80, 82];

export function cryostat() {
  const group = new T.Group();
  const closed = new T.Group();
  closed.visible = false;
  group.add(closed);

  const front = [3 * pi / 2, pi];
  for (const [top, bottom, radius] of [[650, 150, 189], [150, -650, 156]]) {
    const y = (top + bottom) / 2;
    sectionTube(group, radius, radius - 4, top - bottom, steel, [0, y, 0], half);
    sectionTube(closed, radius, radius - 4, top - bottom, steel, [0, y, 0], front);
  }
  for (const [y, outer, inner] of [[641, 194, 184], [150, 193, 146], [-645, 160, 144]]) {
    sectionTube(group, outer, inner, 11, lightSteel, [0, y, 0], half);
    sectionTube(closed, outer, inner, 11, lightSteel, [0, y, 0], front);
  }
  const windowGlass = surface(0x5e9ca3, .15, .16);
  for (const [assembly, angles] of [[group, half], [closed, front]]) {
    sectionTube(assembly, 155, 20, 6, steel, [0, -647, 0], angles);
    sectionTube(assembly, 32, 20, 20, lightSteel, [0, -660, 0], angles);
    disk(assembly, 20, 2, windowGlass, [0, -661, 0], angles);
  }

  // The 50 K shield is stepped. The 4 K shield has a Ø208 mm clear bore.
  for (const [radius, top, bottom, material] of [
    [157, 460, 150, brass],
    [130, 150, -615, brass],
    [107, 174, -588, shield],
  ]) {
    sectionTube(group, radius, radius - 3, top - bottom, material, [0, (top + bottom) / 2, 0], half);
    sectionTube(group, radius + 1.5, radius - 3, 3, rim, [0, bottom + 12, 0], half);
    sectionTube(group, radius, bottom === 150 ? 127 : 20, 3.5, material, [0, bottom, 0], half);
  }

  const plates = stages.map((y, i) => flange(group, radii[i], [15, 11, 11, 9, 9, 12][i], y, i === 0 ? steel : [brass, copper, copper, brass, copper][i - 1], i === 0 ? 28 : 20));
  for (let level = 0; level < stages.length - 1; level++) {
    const r = radii[level + 1] - 18;
    for (const phi of [-1.12, 1.1, pi]) {
      const x = r * Math.sin(phi);
      const z = r * Math.cos(phi);
      rod(group, [x, stages[level + 1], z], [x, stages[level], z], level < 2 ? 4.5 : 3.6, darkSteel);
      for (const y of [stages[level] - 7, stages[level + 1] + 7]) disk(group, 6.2, 6, lightSteel, [x, y, z], [0, full], 6);
    }
  }

  // The overview simplifies component shapes to make the flows and heat links visible.
  const pulse = new T.Group();
  pulse.scale.set(.80, 1.18, .80);
  pulse.position.set(-61, 410, -35);
  group.add(pulse);
  coldHead(pulse);
  for (const [y, hotY] of [[460, 417], [174, 188]]) {
    for (let index = 0; index < 6; index++) {
      path(group, [[-91, hotY, -8 + index * 3], [-99, hotY - 16, -1 + index * 3],
        [-94, y - 16, 12 + index * 3], [-94, y - 3, 13 + index * 3]], 1.8, iCopper(index), 18);
    }
  }
  for (const [x, z, radius, h] of [[-54, -26, 38, 36], [57, 26, 20, 51], [-113, 52, 16, 33],
    [24, 103, 19, 25], [94, -45, 15, 28], [-8, -110, 20, 24]]) {
    disk(group, radius + 4, 5, lightSteel, [x, 666, z]);
    disk(group, radius - 2, h, darkSteel, [x, 664 + h / 2, z]);
    disk(group, radius, 6, steel, [x, 666 + h, z]);
    disk(group, radius - 5, 1.6, wrap, [x, 670 + h, z]);
  }
  path(group, [[55, 716, 26], [55, 739, 26], [66, 751, 26], [104, 751, 26]], 8, steel, 20);
  path(group, [[-54, 704, -26], [-53, 726, -25], [-71, 734, -27], [-110, 734, -26]], 8, darkSteel, 20);

  const stillX = 48;
  const stillZ = 37;
  sectionTube(group, 29, 24, 36, copper, [stillX, -48, stillZ], half);
  disk(group, 29, 4, rim, [stillX, -66, stillZ]);
  disk(group, 23.5, 10, cool, [stillX, -58, stillZ], half);
  disk(group, 29, 4, rim, [stillX, -30, stillZ]);
  path(group, [[stillX, -30, stillZ], [stillX, 14, stillZ], [61, 166, 25], [57, 440, 22], [56, 650, 26]], 7, darkSteel);
  path(group, [[19, 650, 94], [35, 465, 85], [29, 455, 83], [27, 173, 79], [19, 77, 66], [20, -65, 42]], 2.35, rim);

  helix(group, [34, -125, 31], 25, 84, 5, 2.85, copper);
  helix(group, [34, -125, 31], 28, 84, 5, 1.3, lightSteel);
  for (let i = 0; i < 3; i++) {
    const y = -195 - 18 * i;
    block(group, [48, 7, 30], copper, [33, y, 32]);
    block(group, [47, 2, 28], rim, [33, y + 4, 32]);
    for (const x of [13, 53]) {
      rod(group, [x, y - 9, 39], [x, y + 9, 39], 2.2, x === 13 ? brass : steel);
    }
  }
  disk(group, 25, 20, copper, [32, -251, 32]);
  disk(group, 33, 5, rim, [32, -241, 32]);
  disk(group, 32, 5, brass, [32, -262, 32]);
  for (let index = 0; index < 8; index++) {
    const x = -62 + index * 4.8;
    path(group, [[x - 12, 643, 43], [x, 519, 63 + index], [x, 460, 45],
      [x - 7, 277, 53 + index], [x, 174, 43], [x, -73, 45], [x, -179, 50], [x, -267, 47]],
      1.1, index % 3 === 0 ? darkSteel : rim);
    for (const y of stages.slice(1)) disk(group, 2.1, 7, darkSteel, [x, y + 7, y > 19 ? 44 : 49]);
  }
  // The Ø180 by 310 mm clear sample envelope is centered below the final flange.
  const clearance = new T.Group();
  group.add(clearance);
  sectionTube(clearance, 90, 89.4, 310, new T.MeshBasicMaterial({
    color: 0x507c81, transparent: true, opacity: .085, side: T.DoubleSide, depthWrite: false
  }), [0, -428, 0], half).renderOrder = 2;
  sectionTube(clearance, 90, 89.5, 1.5, cool, [0, -583, 0], half);

  for (const [x, z] of [[-57, -26], [58, -26], [0, 50]]) {
    rod(group, [x, -273, z], [x, -535, z], 3.1, darkSteel);
  }
  disk(group, 72, 6, copper, [0, -535, 0]);
  block(group, [52, 10, 45], brass, [0, -527, 5]);
  block(group, [27, 1.3, 24], wrap, [0, -521, 5]);
  for (const x of [-19, 19]) rod(group, [x, -527, 0], [x, -352, 25], 1.24, rim);

  return {group, closed, plates, labels: [
    {text: 'Top flange', point: [-214, 658, 44], side: -1},
    {text: 'Pulse-tube cold head', short: 'Pulse tube', point: [-57, 539, 0], side: 1, interior: true},
    {text: 'Vacuum can', point: [-188, 281, 0], side: -1},
    {text: 'Still & pump line', short: 'Still', point: [67, -31, 51], side: 1, interior: true},
    {text: 'Counterflow exchangers', short: 'Exchangers', point: [57, -156, 47], side: 1, interior: true},
    {text: 'Radiation shields', short: 'Shields', point: [-115, -271, 0], side: -1, interior: true},
    {text: 'Experiment space', short: 'Experiment', point: [57, -542, 48], side: 1, interior: true},
  ]};
}

function iCopper(index) {
  return index % 2 ? rim : copper;
}

export function pulse() {
  const group = new T.Group();
  coldHead(group);
  return {group, labels: [
    {text: 'Room-temperature flange', point: [85, 203, 24], side: 1},
    {text: 'First heat station', point: [-57, 7, 22], side: -1},
    {text: 'Second heat station', point: [40, -186, 20], side: 1},
  ]};
}

export function exchange() {
  const group = new T.Group();
  const axial = new T.Group();
  const end = new T.Group();
  group.add(axial, end);
  for (const [outer, inner, material] of [[3.65, 3, brass], [3, .50, cool], [.50, .325, steel], [.325, .08, warm]]) {
    sectionTube(axial, outer, inner, 500, material, origin, half);
    sectionTube(end, outer, inner, 1.8, material);
  }
  disk(axial, .08, 500, warm, origin, half);
  disk(end, .325, 1.8, warm);
  return {group, axial, end, labels: [
    {text: 'Brass outer wall', point: [2.6, .9, 2.0], side: 1},
    {text: 'Dilute return', point: [-2.1, .9, .6], side: -1},
    {text: 'Concentrated feed', point: [.24, .9, .10], side: 1, offset: 34},
  ]};
}

function vessel(parent, r, h) {
  sectionTube(parent, r, r - 3, h - 6, copper, origin, half);
  disk(parent, r, 3, rim, [0, -(h - 3) / 2, 0]);
  disk(parent, r, 3, rim, [0, (h - 3) / 2, 0], half);
  for (const y of [-(h - 3) / 2, (h - 3) / 2]) {
    sectionTube(parent, r, r - 3.5, 2, copper, [0, y, 0], half);
  }
  bolts(parent, 9, r - 2.6, h / 2 + .45, 1.1, darkSteel, 0, 0, ...half);
}

function tracer(parent, route, radius, count, material, speed) {
  const shape = new T.SphereGeometry(radius, 10, 8);
  const particles = Array.from({length: count}, () => mesh(parent, shape, material));
  return {route, particles, speed};
}

export function mixing() {
  const group = new T.Group();
  vessel(group, 50, 40);
  disk(group, 46.9, 15, cool, [0, -9, 0], half);
  disk(group, 46.9, 11, warm, [0, 4, 0], half);
  disk(group, 47, .55, interfaceMat, [0, -1.52, 0], half);
  sectionTube(group, 5, 4, 26, copper, [-20, 31, -6]);
  sectionTube(group, 5, 4, 56, copper, [22, 16, -7]);
  disk(group, 7, 2.5, brass, [-20, 19, -6]);
  disk(group, 7, 2.5, brass, [22, 19, -7]);
  sectionTube(group, 5, 4, 2, rim, [-20, 44, -6]);
  sectionTube(group, 5, 4, 2, rim, [22, 44, -7]);
  const feed = new T.CatmullRomCurve3([[-20, 43, 2], [-20, 17, 3], [-18, 7, 4],
    [-11, 0, 5], [-1, -9, 5], [14, -12, 4], [22, -8, 4]].map(vector));
  const exit = new T.CatmullRomCurve3([[14, -11, 4], [23, -7, 3], [23, 10, 1], [22, 42, 0]].map(vector));
  return {group, flows: [tracer(group, feed, 1.03, 6, warmDot, .46), tracer(group, exit, .91, 5, coolDot, .42)], labels: [
    {text: 'Phase boundary', point: [-27, -1.5, 2], side: -1},
    {text: '³He feed', point: [-20, 37, -5], side: -1},
    {text: 'Dilute return', point: [22, 35, -6], side: 1},
  ]};
}

export function still() {
  const group = new T.Group();
  vessel(group, 48, 52);
  disk(group, 44.9, 17, cool, [0, -13, 0], half);
  disk(group, 44.6, 14, cavity, [0, 12, -1.5], [pi / 2 + .07, pi - .14]);
  sectionTube(group, 10, 8.4, 44, lightSteel, [0, 43, 0], half);
  sectionTube(group, 16, 8.4, 3, darkSteel, [0, 65, 0], half);
  sectionTube(group, 21, 4, 2, copper, [0, 15, 0], half);
  sectionTube(group, 5, 3.8, 21, brass, [27, 32, -9]);
  sectionTube(group, 5, 3.8, 25, copper, [-23, -29, -5]);
  const turns = 7;
  const pitchHeight = 13;
  const coilRadius = Math.sqrt(1200 ** 2 - pitchHeight ** 2) / (full * turns);
  helix(group, [0, -12, 0], coilRadius, pitchHeight, turns, .5, rim);
  const vapor = new T.CatmullRomCurve3([[18, -4, 2], [11, 5, 1], [3, 23, 1], [2, 58, 1]].map(vector));
  const liquid = new T.CatmullRomCurve3([[-22, -40, 3], [-23, -21, 3], [-15, -10, 4], [7, -7, 2]].map(vector));
  return {group, flows: [tracer(group, vapor, .9, 7, warmDot, .5), tracer(group, liquid, .8, 5, coolDot, .34)], labels: [
    {text: 'To room-temperature pumps', point: [9, 57, 0], side: 1},
    {text: 'Immersed feed coil', point: [24, -12, 6], side: 1},
    {text: 'From mixing chamber', point: [-23, -37, -4], side: -1},
  ]};
}
