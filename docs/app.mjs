import * as T from './vendor/three.module.min.js';
import * as models from './models.mjs';

const views = {
  cryostat: {size: 1540, width: 660, center: [0, 47, 0], yaw: .28, pitch: .11},
  pulse: {size: 535, width: 345, center: [0, 35, 8], yaw: .46, pitch: .15},
  exchange: {size: 9.7, width: 11, center: [0, 0, 0], yaw: .22, pitch: 1.40},
  mixing: {size: 97, width: 126, center: [0, 12, 0], yaw: .28, pitch: .24},
  still: {size: 126, width: 125, center: [0, 13, 0], yaw: .26, pitch: .13},
};
const axialView = {size: 620, width: 140, center: [0, 0, 0], yaw: .30, pitch: .11};
const stageNotes = [
  'The room-temperature flange seals the vacuum vessel and carries the service feedthroughs.',
  'The first pulse-tube stage cools a radiation shield and intercepts heat on incoming lines.',
  'The second pulse-tube stage anchors the inner shield and chills the gas on the condensing line.',
  'Pumping above the liquid in the still preferentially removes ³He and drives circulation.',
  'The cold plate intercepts heat from wiring and supports the low-temperature heat exchangers.',
  '³He crosses a liquid–liquid phase boundary here, taking up heat from the experiment below.',
];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));

function addLights(scene) {
  scene.add(new T.HemisphereLight(0xfff8ea, 0x9ba9ba, 2.25));
  for (const [color, strength, position] of [
    [0xfff2df, 2.75, [3, 6, 4]],
    [0xd4e8ff, 1.57, [-5, 1, 1]],
    [0xffe6bf, 1.95, [2, 3, -5]],
  ]) {
    const light = new T.DirectionalLight(color, strength);
    light.position.set(...position);
    scene.add(light);
  }
}

function makeLabels(viewport, data) {
  const layer = document.createElement('div');
  layer.className = 'model-labels';
  layer.setAttribute('aria-hidden', 'true');
  viewport.append(layer);
  return data.map(({text, point, ...options}) => {
    const label = document.createElement('div');
    label.className = 'model-label';
    const tag = document.createElement('span');
    tag.textContent = text;
    tag.className = 'label-tag';
    const line = document.createElement('span');
    line.className = 'label-line';
    const dot = document.createElement('span');
    dot.className = 'label-dot';
    label.append(line, dot, tag);
    layer.append(label);
    return {label, tag, dot, line, text, point: new T.Vector3(...point), ...options};
  });
}

function drawLabels(state, width, height) {
  const labelSpace = state.kind === 'cryostat' ? 510 : 400;
  for (const item of state.labels) {
    const {label, tag, line, dot, point, side, interior, text, short = text, offset = 0} = item;
    const projected = point.clone().project(state.camera);
    const x = width * (.5 + projected.x / 2);
    const y = height * (.5 - projected.y / 2);
    label.hidden = !state.annotate || (interior && (state.model.closed.visible || Math.cos(state.yaw) < .18)) ||
      (state.kind === 'exchange' && !state.model.end.visible) || x < 13 || x > width - 13 || y < 29 || y > height - 24;
    if (label.hidden) continue;
    const compact = width < labelSpace;
    const showText = !compact || state.kind === 'cryostat';
    const caption = compact ? short : text;
    if (tag.textContent !== caption) tag.textContent = caption;
    tag.hidden = !showText;
    line.hidden = !showText;
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    if (!showText) continue;
    const tagWidth = tag.offsetWidth;
    const preferred = x + side * (state.kind === 'cryostat' && !compact ? 57 : 23);
    const end = side === 1 ? clamp(preferred, 12, width - tagWidth - 11) :
      clamp(preferred, tagWidth + 11, width - 12);
    if (side * (end - x) < 8) {
      tag.hidden = true;
      line.hidden = true;
      continue;
    }
    const labelY = clamp(y + offset, 37, height - 33);
    tag.style.left = (end - (side === -1 ? tagWidth : 0)) + 'px';
    tag.style.top = labelY + 'px';
    line.style.left = x + 'px';
    line.style.top = y + 'px';
    line.style.width = Math.hypot(end - x, labelY - y) + 'px';
    line.style.transform = 'rotate(' + Math.atan2(labelY - y, end - x) + 'rad)';
  }
}

