import { radians, degrees, refractedAngle, pinDeviation, imageDistance, focalLength, wavelength, slitWidth, summary, regression } from './physics.js';
import { createCamera, drawScene } from './scene.js';

const $ = id => document.getElementById(id);
const canvas = $('bench');
const ctx = canvas.getContext('2d');
let benchZoom = 1;
const benchCenterX = canvas.width / 2;
const benchCenterY = canvas.height / 2;
const graph = $('graph').getContext('2d');
const fmt = (n, digits = 3) => Number.isFinite(n) ? +n.toFixed(digits) : '—';
const sin = angle => Math.sin(radians(angle));
const distance = ([x, y], [a, b]) => Math.hypot(x - a, y - b);
const angle = ([x, y], [a, b]) => degrees(Math.atan2(b - y, a - x));
const titles = { refraction: '折射率的測定', lens: '薄透鏡成像', slit: '光的干涉與繞射' };
const media = { water: '水', salt: '鹽水', glass: '玻璃磚' };
const configurations = {
  refraction: { medium: 'water', view: 0, px: 130, py: 65, phase: 'setup', pins: [], traced: false },
  lens: { lens: 'convex', p: 30, screen: 20, reference: 8, eye: 0, mounted: false, direction: 'near', first: null },
  slit: { plate: 'double', color: 'red', spacing: .25, variant: 1, L: 1.5, laser: false, mounted: false, a: 0, b: 1, marks: [] }
};
const columns = {
  refraction: [['i', '入射角 θi（°）'], ['r', '折射角 θr（°）'], ['si', 'sin θi'], ['sr', 'sin θr'], ['result', '折射率 n']],
  lens: [['p', '物距 p（cm）'], ['q', '像距 q（cm）'], ['ip', '1/p（cm⁻¹）'], ['iq', '1/q（cm⁻¹）'], ['result', '焦距 f（cm）']],
  slit: [['L', '屏距 L（m）'], ['dy', '暗紋距離（cm）'], ['spacing', '雙狹縫間距（mm）'], ['lambda', '波長（nm）'], ['width', '單狹縫寬度（mm）']]
};
const defaultAxes = { refraction: ['sr', 'si'], lens: ['ip', 'iq'], slit: ['L', 'dy'] };
const convertedAxes = {
  refraction: [['iRad', '入射角 θi（rad）', row => radians(row.i)], ['rRad', '折射角 θr（rad）', row => radians(row.r)]],
  lens: [['pMeter', '物距 p（m）', row => row.p / 100], ['qMeter', '像距 q（m）', row => row.q / 100]],
  slit: [['Lcm', '屏距 L（cm）', row => row.L * 100], ['dyMm', '暗紋距離（mm）', row => row.dy * 10]]
};
const axes = () => [...columns[id], ...convertedAxes[id]];
function newState(id) {
  const [x, y] = defaultAxes[id];
  return { setup: structuredClone(configurations[id]), rows: [], events: [], analysis: '', graph: { x, y, group: '', xmin: '', xmax: '', ymin: '', ymax: '', xtick: '', ytick: '', trend: false } };
}
let states = Object.fromEntries(Object.keys(titles).map(id => [id, newState(id)]));
let id = 'refraction';
const initialCamera = { mode: 'orbit', yaw: -.27, pitch: .57 };
const cameras = Object.fromEntries(Object.keys(titles).map(key => [key, { ...initialCamera }]));
const cameraState = () => cameras[id];
const cameraProjection = () => createCamera(cameraState().yaw, cameraState().pitch);
let exam = null;
let assessmentState;
let practiceId = id;
let locked = false;
const current = () => exam ? assessmentState : states[id];
const setup = () => current().setup;
const seed = () => Number(exam?.seed || 0) % 7;

function el(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  Object.assign(node, attributes);
  return node;
}
function field(parent, caption, node) {
  const label = el('label', caption);
  node.setAttribute('aria-label', caption);
  label.append(node);
  parent.append(label);
  return node;
}
function select(parent, caption, options, value, change) {
  const node = field(parent, caption, el('select', null));
  for (const [key, label] of options) node.append(el('option', label, { value: key }));
  node.value = value;
  node.addEventListener('change', () => change(node.value));
  return node;
}
function input(parent, caption, value, options, change) {
  const node = field(parent, caption, el('input', null, { value, ...options }));
  node.addEventListener('input', () => change(node.value));
  return node;
}
function button(parent, caption, click) {
  const node = el('button', caption, { type: 'button' });
  node.addEventListener('click', click);
  parent.append(node);
  return node;
}
function event(type, detail = {}) {
  const events = current().events;
  if (events.length < 300) events.push({ type, ...detail });
}
function changed() { document.dispatchEvent(new Event('lab-change')); }
function action(type, detail) { event(type, detail); render(); changed(); }
function message(text, reason = '') {
  $('feedback').textContent = text;
  $('feedback-reason').open = false;
  $('feedback-reason').hidden = !reason;
  $('feedback-explanation').textContent = reason;
}
function setting(parent, key, label, min, max, step = 1) {
  const control = input(parent, label, setup()[key], { type: 'range', min, max, step }, value => {
    setup()[key] = +value;
    drawBench();
    changed();
  });
  control.addEventListener('change', () => { event('adjust', { control: label, value: setup()[key] }); changed(); });
}
function numeric(parent, key, label, value = '') {
  return input(parent, label, setup().readings?.[key] ?? value, { type: 'number', step: 'any', id: key }, value => {
    (setup().readings ??= {})[key] = value;
    changed();
  });
}
function angleReading(parent, key, label, notation) {
  const control = numeric(parent, key, label);
  control.min = 0;
  control.max = 90;
  const result = el('output', null);
  result.setAttribute('for', control.id);
  control.parentElement.append(result);
  const update = () => {
    const angle = control.valueAsNumber;
    result.value = notation + ' = ' + (angle >= 0 && angle <= 90 ? sin(angle).toFixed(5) : '—');
  };
  control.addEventListener('input', update);
  update();
}
function readings(...keys) {
  return keys.map(key => {
    const node = $(key);
    return node.value.trim() === '' ? NaN : node.valueAsNumber;
  });
}
function line(context, a, b, color = '#315d57', width = 1, dash = []) {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.beginPath();
  context.moveTo(...a);
  context.lineTo(...b);
  context.stroke();
  context.setLineDash([]);
}
function label(context, text, x, y, color = '#17322e') {
  context.fillStyle = color;
  context.font = '14px "Microsoft JhengHei", sans-serif';
  context.fillText(text, x, y);
}
function point(context, [x, y], color, radius = 4) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
}

