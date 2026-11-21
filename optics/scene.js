export function createCamera(yaw = -.27, pitch = .57) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rise = Math.sin(pitch), level = Math.cos(pitch);
  const scale = Math.min(.89, 118 / (rise * (360 * Math.abs(s) + 135 * Math.abs(c))));
  return {
    project([x, y, z]) {
      const depth = s * x + c * y;
      return [360 + scale * (c * x - s * y), 166 + scale * (rise * depth - level * z), level * depth + rise * z];
    },
    floor(x, y) {
      const across = (x - 360) / scale;
      const depth = (y - 166) / (scale * rise);
      return [across * c + depth * s, depth * c - across * s];
    }
  };
}

const outline = '#466864';
const glass = { top: '#a7e6ef83', side: '#51afc377', light: '#78d3d36e', edge: '#4d9eaa' };
const metal = { top: '#a2b6c1', side: '#405b70', light: '#657e91', edge: '#344b5e' };
const mount = { top: '#3f7195', side: '#244c6b', light: '#345f7d', edge: '#163e58' };
const screen = { top: '#fff9e9', side: '#fffaf0', light: '#d8e0da', edge: '#7b9096' };
const amber = { top: '#ffc77a', side: '#dc8632', light: '#efa049', edge: '#98541d' };
const ring = (count, point) => Array.from({ length: count }, (_, i) => point(i * Math.PI * 2 / count));
const ground = ([x, y], z = 0) => [x - 360, y - 145, z];