function cameraAt(state) {
  const width = state.viewport.clientWidth;
  const height = state.viewport.clientHeight;
  if (!height || !width) return;
  const {renderer, camera, config} = state;
  if (state.width !== width || state.height !== height) {
    renderer.setSize(width, height, false);
    state.width = width;
    state.height = height;
  }
  const aspect = width / height;
  const vertical = Math.max(config.size, config.width / aspect) / (2 * state.zoom);
  camera.top = vertical;
  camera.bottom = -vertical;
  camera.left = -vertical * aspect;
  camera.right = vertical * aspect;
  camera.near = 1;
  camera.far = config.size * 6;
  const center = new T.Vector3(...config.center);
  const distance = config.size * 2;
  camera.position.set(
    center.x + distance * Math.sin(state.yaw) * Math.cos(state.pitch),
    center.y + distance * Math.sin(state.pitch),
    center.z + distance * Math.cos(state.yaw) * Math.cos(state.pitch),
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  if (state.scaleRule) {
    state.scaleRule.firstElementChild.style.width = (100 * height / (2 * vertical)) + 'px';
  }
}

function draw(state, now = performance.now()) {
  if (!state.viewport.clientHeight || !state.viewport.clientWidth) return;
  cameraAt(state);
  for (const {route, particles, speed} of state.model.flows ?? []) {
    particles.forEach((part, i) => {
      part.visible = state.flow;
      if (state.flow) {
        const elapsed = motionPreference.matches ? 0 : now / 1000 * speed;
        route.getPointAt((elapsed + i / particles.length) % 1, part.position);
      }
    });
  }
  state.renderer.render(state.scene, state.camera);
  drawLabels(state, state.width, state.height);
}

function resetCamera(state, config = state.config) {
  state.config = config;
  state.yaw = config.yaw;
  state.pitch = config.pitch;
  state.zoom = 1;
  draw(state);
}

function zoom(state, scale) {
  state.zoom = clamp(state.zoom * scale, .66, state.kind === 'exchange' && !state.model.end.visible ? 80 : 3.4);
  draw(state);
}

function orbit(state, dx, dy) {
  state.yaw -= dx;
  state.pitch = clamp(state.pitch + dy, -1.52, 1.52);
  draw(state);
}

function addViewportInput(state, canvas) {
  const pointers = new Map();
  const pinchDistance = () => {
    if (pointers.size !== 2) return 0;
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    state.viewport.focus({preventScroll: true});
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const before = pinchDistance();
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (before > 0) {
      zoom(state, pinchDistance() / before);
    } else if (pointers.size === 1) {
      orbit(state, (event.clientX - previous.x) * .009, (event.clientY - previous.y) * .009);
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, release);
  }
  canvas.addEventListener('wheel', (event) => {
    if (document.activeElement !== state.viewport && !event.ctrlKey) return;
    event.preventDefault();
    zoom(state, Math.exp(-event.deltaY * (event.deltaMode === 1 ? .055 : .0016)));
  }, {passive: false});
  state.viewport.addEventListener('keydown', (event) => {
    const actions = {
      ArrowLeft: () => orbit(state, .15, 0),
      ArrowRight: () => orbit(state, -.15, 0),
      ArrowUp: () => orbit(state, 0, .15),
      ArrowDown: () => orbit(state, 0, -.15),
      '+': () => zoom(state, 1.15),
      '=': () => zoom(state, 1.15),
      '-': () => zoom(state, 1 / 1.15),
      Home: () => resetCamera(state),
    };
    if (event.target === state.viewport && Object.hasOwn(actions, event.key)) {
      event.preventDefault();
      actions[event.key]();
    }
  });
}

function addZoomControls(state) {
  const cluster = document.createElement('div');
  cluster.className = 'zoom-controls';
  for (const [label, name, scale] of [['−', 'Zoom out', 1 / 1.25], ['+', 'Zoom in', 1.25]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', name);
    button.addEventListener('click', () => zoom(state, scale));
    cluster.append(button);
  }
  state.viewport.append(cluster);
}

function stageSelection(card, state) {
  const buttons = Array.from(card.querySelectorAll('[data-stage]'));
  const detail = card.querySelector('.stage-detail');
  const empty = detail.textContent;
  let active = -1;
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.stage);
      active = index === active ? -1 : index;
      buttons.forEach((item, i) => item.setAttribute('aria-pressed', String(active === i)));
      detail.textContent = stageNotes[active] ?? empty;
      if (!state) return;
      if (active >= 0 && state.model.closed.visible) card.querySelector('[data-shell]').click();
      if (active >= 0 && (Math.cos(state.yaw) < .22 || state.zoom > 1.4)) resetCamera(state);
      state.model.plates.forEach((plate, i) => {
        plate.emissive.setHex(i === active ? 0xffa447 : 0x000000);
        plate.emissiveIntensity = i === active ? .55 : 0;
      });
      draw(state);
    });
  }
}