const origin = [300, 145];
const farFace = 405;
function pinInterface(s) {
  if (s.medium !== 'glass') return null;
  return [null, origin[0], farFace][s.pins.length] ?? null;
}
function rays() {
  const s = setup();
  const glass = s.medium === 'glass';
  const a = s.pins[0], b = glass ? s.pins[1] : origin;
  if (!a || !b) return null;
  const i = angle(a, b);
  const n = { water: 1.333, salt: 1.36, glass: 1.50 }[s.medium] + seed() * .002;
  const r = refractedAngle(i, n);
  const exit = glass ? [farFace, b[1] + (farFace - b[0]) * Math.tan(radians(r))] : origin;
  const out = glass ? i : r;
  return { i, r, exit, out };
}
function pin(position) {
  const s = setup();
  if (s.phase !== 'pins') return message('先配置方格紙與待測介質。');
  const glass = s.medium === 'glass';
  const index = s.pins.length;
  let [x, y] = position;
  if (index >= (glass ? 4 : 2)) return message('本次針位已完成，可撤回末針或移走介質。');
  if (index === 0 && x >= origin[0] - 5) return message('請將 A 針放在入射面左側。');
  if (glass && index === 1) {
    if (Math.abs(x - origin[0]) > 20 || distance(s.pins[0], [origin[0], y]) < 6) return message('B 針應放在左界面上，並與 A 針分開。');
    x = origin[0];
  }
  if (glass && index === 2) {
    if (Math.abs(x - farFace) > 20) return message('C 針應放在右界面上。');
    x = farFace;
  }
  if ((!glass && index === 1 && x < 440) || (glass && index === 3 && x <= farFace + 2)) {
    return message('請在介質右側的觀察區插針。');
  }
  s.pins.push([x, y]);
  action('place-pin', { medium: s.medium, position: [x, y], index, view: s.view });
}
function observerGuide(view, glass, start) {
  const theta = radians(view);
  const vertical = Math.sin(theta);
  const edge = vertical < 0 ? 22 : 278;
  const room = vertical ? (edge - start[1]) / vertical : Infinity;
  const radius = glass ? Math.max(18, Math.min(260, room)) : Math.min(360, room);
  const eye = [start[0] + radius * Math.cos(theta), start[1] + radius * vertical];
  return { start, eye, theta };
}
function updatePinView() {
  const s = setup();
  if (s.phase !== 'pins') return null;
  const glass = s.medium === 'glass';
  const ray = rays();
  const view = glass ? s.view : Math.max(-55, Math.min(55, s.view));
  const shift = ray ? Math.tan(radians(view)) - Math.tan(radians(ray.out)) : 0;
  const exitY = ray ? ray.exit[1] + shift * 42 : origin[1];
  const start = glass ? [farFace, Math.max(35, Math.min(265, exitY))] : origin;
  if (ray) {
    $('pin-view').hidden = false;
    $('pin-image').style.left = (50 + Math.max(-45, Math.min(45, 38 * shift))) + '%';
    $('pin-caption').textContent = `橘點是 A 針像，深色點是${glass ? ' B 針像' : '圓心 O 針'}。移動人眼，讓兩點重疊。`;
  }
  return observerGuide(view, glass, start);
}
function drawObserver({ start, eye, theta }) {
  line(ctx, start, eye, '#257385', 2, [6, 5]);
  ctx.save();
  ctx.translate(...eye);
  ctx.rotate(theta);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#174f63';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.quadraticCurveTo(0, -15, 13, 0);
  ctx.quadraticCurveTo(0, 15, -13, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  point(ctx, [-3, 0], '#174f63', 4);
  ctx.restore();
  label(ctx, '人眼', eye[0] + 16, Math.max(18, Math.min(286, eye[1] + 5)), '#174f63');
}
function drawRefraction(guide) {
  const s = setup();
  const glass = s.medium === 'glass';
  for (let x = 0; x < 720; x += 15) line(ctx, [x, 0], [x, 300], '#d7e6dc');
  for (let y = 0; y < 300; y += 15) line(ctx, [0, y], [720, y], '#d7e6dc');
  const axis = '#365e86';
  line(ctx, [0, 0], [104, 0], axis, 3);
  line(ctx, [0, 0], [0, 103], axis, 3);
  line(ctx, [104, 0], [96, 6], axis, 2);
  line(ctx, [0, 103], [6, 96], axis, 2);
  label(ctx, '(0, 0)', 9, 20, axis);
  label(ctx, 'X', 109, 17, axis);
  label(ctx, 'Y', 9, 109, axis);
  if (s.phase === 'pins') {
    ctx.fillStyle = '#a6d7e5aa';
    if (glass) ctx.fillRect(300, 10, 105, 280);
    else {
      ctx.beginPath();
      ctx.arc(...origin, 135, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
    }
  }
  if (s.phase !== 'setup') {
    line(ctx, [300, 10], [300, 290], '#21676e', 2);
    if (glass) line(ctx, [405, 10], [405, 290], '#21676e', 2);
    else { point(ctx, origin, '#263c36'); label(ctx, 'O', 309, 140); }
  }
  const names = glass ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
  s.pins.forEach((coordinate, index) => {
    point(ctx, coordinate, '#913a24', 5);
    label(ctx, names[index], coordinate[0] + 8, coordinate[1] - 8);
  });
  if (guide) drawObserver(guide);
  if (s.traced) {
    const [a, b, c, d] = s.pins;
    const entry = glass ? b : origin;
    const exit = glass ? c : b;
    line(ctx, a, entry, '#bf4a24', 3);
    line(ctx, entry, exit, '#bf4a24', 3);
    if (glass) line(ctx, c, d, '#bf4a24', 3);
    line(ctx, [120, entry[1]], [520, entry[1]], '#527e74', 1, [5, 5]);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const side of [-1, 1]) {
      for (let tick = -80; tick <= 80; tick += 5) {
        const at = r => [entry[0] + side * r * Math.cos(radians(tick)), entry[1] + r * sin(tick)];
        line(ctx, at(tick % 10 ? 61 : 56), at(67), '#527e74');
        if (tick % 20 === 0) {
          const [x, y] = at(82);
          ctx.fillStyle = '#f2f7f4';
          ctx.fillRect(x - 10, y - 8, 20, 16);
          label(ctx, Math.abs(tick), x, y);
        }
      }
    }
    ctx.restore();
  }
}
function arrow(context, x, y, h, color) {
  line(context, [x, y], [x, y - h], color, 4);
  const sign = Math.sign(h);
  line(context, [x - 7, y - h + 9 * sign], [x, y - h], color, 3);
  line(context, [x + 7, y - h + 9 * sign], [x, y - h], color, 3);
}
const lensF = () => setup().lens === 'convex' ? 15 + seed() * .2 : -15 - seed() * .2;
function drawLens() {
  const s = setup();
  const convex = s.lens === 'convex';
  const q = imageDistance(s.p, lensF());
  const x = cm => 315 + cm * 4.3;
  line(ctx, [25, 150], [698, 150], '#87a69a', 1, [5, 5]);
  line(ctx, [25, 229], [698, 229], '#315d57', 3);
  for (let cm = -60; cm <= 85; cm += 5) {
    line(ctx, [x(cm), 229], [x(cm), 237], '#315d57');
    if (cm % 10 === 0) label(ctx, cm, x(cm) - 9, 255);
  }
  if (s.mounted) {
    arrow(ctx, x(-s.p), 150, 48, '#a65625');
    line(ctx, [315, 67], [315, 211], '#347594', 5);
    label(ctx, convex ? '凸透鏡' : '凹透鏡', 290, 54);
    if (convex) {
      line(ctx, [x(s.screen), 91], [x(s.screen), 225], '#477963', 5);
      if (q > 0 && Number.isFinite(q)) {
        ctx.save();
        ctx.globalAlpha = Math.max(.12, 1 - Math.abs(q - s.screen) / 50);
        ctx.filter = 'blur(' + Math.min(10, Math.abs(q - s.screen) * .55) + 'px)';
        arrow(ctx, x(s.screen), 150, -Math.min(62, 48 * q / s.p), '#a65625');
        ctx.restore();
      }
    } else {
      line(ctx, [x(-s.reference), 93], [x(-s.reference), 225], '#86633c', 3);
      label(ctx, '凹透鏡後方看到的像', 491, 44);
      arrow(ctx, 597, 147, 30, '#a65625');
      const displacement = (s.reference + q) * s.eye * 1.3;
      line(ctx, [597 + displacement, 99], [597 + displacement, 123], '#86633c', 4);
    }
  }
}
function drawLensEye(s, q) {
  if (!s.mounted) return;
  point(ctx, [360,157], '#d5eaf0', 94);
  ctx.strokeStyle = '#337591';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(360,157,94,0,Math.PI*2);
  ctx.stroke();
  const shift = Math.max(-115, Math.min(115, (s.reference + q) * s.eye * 3));
  arrow(ctx, 360, 218, 81, '#a65625');
  line(ctx, [360 + shift, 27], [360 + shift, 106], '#86633c', 5);
  line(ctx, [360, 106], [360, 235], '#a65625', 1, [3, 5]);
  label(ctx, '參考物上緣', 390 + Math.max(0, shift), 40);
  label(ctx, '凹透鏡內的正立虛像', 481, 179);
}
const laserWavelength = () => (setup().color === 'red' ? 650 : 532) + seed();
const realWidth = () => setup().variant === 1 ? .10 : .16;
const slitInterval = s => laserWavelength() * s.L / (10000 * (s.plate === 'double' ? s.spacing : realWidth()));
const screenX = cm => 360 + cm * 95;
function drawSlit() {
  const s = setup();
  const double = s.plate === 'double';
  const dy = slitInterval(s);
  label(ctx, '雷射', 37, 49);
  label(ctx, double ? '雙狹縫' : '單狹縫', 270, 49);
  label(ctx, '屏幕', 649, 49);
  line(ctx, [55, 68], [670, 68], s.laser && s.mounted ? (s.color === 'red' ? '#ac2422' : '#25854d') : '#a3bbae', 3);
  ctx.fillStyle = '#172528';
  ctx.fillRect(0, 93, 720, 142);
  if (s.laser && s.mounted) {
    for (let x = 0; x < 720; x++) {
      const phase = Math.PI * (x - 360) / (95 * dy);
      const intensity = double ? Math.cos(phase) ** 2 : phase === 0 ? 1 : (Math.sin(phase) / phase) ** 2;
      ctx.fillStyle = (s.color === 'red' ? 'rgba(255,94,71,' : 'rgba(90,255,137,') + intensity ** .62 + ')';
      ctx.fillRect(x, 93, 1, 142);
    }
  }
  for (let tenth = -37; tenth <= 37; tenth++) {
    const x = screenX(tenth / 10);
    line(ctx, [x, 235], [x, tenth % 5 ? 242 : 249], '#315d57');
    if (tenth % 5 === 0) label(ctx, tenth / 10, x - 8, 268);
  }
  s.marks.forEach((cm, i) => {
    line(ctx, [screenX(cm), 93], [screenX(cm), 250], '#ffdb76', 2, [4, 4]);
    label(ctx, i ? 'B' : 'A', screenX(cm) + 5, 112, '#ffdb76');
  });
}
function benchReadout(s, mode) {
  const controls = mode !== 'orbit' ? '' : matchMedia('(pointer: coarse)').matches
    ? '左右滑動可旋轉實驗台，上下滑動可捲動頁面。'
    : '拖曳或按方向鍵旋轉實驗台。';
  if (id === 'refraction') {
    if (s.traced) return controls + (mode === 'orbit' ? '切到「俯視量角」讀取入射角和折射角。' : '以虛線法線為 0°，讀取入射線與介質內折射線的角度。');
    return controls + (s.phase === 'pins' ? '點擊方格紙放針。插針座標從方格紙左上角 (0, 0) 起算。藍色虛線是人眼的視線，可用「觀察角」調整。' : '先選待測介質，再配置器材。');
  }
  if (id === 'lens') {
    if (!s.mounted) return controls + '先把器材裝上光具座。';
    return controls + (s.lens === 'convex'
      ? `光具座座標｜光源 ${-s.p} cm、透鏡 0 cm、像屏 ${s.screen} cm。切到「側視讀尺」查看光具座刻度和像的清晰度。`
      : `光具座座標｜光源 ${-s.p} cm、透鏡 0 cm、參考物 ${-s.reference} cm、視點 ${s.eye}。` +
        (mode === 'eye' ? '左右移動視點，調整參考物，直到參考物與虛像始終上下對齊。' : '切到「透鏡後方」觀察視差。'));
  }
  return controls + `狹縫到屏幕 ${s.L} m` + (s.plate === 'double' ? `｜狹縫間距 ${s.spacing} mm` : '') +
    (s.marks.length ? `｜游標 ${s.marks.map(n => fmt(n, 2)).join('、')} cm` : '') +
    (mode === 'orbit' ? '。切到「屏幕正視」可用尺標量暗紋距離。' : '。屏幕刻度單位為 cm。');
}
function benchFrame(s, mode) {
  if (id !== 'refraction' || mode !== 'top' || !s.traced) {
    return { x: benchCenterX, y: benchCenterY, scale: benchZoom };
  }
  const [entryX, entryY] = s.medium === 'glass' ? s.pins[1] : origin;
  const radius = 94;
  const xs = s.pins.map(([x]) => x);
  const ys = s.pins.map(([, y]) => y);
  const left = Math.min(entryX - radius, ...xs.map(x => x - 12));
  const right = Math.max(entryX + radius, ...xs.map(x => x + 20));
  const top = Math.min(entryY - radius, ...ys.map(y => y - 23));
  const bottom = Math.max(entryY + radius, ...ys.map(y => y + 12));
  const padding = 14;
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    scale: Math.min(benchZoom, (canvas.width - 2 * padding) / (right - left),
      (canvas.height - 2 * padding) / (bottom - top))
  };
}
function drawBench() {
  const s = setup();
  const { mode } = cameraState();
  const frame = benchFrame(s, mode);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(benchCenterX, benchCenterY);
  ctx.scale(frame.scale, frame.scale);
  ctx.translate(-frame.x, -frame.y);
  $('pin-view').hidden = true;
  const guide = id === 'refraction' ? updatePinView() : null;
  canvas.dataset.view = mode;
  if (mode === 'orbit') {
    drawScene(ctx, cameraProjection(), id, s, {
      guide,
      q: id === 'lens' ? imageDistance(s.p, lensF()) : null,
      interval: id === 'slit' ? slitInterval(s) : null
    });
  } else if (id === 'refraction') drawRefraction(guide);
  else if (id === 'lens' && mode === 'eye') drawLensEye(s, imageDistance(s.p, lensF()));
  else if (id === 'lens') drawLens();
  else drawSlit();
  ctx.restore();
  $('readout').textContent = benchReadout(s, mode);
}