function painter(ctx, camera) {
  const items = [];
  const project = camera.project;
  function add(points, draw) {
    const projected = points.map(project);
    const depth = projected.reduce((sum, p) => sum + p[2], 0) / projected.length;
    items.push({ depth, projected, draw });
  }
  function path(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  }
  function face(points, fill, edge) {
    add(points, projected => {
      path(projected);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }
  function line(a, b, color, width = 1, dash = [], overlay = false) {
    const draw = points => {
      path(points);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (overlay) draw([project(a), project(b)]);
    else add([a, b], draw);
  }
  function prism(base, height, material, bottom = 0) {
    const low = base.map(([x, y]) => [x, y, bottom]);
    const high = base.map(([x, y]) => [x, y, bottom + height]);
    for (let i = 0; i < low.length; i++) {
      const j = (i + 1) % low.length;
      const edge = low.length <= 4 || (i === low.length - 1 && material === glass && low.length !== 20);
      const lit = (low[j][0] - low[i][0]) - (low[j][1] - low[i][1]) > 0;
      face([low[i], low[j], high[j], high[i]], lit ? material.light ?? material.side : material.side, edge ? material.edge : null);
    }
    face(high, material.top, material.edge);
  }
  function box(x, y, w, d, h, material, bottom = 0) {
    prism([[x,y], [x+w,y], [x+w,y+d], [x,y+d]], h, material, bottom);
  }
  function text(value, point, color = '#17322e') {
    const [x, y] = project(point);
    ctx.font = '600 13px "Microsoft JhengHei", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f2f7f4';
    ctx.strokeText(value, x + 5, y - 4);
    ctx.fillStyle = color;
    ctx.fillText(value, x + 5, y - 4);
    ctx.textBaseline = 'alphabetic';
  }
  function flush() {
    items.sort((a,b) => a.depth - b.depth);
    for (const item of items) item.draw(item.projected);
    items.length = 0;
  }
  return { face, line, prism, box, text, flush, project };
}

function refraction(p, s, guide) {
  const brick = s.medium === 'glass';
  const center = [-60, 0, 0];
  if (s.phase === 'pins') {
    if (brick) {
      p.box(-60, -135, 105, 270, 26, glass);
      p.line([-58,-131,26.3], [41,-131,26.3], '#f5ffff', 2);
      p.line([41,-131,26.3], [41,131,26.3], '#ddfbfa', 1);
    }
    else {
      const base = Array.from({length: 27}, (_, i) => {
        const theta = -Math.PI / 2 + i * Math.PI / 26;
        return [-60 + 135 * Math.cos(theta), 135 * Math.sin(theta)];
      });
      const liquid = s.medium === 'salt'
        ? { ...glass, top: '#72d3c58f', side: '#47a99c7c' }
        : { ...glass, top: '#75c8ea83', side: '#438ebf70' };
      p.prism(base, 7, { ...glass, top: '#cbedf458' });
      p.prism(base.map(([x,y]) => [-60 + (x + 60) * .96, y * .96]), 15, liquid, 3);
      const rim = base.map(([x,y]) => [x,y,24]);
      rim.forEach((point,i) => {
        p.line(point, rim[(i+1) % rim.length], '#418ca1', 2);
        p.line([point[0],point[1],0], point, '#7cb8c04e');
      });
    }
  }
  const named = s.pins.map((position, i) => [ground(position), 'ABCD'[i]]);
  if (!brick && s.phase !== 'setup') named.push([center, 'O']);
  const pinColors = {
    A: { top: '#ff9474', side: '#c23c31', edge: '#942820' },
    B: { top: '#ffd280', side: '#dc862d', edge: '#a85a15' },
    C: { top: '#a6dc87', side: '#4f8e4b', edge: '#326638' },
    D: { top: '#add4ff', side: '#426eba', edge: '#2c5194' },
    O: { top: '#9fb5c8', side: '#365066', edge: '#253d52' }
  };
  for (const [[x, y], name] of named) {
    const stem = ring(12, a => [x + 1.6 * Math.cos(a), y + 1.6 * Math.sin(a)]);
    const head = ring(16, a => [x + 4 * Math.cos(a), y + 4 * Math.sin(a)]);
    p.prism(stem, 44, metal);
    p.prism(head, 5, pinColors[name]);
  }
  p.flush();
  if (guide) {
    const from = ground(guide.start, 32), eye = ground(guide.eye, 32);
    p.line(from, eye, '#23788d', 2, [5, 4], true);
    const eyeShape = ring(20, a => [eye[0] + 8 * Math.cos(a), eye[1], eye[2] + 5 * Math.sin(a)]);
    p.face(eyeShape, '#eefbfb', '#23788d');
    p.face(eyeShape.map(([x,y,z]) => [(x + eye[0]) / 2, y + .1, (z + eye[2]) / 2]), '#23788d');
    p.flush();
    p.text('人眼', eye);
  }
  if (s.traced) {
    const pins = s.pins.map(position => ground(position, 1));
    const path = brick ? pins : [pins[0], center, pins[1]];
    path.slice(1).forEach((point,i) => p.line(path[i], point, '#b74d2d', 2, [], true));
    const entry = path[1];
    p.line([-245, entry[1], 1], [145, entry[1], 1], '#527e74', 1, [5, 4], true);
  }
  for (const [[x,y], name] of named) p.text(name, [x,y,50]);
}

function upright(p, x, material, size = 38, height = size + 16) {
  p.box(x - 11, -23, 22, 46, 8, mount, 12);
  p.box(x - 2, -2, 4, 4, 52, metal, 16);
  p.box(x - 2, -size / 2, 4, size, height, material, 29);
}
function bridgeRings(p, first, second, color, alternate = color) {
  for (let i = 0; i < first.length; i++) {
    const j = (i + 1) % first.length;
    p.face([first[i], first[j], second[j], second[i]], i < first.length / 2 ? color : alternate);
  }
}
function opticalLens(p, x, convex) {
  const circle = (offset, radius) => ring(32, a => [x + offset, radius * Math.cos(a), 63 + radius * Math.sin(a)]);
  const rimDepth = convex ? 4 : 7;
  const left = circle(-rimDepth, 33);
  const right = circle(rimDepth, 33);
  bridgeRings(p, left, right, '#409ba58c', '#71d2d58c');
  for (const side of [-1, 1]) {
    const outer = side < 0 ? left : right;
    const inner = circle(side * (convex ? 10 : 2), 22);
    bridgeRings(p, outer, inner, '#a0e1ed66', '#71c8e488');
    p.face(inner, '#bceef17a', '#75b6cb65');
    bridgeRings(p, circle(side * rimDepth, 36), outer, '#254d68', '#527f99');
  }
  bridgeRings(p, circle(-rimDepth, 36), circle(rimDepth, 36), '#1c435e', '#477790');
}
function lens(p, s, q) {
  p.box(-303, -15, 606, 30, 12, metal);
  p.flush();
  for (let x = -280; x <= 280; x += 10) p.line([x,10,12.2], [x,15,12.2], '#dfebe4', 1, [], true);
  if (!s.mounted) return;
  const x = cm => -45 + cm * 3.9;
  const source = x(-s.p), target = x(s.lens === 'convex' ? s.screen : -s.reference);
  upright(p, source, { ...screen, side: '#fff1c7' });
  p.box(source - 15, -18, 12, 36, 37, amber, 35);
  p.box(x(0) - 11, -21, 22, 42, 8, mount, 12);
  p.box(x(0) - 3, -4, 6, 8, 28, metal, 12);
  opticalLens(p, x(0), s.lens === 'convex');
  if (s.lens === 'convex') upright(p, target, screen, 55);
  else p.box(target - 2, -2, 4, 4, 90, { ...metal, top: '#c19154', side: '#aa7943' }, 12);
  p.flush();
  const arrow = (at, h, color) => {
    const [,y,z] = at;
    const tip = [at[0],y,z+h];
    p.line(at, tip, color, 3, [], true);
    for (const dy of [-5,5]) p.line(tip, [at[0], y + dy, z+h-Math.sign(h)*7], color, 2, [], true);
  };
  arrow([source,0,55], 20, '#a95628');
  if (s.lens === 'convex' && q > 0 && Number.isFinite(q)) {
    const opacity = Math.max(.12, 1-Math.abs(q-s.screen)/24);
    arrow([target,0,68], -Math.min(34,20*q/s.p), 'rgba(169,86,40,' + opacity + ')');
  }
  p.text('光源屏', [source,0,93]);
  p.text(s.lens === 'convex' ? '凸透鏡' : '凹透鏡', [x(0),0,100]);
  p.text(s.lens === 'convex' ? '像屏' : '參考物', [target,0,109]);
}

function slits(p, s, interval) {
  p.box(-295, -17, 580, 34, 12, metal);
  p.flush();
  if (!s.mounted) return;
  const plate = -130, end = 35 + s.L * 92;
  const laser = s.color === 'red'
    ? { top: '#d3544c', side: '#982f31', light: '#ae3e40', edge: '#62202a' }
    : { top: '#58aa7b', side: '#286b57', light: '#377e62', edge: '#1c4e3f' };
  p.box(-279, -16, 76, 32, 30, laser, 44);
  p.box(-243, -7, 12, 14, 32, metal, 12);
  p.box(-249, -8, 28, 16, 1, amber, 74);
  const aperture = (x, radius) => ring(22, a => [x, radius * Math.cos(a), 61 + radius * Math.sin(a)]);
  bridgeRings(p, aperture(-205, 11), aperture(-197, 11), '#243a49', '#496476');
  p.face(aperture(-196.8, 7), '#172b37', '#96aeb9');
  p.face(aperture(-196.6, 3), s.laser ? (s.color === 'red' ? '#ff7765' : '#74ffc1') : '#405668');
  upright(p, plate, { ...mount, side: '#273f56' }, 57);
  p.box(plate - 2.3, -21, 4.6, 42, 44, { ...metal, side: '#b5c8d0', light: '#dbe5e8' }, 40);
  upright(p, end, screen, 122, 104);
  p.flush();
  for (const x of [plate - 2.5, plate + 2.5]) {
    for (const y of s.plate === 'double' ? [-3, 3] : [0]) p.line([x,y,51], [x,y,72], '#152e42', 1.8, [], true);
  }
  const color = s.color === 'red' ? '244,91,66' : '65,255,137';
  if (s.laser) {
    p.line([-196.5,0,61],[plate - 2.5,0,61],'rgb('+color+')',2,[],true);
    const face = end - 2.5;
    p.face([[face,-58,31],[face,58,31],[face,58,130],[face,-58,130]], '#172729');
    // The background and stripes share a plane. Paint the background before sorting the stripes.
    p.flush();
    for (let y = -58; y < 58; y += 1) {
      const phase = Math.PI * (y / 15.3) / interval;
      const intensity = s.plate === 'double' ? Math.cos(phase) ** 2 : phase === 0 ? 1 : (Math.sin(phase) / phase) ** 2;
      p.face([[face,y,32],[face,y+1,32],[face,y+1,129],[face,y,129]], 'rgba('+color+','+(intensity ** .6)+')');
    }
    p.flush();
    s.marks.forEach((cm,i) => {
      const y = cm * 15.3;
      p.line([face,y,31],[face,y,129],'#ffdc74',2,[4,3],true);
      p.text(i ? 'B' : 'A', [face,y,121]);
    });
  }
  p.text('雷射', [-259,0,77]);
  p.text(s.plate === 'double' ? '雙狹縫' : '單狹縫', [plate,0,109]);
  p.text('屏幕', [end,0,140]);
}

export function drawScene(ctx, camera, kind, setup, measurements) {
  ctx.save();
  const p = painter(ctx, camera);
  const paper = kind === 'refraction';
  const minX = paper ? -360 : -350, maxX = -minX;
  const minY = paper ? -145 : -135, maxY = paper ? 155 : 135;
  p.box(minX, minY, maxX - minX, maxY - minY, 10, { top: '#edf5ef', side: '#91aaa4', edge: outline }, -10);
  p.flush();
  for (let x = paper ? minX : -345; x <= maxX; x += 15) p.line([x,minY,0],[x,maxY,0],'#cadbd2',1,[],true);
  for (let y = minY; y <= maxY; y += 15) p.line([minX,y,0],[maxX,y,0],'#cadbd2',1,[],true);
  if (paper) {
    const axis = '#365e86';
    const at = (x, y) => ground([x, y], .2);
    p.line(at(0, 0), at(104, 0), axis, 2, [], true);
    p.line(at(0, 0), at(0, 103), axis, 2, [], true);
    p.line(at(104, 0), at(96, 6), axis, 2, [], true);
    p.line(at(0, 103), at(6, 96), axis, 2, [], true);
    refraction(p, setup, measurements.guide);
    p.text('(0, 0)', at(6, 9), axis);
    p.text('X', at(106, 0), axis);
    p.text('Y', at(0, 106), axis);
  }
  else if (kind === 'lens') lens(p, setup, measurements.q);
  else slits(p, setup, measurements.interval);
  ctx.restore();
}