function init(viewport) {
  const kind = viewport.dataset.model;
  const card = viewport.closest('.model-card');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({alpha: true, antialias: true});
  } catch {
    viewport.querySelector('.fallback').hidden = false;
    card.querySelectorAll('.model-bar button').forEach((button) => { button.disabled = true; });
    if (kind === 'cryostat') stageSelection(card);
    return;
  }
  const scene = new T.Scene();
  const model = models[kind]();
  if (kind === 'exchange') model.axial.visible = false;
  scene.add(model.group);
  addLights(scene);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0xffffff, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  viewport.querySelector('.viewport-art').append(canvas);
  const state = {
    kind, viewport, renderer, scene, model,
    camera: new T.OrthographicCamera(),
    labels: makeLabels(viewport, model.labels),
    scaleRule: viewport.querySelector('.scale-rule'),
    annotate: true,
    flow: true,
  };

  if (state.scaleRule) state.scaleRule.hidden = false;
  addViewportInput(state, canvas);
  addZoomControls(state);
  card.querySelector('[data-reset]').addEventListener('click', () => resetCamera(state));
  const annotations = card.querySelector('[data-annotations]');
  annotations?.addEventListener('click', () => {
    state.annotate = !state.annotate;
    annotations.setAttribute('aria-pressed', String(state.annotate));
    draw(state);
  });
  const shell = card.querySelector('[data-shell]');
  shell?.addEventListener('click', () => {
    model.closed.visible = !model.closed.visible;
    shell.setAttribute('aria-pressed', String(!model.closed.visible));
    shell.textContent = model.closed.visible ? 'Cutaway off' : 'Cutaway on';
    draw(state);
  });
  const cross = card.querySelector('[data-cross]');
  cross?.addEventListener('click', () => {
    model.end.visible = !model.end.visible;
    model.axial.visible = !model.end.visible;
    cross.setAttribute('aria-pressed', String(model.end.visible));
    cross.textContent = model.end.visible ? 'Cross-section' : 'Length view';
    resetCamera(state, model.end.visible ? views.exchange : axialView);
  });
  const flow = card.querySelector('[data-flow]');
  flow?.addEventListener('click', () => {
    state.flow = !state.flow;
    flow.setAttribute('aria-pressed', String(state.flow));
    flow.textContent = state.flow ? 'Flow on' : 'Flow off';
    draw(state);
  });
  if (kind === 'cryostat') stageSelection(card, state);
  new ResizeObserver(() => draw(state)).observe(viewport);
  resetCamera(state, views[kind]);

  if (model.flows) {
    let visible = false;
    let frame = null;
    const update = (now) => {
      frame = null;
      draw(state, now);
      animate();
    };
    const animate = () => {
      if (visible && state.flow && !motionPreference.matches && frame === null) {
        frame = requestAnimationFrame(update);
      }
    };
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      animate();
    }).observe(viewport);
    flow.addEventListener('click', animate);
    motionPreference.addEventListener('change', () => {
      draw(state);
      animate();
    });
  }
}

const lazy = new IntersectionObserver((entries, observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    init(entry.target);
  }
}, {rootMargin: '300px'});
for (const viewport of document.querySelectorAll('[data-model]')) {
  if (viewport.dataset.model === 'cryostat') init(viewport);
  else lazy.observe(viewport);
}