function refractionTools(tools, reading) {
  const s = setup();
  select(tools, '待測介質', Object.entries(media), s.medium, medium => {
    Object.assign(s, structuredClone(configurations.refraction), { medium });
    action('select-medium', { medium });
  });
  button(tools, '配置器材／重做', () => {
    Object.assign(s, { phase: 'pins', pins: [], traced: false, view: 0, readings: {} });
    action('prepare-refraction', { medium: s.medium });
  });
  if (s.phase === 'pins') {
    const limit = s.medium === 'glass' ? 75 : 55;
    const next = (s.medium === 'glass' ? ['A', 'B', 'C', 'D'] : ['A', 'B'])[s.pins.length];
    const fixedX = pinInterface(s);
    const hint = fixedX === null ? '' : `｜玻璃磚${next === 'B' ? '左' : '右'}界面（X = ${fixedX}），可調整 Y。`;
    if (!exam) tools.append(el('p', next ? `下一支長針：${next}${hint}` : '長針已放齊，可以移去介質並畫線。', { className: 'pin-progress', role: 'status' }));
    setting(tools, 'view', '觀察角（°）', -limit, limit);
    const outside = next === 'D' || (next === 'B' && s.medium !== 'glass');
    const initialX = fixedX ?? (outside && s.px < 440 ? 470 : s.px);
    const xInput = input(tools, '插針 X', initialX, { type: 'number', min: 0, max: 720, readOnly: fixedX !== null }, value => { s.px = +value; changed(); });
    const yInput = input(tools, '插針 Y', s.py, { type: 'number', min: 0, max: 300 }, value => { s.py = +value; changed(); });
    button(tools, '在座標處插針', () => {
      const x = xInput.valueAsNumber;
      const y = yInput.valueAsNumber;
      if (!(x >= 0 && x <= 720 && y >= 0 && y <= 300)) return message('請在方格紙範圍內插針。');
      pin([x, y]);
    });
    button(tools, '撤回末針', () => { s.pins.pop(); action('remove-pin'); });
    button(tools, '移去介質並畫線', () => {
      if (s.pins.length !== (s.medium === 'glass' ? 4 : 2)) return message('請先完成所有針位。');
      Object.assign(s, { phase: 'trace', traced: true });
      action('trace-rays', { pins: s.pins });
    });
  }
  if (!exam && s.medium === 'glass') {
    const d = numeric(tools, 'baseline', '比較針距（格）', 3);
    button(tools, '查看針距影響', () => {
      if (!(d.valueAsNumber >= .5 && d.valueAsNumber <= 10)) return message('請輸入 0.5 到 10 格的針距。');
      const baseline = d.valueAsNumber;
      const n = length => sin(40 + pinDeviation(length, .15)) / sin(refractedAngle(40, 1.5));
      message(`同樣偏移 0.15 格｜${baseline} 格：方向偏差 ${fmt(pinDeviation(baseline, .15))}°，估計 n 為 ${fmt(n(baseline))}；${2 * baseline} 格：${fmt(pinDeviation(2 * baseline, .15))}°，n 為 ${fmt(n(2 * baseline))}。`);
    });
  }
  angleReading(reading, 'incidence', '入射角（°）', 'sin θi');
  angleReading(reading, 'refraction', '折射角（°）', 'sin θr');
  numeric(reading, 'result', '計算折射率');
}
function lensTools(tools, reading) {
  const s = setup();
  select(tools, '透鏡', [['convex', '凸透鏡'], ['concave', '凹透鏡']], s.lens, lens => {
    Object.assign(s, configurations.lens, { lens, readings: {} });
    action('change-lens', { lens });
  });
  button(tools, '裝上光具座', () => { s.mounted = true; action('mount-lens', { lens: s.lens }); });
  if (s.mounted) {
    setting(tools, 'p', '移動光源屏（cm）', s.lens === 'convex' ? 10 : 20, 60);
    if (s.lens === 'convex') {
      setting(tools, 'screen', '移動像屏（cm）', 5, 85, .5);
      button(tools, '像屏移到近端', () => { Object.assign(s, { screen: 5, direction: 'near', first: null }); action('screen-near'); });
      button(tools, '像屏移到遠端', () => { Object.assign(s, { screen: 85, direction: 'far' }); action('screen-far'); });
    } else {
      setting(tools, 'reference', '移動參考物（cm）', 2, 20, .2);
      setting(tools, 'eye', '左右移動視點', -5, 5);
    }
  }
  numeric(reading, 'p', '物距 p（cm）');
  numeric(reading, 'q', '帶正負號的像距 q（cm）');
  numeric(reading, 'result', '計算焦距（cm）');
}
function slitTools(tools, reading) {
  const s = setup();
  select(tools, '雷射', [['red', '紅光'], ['green', '綠光']], s.color, color => {
    Object.assign(s, { color, marks: [] }); action('select-laser', { color });
  });
  select(tools, '狹縫', [['double', '雙狹縫'], ['single', '單狹縫']], s.plate, plate => {
    Object.assign(s, { plate, mounted: false, laser: false, marks: [], readings: {} }); action('swap-plate', { plate });
  });
  if (s.plate === 'double') select(tools, '雙狹縫間距', [['0.25', '0.25 mm'], ['0.50', '0.50 mm']], s.spacing, value => {
    Object.assign(s, { spacing: +value, mounted: false, laser: false, marks: [] }); action('change-spacing', { spacing: s.spacing });
  });
  else select(tools, '單狹縫片', [['1', '甲'], ['2', '乙']], s.variant, value => {
    Object.assign(s, { variant: +value, mounted: false, laser: false, marks: [] }); action('change-single-plate', { plate: s.variant });
  });
  button(tools, '配置雷射、狹縫和屏幕', () => { s.mounted = true; action('align-apparatus'); });
  button(tools, s.laser ? '關閉雷射' : '開啟雷射', () => {
    if (!s.mounted) return message('先配置器材，確認光束由狹縫射向屏幕。');
    s.laser = !s.laser;
    action(s.laser ? 'laser-on' : 'laser-off');
  });
  const position = input(tools, '屏距（m）', s.L, { type: 'range', min: .6, max: 2.5, step: .1 }, value => {
    Object.assign(s, { L: +value, marks: [] });
    drawBench();
    changed();
  });
  position.addEventListener('change', () => { event('adjust-screen-distance', { L: s.L }); changed(); });
  if (s.laser) {
    const a = numeric(tools, 'a', '尺標 A（cm）', s.a);
    const b = numeric(tools, 'b', '尺標 B（cm）', s.b);
    button(tools, '設定兩個尺標', () => {
      if ([a, b].some(node => !Number.isFinite(node.valueAsNumber) || Math.abs(node.valueAsNumber) > 3.78)) return message('尺標須位於屏幕刻度內。');
      Object.assign(s, { a: a.valueAsNumber, b: b.valueAsNumber, marks: [a.valueAsNumber, b.valueAsNumber] });
      action('set-ruler', { marks: s.marks });
    });
  }
  if (s.plate === 'single') {
    select(reading, '量測方法', [['adjacent', '同側相鄰暗紋'], ['central', '中央亮帶全寬']], s.method || 'adjacent', method => { s.method = method; changed(); });
    numeric(reading, 'known', '同色光平均波長（nm）');
  }
  numeric(reading, 'L', '讀取屏距（m）');
  numeric(reading, 'dy', '讀取尺標間距（cm）');
  numeric(reading, 'result', s.plate === 'double' ? '計算波長（nm）' : '計算縫寬（mm）');
}

const steps = {
  liquid: [
    ['將盛水或鹽水的半圓盒放在方格紙上，使盒的直徑與界面線重合。平台已在圓心 O 插好一支垂直於紙面的長針。',
      'O 針標出光線進入液體的位置。從 O 通往圓弧面的光線沿著半徑前進，會垂直射出圓弧面，因此方向不變。'],
    ['在半圓盒直徑面的外側（畫面左側）插入 A 針。第一次可讓 AO 與法線約成 10°。',
      'A 和 O 兩點決定光射入液體前的方向。入射角從垂直於界面的法線量起。'],
    ['從圓弧面外側（畫面右側）觀察。調整「觀察角」，直到 A 針像與 O 針在「從人眼看出去」視窗重疊。沿藍色虛線，在圓弧面外插入 B 針。',
      '兩點重疊代表眼睛沿同一方向看見它們。B 針把這個觀察方向留在方格紙上，方便稍後連出 OB。'],
    ['選擇「移去介質並畫線」，切到「俯視量角」。量 AO、OB 各自與法線的夾角，記為入射角 θi 和折射角 θr。算出 sin θi ÷ sin θr 並記錄。改變 A 針的位置，讓入射角每次約增加 10°，重複量測。',
      '司乃耳定律指出，光從空氣進入同一種液體時，兩角正弦值的比值應接近固定。重複量測可比較各次結果。']
  ],
  glass: [
    ['將玻璃磚平放在方格紙上，沿玻璃磚左右兩側描出界面線。平台在配置器材時會畫出這兩條線。',
      '界面線標記光線進出玻璃的位置，也提供畫法線的基準。'],
    ['先決定左界面上要放 B 針的位置。平台依序放針，請先在該位置的斜左方插 A 針，再於左界面插 B 針。',
      'AB 連線代表入射光線，B 是入射點。A、B 相距較遠時，相同的落針偏差對連線方向的影響較小。'],
    ['從右側透過玻璃磚觀察 A、B。調整「觀察角」，直到兩支針的像重疊。在藍色虛線與右界面的交點插入 C 針，再沿虛線於玻璃磚外插入 D 針。',
      'C 針標出光離開玻璃的位置。沿同一條視線在玻璃外插 D 針，就能在移開玻璃後用 C、D 兩點畫出出射線，並檢查它是否與入射線 AB 平行。若只要量入射角和玻璃內的折射角，用 A、B、C 三支針畫出 AB 和 BC 就夠了。'],
    ['選擇「移去介質並畫線」，切到「俯視量角」。在 B 點量 AB 與法線的夾角作為 θi，再量 BC 與法線的夾角作為 θr。用 sin θi ÷ sin θr 算出玻璃的折射率。',
      'B、C 是光線在玻璃內的兩個端點，所以 BC 才是用來量折射角的路段。CD 可用來檢查出射光的方向。']
  ],
  lens: [
    ['將光源屏和透鏡裝上光具座。使用凸透鏡時裝上像屏，使用凹透鏡時裝上參考物。',
      '凸透鏡所成的實像可用像屏承接，凹透鏡的虛像則用參考物比較位置。'],
    ['測凸透鏡時，先使物距大於焦距。把像屏放在靠近透鏡處，慢慢向外移，直到出現清晰倒立像。讀取並記錄物距與像距，再從遠端往透鏡方向調焦一次。',
      '從兩個方向各找一次清晰位置，可用兩次讀值的平均值估計像距。'],
    ['測凹透鏡時，切到「透鏡後方」。左右移動視點，再調整參考物，直到參考物上緣與虛像在不同視點都上下對齊。',
      '兩者深度不同時，視點改變會讓它們產生相對位移。視差消失時，可用參考物的位置估計虛像位置。'],
    ['從光具座的刻度讀取物距 p 與像距 q。凹透鏡的虛像像距取負。代入 1/f = 1/p + 1/q 求焦距，再改變物距重做。',
      '像距的正負表示像的性質。重複量測可檢查同一片透鏡所得的焦距是否一致。']
  ],
  slit: [
    ['沿光具座依序放置雷射光源、狹縫片和屏幕，使雷射照向狹縫。操作實體器材時，雷射不可對準人眼。',
      '依序對準器材，才能讓通過狹縫的光在屏幕上形成可量測的條紋。'],
    ['裝上雙狹縫，開啟雷射並切到「屏幕正視」。量相鄰兩暗紋的間距 Δy 和狹縫到屏幕的距離 L，代入 λ = d Δy / L。每種顏色改變屏距重複量測五次。',
      '已知雙狹縫間距 d 時，可從暗紋間距反推波長。改變 L 可檢查不同屏距求出的波長是否接近。'],
    ['換上單狹縫，量中央亮帶同一側兩條相鄰暗紋的間距 Δy。用雙狹縫量得的同色光平均波長代入 W = λ L / Δy。若量中央亮帶全寬，將全寬除以二再代入。',
      '中央亮帶跨過中央兩側的第一條暗紋，寬度約為同側相鄰暗紋間距的兩倍。']
  ]
};
let guideKey;
function renderSteps() {
  const key = exam ? exam.prompt || '完成實驗操作，保留原始讀值，並用圖表支持結論。'
    : id === 'refraction' ? (setup().medium === 'glass' ? 'glass' : 'liquid') : id;
  const version = exam ? 'exam:' + key : key;
  if (guideKey === version) return;
  guideKey = version;
  $('steps').replaceChildren(...(exam ? [el('li', key)] : steps[key].map(([instruction, rationale]) => {
    const step = el('li', instruction);
    const details = el('details', null);
    details.append(el('summary', '為什麼要這樣做？'), el('p', rationale));
    step.append(details);
    return step;
  })));
}

function renderViewControls() {
  const controls = $('view-controls');
  controls.replaceChildren();
  const views = {
    refraction: [['top', '俯視量角']],
    lens: [['side', '側視讀尺'], ...(setup().lens === 'concave' ? [['eye', '透鏡後方']] : [])],
    slit: [['screen', '屏幕正視']]
  }[id];
  const camera = cameraState();
  if (camera.mode !== 'orbit' && !views.some(([mode]) => mode === camera.mode)) camera.mode = 'orbit';
  for (const [mode, caption] of [['orbit', '3D 旋轉'], ...views]) {
    const choice = button(controls, caption, () => {
      camera.mode = mode;
      for (const other of controls.querySelectorAll('[data-mode]')) {
        other.setAttribute('aria-pressed', String(other.dataset.mode === mode));
      }
      drawBench();
    });
    choice.dataset.mode = mode;
    choice.setAttribute('aria-pressed', String(camera.mode === mode));
  }
  button(controls, '重設視角', () => {
    Object.assign(camera, initialCamera);
    controls.querySelector('[data-mode=orbit]').click();
  });
}

const analysisExamples = {
  refraction: [
    ['逐筆計算，再比較重複量測', '每筆用 n = sin θi ÷ sin θr 算折射率。若同一介質三次算得 1.31、1.33、1.35，平均為 1.33。平台顯示的 A 類標準不確定度約為 0.012，表示由這組量測的分散程度估計出來的平均值不確定度。'],
    ['用散布圖檢查司乃耳定律', '選 X = sin θr、Y = sin θi，再勾選最小平方法趨勢線。依 sin θi = n sin θr，斜率就是折射率。例如斜率 1.33、截距接近 0，表示這組數據支持兩個正弦值近似成正比。'],
    ['用圖表描述量測差異', '可以這樣寫：「我用折射角正弦作 X 軸、入射角正弦作 Y 軸。斜率約 1.33，所以估計折射率約為 1.33。若針像未完全重疊，畫出的折射線方向就可能偏移。」']
  ],
  lens: [
    ['逐筆算焦距，再比較量測', '用 1/f = 1/p + 1/q。以凸透鏡為例，若 p = 30 cm，兩個方向調焦讀到 q = 29.5 和 30.5 cm，取平均 q = 30.0 cm，算得 f = 15.0 cm。用各組物距各算一次焦距，再比較平均值與 A 類標準不確定度。'],
    ['用倒數作圖，從截距求焦距', '選 X = 1/p、Y = 1/q，啟用趨勢線。因為 1/q = −1/p + 1/f，預期斜率約為 −1，Y 截距等於 1/f。若截距約為 0.0667 cm⁻¹，焦距約為 15.0 cm。凹透鏡的虛像要用負的 q，其截距也應為負。'],
    ['用圖表描述量測差異', '可以這樣寫：「斜率接近 −1，符合成像公式。由截距求得焦距約 15.0 cm。像屏上最清楚的位置有一小段範圍，會讓不同方向調焦得到的像距略有差異。」']
  ],
  slit: [
    ['逐筆計算，再依條件比較', '雙狹縫用 λ = d Δy/L 求波長，同一顏色、同一狹縫片的重複量測可求平均與 A 類標準不確定度。單狹縫用同色光的平均波長代入 W = λL/Δy 求縫寬。若量的是中央亮帶全寬，先除以二再當作 Δy。'],
    ['看屏距與條紋間距是否成正比', '固定光源與狹縫片，選 X = 屏距 L（m）、Y = 暗紋間距 Δy（cm）。例如 L 為 1.0、1.5、2.0 m，Δy 分別為 0.26、0.39、0.52 cm，斜率為 0.26 cm/m，也就是 0.0026。雙狹縫的斜率等於 λ/d，若 d = 0.25 mm，則 λ 約為 650 nm。單狹縫同側暗紋間距作圖時，斜率等於 λ/W。'],
    ['用圖表描述量測差異', '可以這樣寫：「屏距愈大，暗紋間距也愈大，趨勢線接近通過原點。用斜率估得波長約 650 nm。若尺標沒有對準暗紋中心，量得的間距就可能偏大或偏小。」']
  ]
};
let analysisGuideLab;
function renderAnalysisGuide() {
  const guide = $('analysis-guide');
  guide.hidden = Boolean(exam);
  if (exam || analysisGuideLab === id) return;
  analysisGuideLab = id;
  guide.open = false;
  $('analysis-examples').replaceChildren(...analysisExamples[id].flatMap(([heading, example]) => [
    el('h3', heading), el('p', example)
  ]), el('p', '趨勢線的 R² 越接近 1，表示這組資料越接近所擬合的直線。也要檢查斜率、截距是否符合公式，並用量測條件說明偏差。'));
}

function render() {
  $('task').textContent = titles[id];
  renderSteps();
  for (const tab of $('experiments').querySelectorAll('button')) tab.setAttribute('aria-pressed', tab.dataset.lab === id);
  const tools = $('tools'), reading = $('reading');
  tools.replaceChildren();
  reading.replaceChildren();
  ({ refraction: refractionTools, lens: lensTools, slit: slitTools })[id](tools, reading);
  $('analysis').value = current().analysis;
  renderAnalysisGuide();
  message('');
  renderViewControls();
  drawBench();
  renderTable();
  renderGraphSettings();
  for (const node of $('lab').querySelectorAll('button, input, select, textarea')) node.disabled = locked && !node.closest('.bench-toolbar');
}

function fringeKind(mark, double) {
  const x = Math.abs(mark);
  const nearOrder = value => Math.abs(value - Math.round(value)) < .18;
  if (double) {
    if (nearOrder(x - .5)) return 'dark';
    return nearOrder(x) ? 'bright' : 'between';
  }
  if (x < .18) return 'bright';
  if (Math.round(x) > 0 && nearOrder(x)) return 'dark';
  const slopeSign = position => {
    const phase = Math.PI * position;
    return Math.sin(phase) * (phase * Math.cos(phase) - Math.sin(phase));
  };
  return slopeSign(x - .18) > 0 && slopeSign(x + .18) < 0 ? 'bright' : 'between';
}

function fringeFeedback(marks, interval, double, central) {
  const coordinates = marks.map(mark => mark / interval);
  const [a, b] = [...coordinates].sort((first, second) => first - second);
  const kinds = coordinates.map(mark => fringeKind(mark, double));
  const target = central ? '中央亮帶兩側的第一暗紋' : '相鄰暗紋';
  const placement = central ? '請把 A、B 各放在中央亮帶左、右兩側緊鄰中央的暗紋中心。'
    : double ? '沿屏幕找兩條緊鄰的深色條紋，把尺標放在各自最暗的中心。中央亮紋左右兩側的第一暗紋也可以量。'
    : '在中央亮帶的同一側，找兩條緊鄰的深色條紋，把尺標放在各自最暗的中心。';
  if (kinds.every(kind => kind === 'dark')) {
    if (central && Math.abs(a + 1) < .18 && Math.abs(b - 1) < .18) return null;
    if (!central && Math.abs(b - a - 1) < .25 && (double || a * b > 0)) return null;
    const reason = central ? '中央亮帶的全寬由兩側的第一暗紋決定。'
      : !double && a * b < 0 ? '跨過單狹縫的中央亮帶，兩側第一暗紋的距離是同側相鄰暗紋間距的兩倍。'
        : '兩個尺標若落在同一條暗紋，或中間還隔著其他暗紋，尺標差就不能當作一個條紋間距。';
    return [`目前兩個尺標都在暗紋附近，請重新標記${target}。`, reason + placement];
  }
  const descriptions = { bright: '亮紋中線附近', between: '亮紋與暗紋之間', dark: '暗紋附近' };
  const current = kinds[0] === kinds[1] ? `目前兩個尺標都標記在${descriptions[kinds[0]]}`
    : `尺標 A 在${descriptions[kinds[0]]}，尺標 B 在${descriptions[kinds[1]]}`;
  const principle = double && kinds.includes('bright')
    ? '雙狹縫的相鄰亮紋中線和相鄰暗紋有相同間距。本次依手冊練習辨認及量測暗紋。'
    : '尺標要對準暗紋最暗的中心，才能讀出本次指定的間距。';
  return [`${current}，請重新標記${target}。`, principle + placement];
}

function capture() {
  if (locked) return;
  const s = setup();
  const [result] = readings('result');
  let row;
  let expected;
  if (id === 'refraction') {
    if (!s.traced) return message('先完成插針與光路描繪。');
    const [i, r] = readings('incidence', 'refraction');
    if (!(i > 0 && i < 90 && r > 0 && r < 90)) return message('請填入 0° 到 90° 之間的角度。0° 入射不能用正弦比求折射率。');
    const [a, b, c] = s.pins;
    const measured = s.medium === 'glass' ? [angle(a, b), angle(b, c)] : [angle(a, origin), angle(origin, b)];
    if (!exam && (Math.abs(i - Math.abs(measured[0])) > 4 || Math.abs(r - Math.abs(measured[1])) > 4)) return message('請從法線重新估讀兩個角度。');
    expected = sin(i) / sin(r);
    row = { group: media[s.medium], i, r, si: sin(i), sr: sin(r), result };
  } else if (id === 'lens') {
    if (!s.mounted) return message('先把器材裝上光具座。');
    const [p, q] = readings('p', 'q');
    if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0 || q === 0 || p + q === 0) return message('請輸入可代入成像公式的物距與像距。');
    const convex = s.lens === 'convex';
    const qActual = imageDistance(s.p, lensF());
    if (convex && !(qActual > 0 && qActual <= 85)) return message('目前無法在光具座的像屏行程內取得實像，請調整物距。');
    if (!exam && (Math.abs(p - s.p) > .55 || Math.abs(q - (convex ? s.screen : -s.reference)) > .55)) return message('請核對刻度與像距的正負號。');
    if (!exam && Math.abs((convex ? s.screen : -s.reference) - qActual) > (convex ? 2 : .65)) return message(convex ? '繼續移動像屏，直到箭頭清晰。' : '左右改變視點，並調整參考物直到視差消失。');
    if (convex && s.direction === 'near') {
      s.first = { p, q };
      event('near-focus-reading', { p, q, screen: s.screen });
      changed();
      return message('近端調焦讀值已記下。把像屏移到遠端，再從遠端向透鏡找一次。');
    }
    if (convex && (!s.first || Math.abs(s.first.p - p) > .5)) return message('請在相同物距下先完成近端調焦。');
    const meanQ = convex ? (q + s.first.q) / 2 : q;
    expected = focalLength(p, meanQ);
    row = { group: convex ? '凸透鏡' : '凹透鏡', p, q: meanQ, ip: 1 / p, iq: 1 / meanQ, result, near: s.first, far: convex ? { p, q } : null };
  } else {
    if (!s.laser || s.marks.length !== 2) return message('請開啟雷射並用兩個尺標定位。');
    const [L, measuredWidth] = readings('L', 'dy');
    if (!(L > 0 && measuredWidth > 0)) return message('請填入大於零的屏距和尺標間距。');
    if (!exam && (Math.abs(L - s.L) > .05 || Math.abs(measuredWidth - Math.abs(s.marks[1] - s.marks[0])) > .035)) return message('請核對屏距與兩個尺標的差。');
    const double = s.plate === 'double';
    const central = !double && s.method === 'central';
    const dy = central ? measuredWidth / 2 : measuredWidth;
    const known = double ? null : readings('known')[0];
    if (!double && !(known > 0)) return message('請先填入用雙狹縫量得的同色光平均波長。');
    if (!exam) {
      const feedback = fringeFeedback(s.marks, slitInterval(s), double, central);
      if (feedback) return message(...feedback);
    }
    expected = double ? wavelength(s.spacing, L, dy) : slitWidth(known, L, dy);
    const color = s.color === 'red' ? '紅光' : '綠光';
    row = { group: color + (double ? `雙狹縫 ${s.spacing} mm` : '單狹縫' + (s.variant === 1 ? '甲' : '乙')), L, dy, measuredWidth,
      marks: [...s.marks], method: central ? '中央亮帶全寬' : '相鄰暗紋', spacing: double ? s.spacing : null, lambda: double ? result : known, width: double ? null : result, result };
  }
  if (!Number.isFinite(result)) return message('請填寫計算結果。');
  if (!exam && Math.abs(result - expected) > Math.max(.001, Math.abs(expected) * .045)) return message('請檢查公式、正負號和單位換算。');
  if (current().rows.length >= 80) return message('量測紀錄已達 80 筆。');
  current().rows.push(row);
  event('record-measurement', { setup: structuredClone(s), row });
  if (id === 'lens') Object.assign(s, { first: null, direction: 'near' });
  s.readings = {};
  render();
  message('已記下本次量測。');
  changed();
}

const groups = () => [...new Set(current().rows.map(row => row.group))];
function renderTable() {
  const rows = current().rows;
  $('table').replaceChildren();
  $('stats').textContent = '';
  if (!rows.length) return $('table').append(el('p', '完成一次量測後，讀值會出現在這裡。'));
  const table = el('table', null);
  const headings = table.createTHead().insertRow();
  for (const caption of ['條件', ...columns[id].map(([, caption]) => caption), '操作']) headings.append(el('th', caption, { scope: 'col' }));
  const body = table.createTBody();
  rows.forEach((row, i) => {
    const tr = body.insertRow();
    tr.insertCell().textContent = row.group;
    for (const [key] of columns[id]) tr.insertCell().textContent = fmt(row[key], 5);
    button(tr.insertCell(), '刪除第 ' + (i + 1) + ' 筆', () => {
      rows.splice(i, 1); action('delete-reading', { row: i + 1 });
    }).disabled = locked;
  });
  $('table').append(table);
  $('stats').textContent = groups().map(group => {
    const values = rows.filter(row => row.group === group).map(row => row.result);
    const { mean, uncertainty } = summary(values);
    const unit = id === 'lens' ? ' cm' : id === 'slit' ? (group.includes('雙') ? ' nm' : ' mm') : '';
    return `${group}（${values.length} 筆）平均 ${fmt(mean, 5)}${unit}，A 類標準不確定度 ${uncertainty === null ? '樣本不足' : fmt(uncertainty, 5) + unit}`;
  }).join('｜');
}
function renderGraphSettings() {
  const area = $('graph-settings');
  area.replaceChildren();
  const settings = current().graph;
  const options = groups().map(group => [group, group]);
  if (!options.some(([key]) => key === settings.group)) settings.group = options[0]?.[0] || '';
  const set = key => value => { settings[key] = value; drawGraph(); changed(); };
  select(area, '資料組', options.length ? options : [['', '尚無資料']], settings.group, set('group'));
  select(area, 'X 軸', axes(), settings.x, set('x'));
  select(area, 'Y 軸', axes(), settings.y, set('y'));
  for (const [key, caption] of [['xmin', 'X 下限'], ['xmax', 'X 上限'], ['xtick', 'X 刻度間距'], ['ymin', 'Y 下限'], ['ymax', 'Y 上限'], ['ytick', 'Y 刻度間距']]) {
    input(area, caption, settings[key], { type: 'number', step: 'any', placeholder: '自動' }, set(key));
  }
  const trend = field(area, '最小平方法趨勢線', el('input', null, { type: 'checkbox', checked: settings.trend }));
  trend.addEventListener('change', () => set('trend')(trend.checked));
  drawGraph();
}
function chartPoints(state) {
  const { x, y, group } = state.graph;
  const read = (row, key) => {
    const convert = convertedAxes[id].find(([name]) => name === key)?.[2];
    return convert ? convert(row) : row[key];
  };
  return state.rows.filter(row => row.group === group).map(row => [read(row, x), read(row, y)])
    .filter(pair => pair.every(Number.isFinite));
}
function chartRange(points, dimension, min, max) {
  const data = points.map(point => point[dimension]);
  const low = Math.min(...data), high = Math.max(...data);
  const pad = (high - low) * .12 || Math.abs(low) * .12 || 1;
  return [min === '' ? low - pad : +min, max === '' ? high + pad : +max];
}
function drawGraph() {
  graph.clearRect(0, 0, 720, 350);
  const s = current().graph;
  const points = chartPoints(current());
  const caption = key => axes().find(([column]) => column === key)?.[1] || '';
  label(graph, caption(s.y), 12, 22);
  label(graph, caption(s.x), 570, 333);
  if (!points.length) { $('fit').textContent = '所選資料組與座標軸沒有可繪製的數據。'; return; }
  const [xmin, xmax] = chartRange(points, 0, s.xmin, s.xmax);
  const [ymin, ymax] = chartRange(points, 1, s.ymin, s.ymax);
  if (!(xmax > xmin && ymax > ymin) || ![xmax - xmin, ymax - ymin].every(Number.isFinite)) {
    $('fit').textContent = '座標軸上限須大於下限，且範圍須為有限數值。'; return;
  }
  const dx = s.xtick === '' ? (xmax - xmin) / 5 : +s.xtick;
  const dy = s.ytick === '' ? (ymax - ymin) / 5 : +s.ytick;
  if (!(dx > 0 && dy > 0) || (xmax - xmin) / dx > 40 || (ymax - ymin) / dy > 40) {
    $('fit').textContent = '請輸入正的刻度間距，每軸最多顯示 40 個間隔。'; return;
  }
  const px = x => 90 + (x - xmin) * 603 / (xmax - xmin);
  const py = y => 285 - (y - ymin) * 246 / (ymax - ymin);
  for (let i = 0; i <= Math.floor((xmax - xmin) / dx + 1e-9); i++) {
    const value = xmin + i * dx, x = px(value);
    line(graph, [x, 39], [x, 285], '#c4d9ce');
    label(graph, fmt(value, 5), x - 14, 308);
  }
  for (let i = 0; i <= Math.floor((ymax - ymin) / dy + 1e-9); i++) {
    const value = ymin + i * dy, y = py(value);
    line(graph, [90, y], [693, y], '#c4d9ce');
    label(graph, fmt(value, 5), 8, y + 4);
  }
  graph.save();
  graph.beginPath();
  graph.rect(90, 39, 603, 246);
  graph.clip();
  const result = s.trend ? regression(points) : null;
  if (result) {
    const { slope, intercept } = result;
    line(graph, [px(xmin), py(slope * xmin + intercept)], [px(xmax), py(slope * xmax + intercept)], '#bd6331', 2);
  }
  for (const [x, y] of points) point(graph, [px(x), py(y)], '#16644f');
  graph.restore();
  $('fit').textContent = result
    ? `斜率 ${fmt(result.slope, 6)}｜截距 ${fmt(result.intercept, 6)}｜R² ${result.r2 === null ? '無定義' : fmt(result.r2, 5)}｜${points.length} 筆`
    : s.trend ? '最小平方法需要至少兩筆有效資料，且 X 值不可全部相同。' : `${points.length} 筆有效資料`;
}

let rotation = null;
let suppressClick = false;
function rotate(dx, dy) {
  const camera = cameraState();
  camera.yaw = (camera.yaw + dx) % (Math.PI * 2);
  camera.pitch = Math.max(.32, Math.min(1.23, camera.pitch + dy));
  drawBench();
}
canvas.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (cameraState().mode !== 'orbit' || event.button !== 0 || !event.isPrimary) return;
  rotation = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (rotation?.pointer !== event.pointerId) return;
  const dx = event.clientX - rotation.x, dy = event.clientY - rotation.y;
  if (!rotation.moved && Math.hypot(dx, dy) < 5) return;
  if (event.pointerType === 'touch' && !rotation.moved && Math.abs(dx) <= Math.abs(dy)) return;
  Object.assign(rotation, { x: event.clientX, y: event.clientY, moved: true });
  rotate(dx * .009, event.pointerType === 'touch' ? 0 : dy * .008);
});
function endRotation(event) {
  if (rotation?.pointer !== event.pointerId) return;
  suppressClick = rotation.moved;
  rotation = null;
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endRotation);
canvas.addEventListener('keydown', event => {
  if (cameraState().mode !== 'orbit') return;
  const delta = { ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  rotate(...delta);
});
canvas.addEventListener('click', click => {
  if (locked || suppressClick) return;
  const bounds = canvas.getBoundingClientRect();
  const mode = cameraState().mode;
  const frame = benchFrame(setup(), mode);
  const x = frame.x + ((click.clientX - bounds.left) * canvas.width / bounds.width - benchCenterX) / frame.scale;
  const y = frame.y + ((click.clientY - bounds.top) * canvas.height / bounds.height - benchCenterY) / frame.scale;
  if (id === 'refraction') {
    const camera = cameraProjection();
    const atHeight = height => {
      const [, base] = camera.project([0, 0, 0]);
      const [, top] = camera.project([0, 0, height]);
      const [a, b] = camera.floor(x, y + base - top);
      return [a + 360, b + 145];
    };
    let position = mode === 'orbit' ? atHeight(0) : [x, y];
    const fixedX = pinInterface(setup());
    if (mode === 'orbit' && fixedX !== null) {
      const top = atHeight(26);
      if (Math.abs(top[0] - fixedX) < Math.abs(position[0] - fixedX)) position = top;
    }
    const [px, py] = position;
    if (px >= 0 && px <= 720 && py >= 0 && py <= 300) pin([Math.round(px), Math.round(py)]);
  }
  if (id === 'slit' && mode === 'screen' && setup().laser && y >= 92 && y < 270) {
    const s = setup();
    const cm = Math.round((x - 360) / 95 * 100) / 100;
    if (s.marks.length === 2) s.marks = [];
    s.marks.push(cm);
    s[s.marks.length === 1 ? 'a' : 'b'] = cm;
    action('set-ruler', { marks: [...s.marks] });
  }
});
$('record').addEventListener('click', capture);
$('expand-bench').addEventListener('click', event => {
  const control = event.currentTarget;
  const expanded = benchZoom === 1;
  benchZoom = expanded ? 1.25 : 1;
  control.setAttribute('aria-pressed', String(expanded));
  control.textContent = expanded ? '還原實驗畫面' : '放大實驗畫面';
  drawBench();
});
$('analysis').addEventListener('input', () => { current().analysis = $('analysis').value; changed(); });
$('experiments').addEventListener('click', click => {
  const next = click.target.dataset.lab;
  if (!exam && next && next !== id) { id = next; render(); }
});

export function assessmentSnapshot() {
  const state = current();
  return structuredClone({ ...state, fit: state.graph.trend ? regression(chartPoints(state)) : null });
}
export function openAssessment(assessment, snapshot, readOnly = false) {
  if (!exam && assessment) practiceId = id;
  exam = assessment;
  locked = readOnly;
  if (assessment) {
    id = assessment.lab;
    assessmentState = snapshot ? structuredClone(snapshot) : newState(id);
  } else {
    id = practiceId;
    assessmentState = undefined;
  }
  $('experiments').hidden = Boolean(assessment);
  render();
}

render();
