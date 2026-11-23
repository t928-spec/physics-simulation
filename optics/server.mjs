import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { googleAuthorization, googleIdentity, random } from './google.mjs';

const labs = new Set(['refraction', 'lens', 'slit']);
const root = new URL('../', import.meta.url);
const labAssets = new Set([
  'index.html', 'style.css', 'lab.js', 'physics.js', 'scene.js', 'classroom.js',
  'classroom-entry.js', 'supabase-config.js', 'supabase-classroom.js', 'supabase-backend.js'
]);
const simulationAssets = new Set([
  'index.html', 'BJT.html', 'double-slit-interference.html', 'double-slit-parallel-rays.html', 'elliptical-orbit-energy.html',
  'gas-kinetic-theory.html', 'string-wave-boundary.html', 'string-wave-derivation.html',
  'water-wave-interference.html', 'longitudinal-wave-displacement-pressure.html',
  'molecular-degrees-of-freedom.html', 'circular-standing-wave.html', 'air-column-spectrum.html',
  'planet-orbit-builder.html', 'wave superposition.html', 'bjt-preview.png', 'simulation-preview.png',
  'double-slit-spacing-preview.png', 'elliptical-orbit-preview.png', 'gas-kinetic-theory-preview.png'
]);
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac' };
const hour = 3600000;

function requires(condition, status, message) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function string(value, label, max = 150) {
  requires(typeof value === 'string' && value.trim() && value.trim().length <= max, 400, label + '長度有誤。');
  return value.trim();
}
function date(value) {
  if (!value) return null;
  requires(typeof value === 'string' && Number.isFinite(Date.parse(value)), 400, '時間格式有誤。');
  return Date.parse(value);
}
const digest = value => createHash('sha256').update(value).digest('base64url');
const emailAddress = value => String(value || '').trim().toLowerCase();

async function body(request) {
  requires(String(request.headers['content-type']).startsWith('application/json'), 415, '請使用 JSON。');
  const parts = [];
  let size = 0;
  for await (const part of request) {
    size += part.length;
    requires(size < 512000, 413, '作答資料太大。');
    parts.push(part);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { requires(false, 400, '無法讀取資料。'); }
  requires(data && typeof data === 'object' && !Array.isArray(data), 400, '資料格式有誤。');
  return data;
}
function snapshotJSON(snapshot) {
  requires(snapshot && typeof snapshot.setup === 'object' && snapshot.setup &&
    typeof snapshot.graph === 'object' && snapshot.graph && Array.isArray(snapshot.rows) &&
    snapshot.rows.length <= 80 && Array.isArray(snapshot.events) && snapshot.events.length <= 300 &&
    typeof snapshot.analysis === 'string' && snapshot.analysis.length <= 5000, 400, '作答格式有誤。');
  return JSON.stringify(snapshot);
}

export function createPlatform({ database, origin, teachers = [], clientId, clientSecret }) {
  const url = new URL(origin);
  const secure = url.protocol === 'https:';
  requires(secure || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 500, '公開部署需使用 HTTPS。');
  origin = url.origin;
  const config = { clientId, clientSecret, callback: origin + '/optics/auth/callback' };
  const teacherEmails = new Set(teachers.map(emailAddress).filter(Boolean));
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, domain TEXT);
    CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth (key TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, destination TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, domain TEXT, code TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS members (classroom TEXT REFERENCES classes(id), student TEXT REFERENCES users(id), PRIMARY KEY(classroom, student));
    CREATE TABLE IF NOT EXISTS exceptions (classroom TEXT REFERENCES classes(id), email TEXT NOT NULL, PRIMARY KEY(classroom, email));
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY, classroom TEXT NOT NULL REFERENCES classes(id), title TEXT NOT NULL, lab TEXT NOT NULL,
      prompt TEXT NOT NULL, opens INTEGER, closes INTEGER, seed INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, exam TEXT NOT NULL REFERENCES exams(id), student TEXT NOT NULL REFERENCES users(id),
      snapshot TEXT NOT NULL, submitted INTEGER, grade TEXT, published INTEGER, UNIQUE(exam, student)
    );
  `);
  const get = (sql, ...values) => db.prepare(sql).get(...values);
  const all = (sql, ...values) => db.prepare(sql).all(...values);
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  const isTeacher = user => teacherEmails.has(user.email);
  const cookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/optics; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const cookieValue = (request, name) => (request.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'))?.[1];
  const findClass = id => {
    const classroom = get('SELECT * FROM classes WHERE id = ?', id);
    requires(classroom, 404, '查無班級。');
    return classroom;
  };
  const owns = (user, classroom) => isTeacher(user) && classroom.owner === user.id;
  function owner(user, id) {
    const classroom = findClass(id);
    requires(owns(user, classroom), 403, '只有班級教師可操作。');
    return classroom;
  }
  const member = (user, classroom) => get('SELECT 1 FROM members WHERE classroom = ? AND student = ?', classroom.id, user.id)
    && (!classroom.domain || classroom.domain === user.domain ||
      get('SELECT 1 FROM exceptions WHERE classroom = ? AND email = ?', classroom.id, user.email));
  function sessionFor(identity) {
    const key = random();
    const email = emailAddress(identity.email);
    run('INSERT INTO users VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, domain=excluded.domain',
      identity.sub, email, String(identity.name || email).slice(0, 150), identity.hd?.toLowerCase() || null);
    run('DELETE FROM sessions WHERE expires <= ?', Date.now());
    run('INSERT INTO sessions VALUES (?, ?, ?)', digest(key), identity.sub, Date.now() + 12 * hour);
    return cookie('optics_session', key, 12 * 3600);
  }
  function attemptView(row, teacher = false) {
    if (!row) return null;
    return {
      id: row.id, student: row.student, submitted: row.submitted,
      snapshot: JSON.parse(row.snapshot), published: row.published,
      grade: row.grade && (row.published || teacher) ? JSON.parse(row.grade) : null
    };
  }
  function publicExam(exam, user, teacher) {
    const { seed, prompt, ...info } = exam;
    const future = exam.opens && exam.opens > Date.now();
    return { ...info, ...(teacher || !future ? { seed: teacher ? seed : (seed + [...user.id].reduce((total, character) => total + character.codePointAt(0), 0)) % 7, prompt } : {}) };
  }
  function api(user, method, path, data) {
    if (path === 'me' && method === 'GET') return [200, { user: user ? { ...user, teacher: isTeacher(user) } : null, google: Boolean(clientId && clientSecret) }];
    requires(user, 401, '請先登入。');
    if (path === 'dashboard' && method === 'GET') {
      const owned = isTeacher(user) ? all('SELECT * FROM classes WHERE owner = ? ORDER BY name', user.id) : [];
      const joined = all('SELECT c.* FROM classes c JOIN members m ON c.id = m.classroom WHERE m.student = ? ORDER BY c.name', user.id)
        .filter(item => member(user, item)).map(({ id, name }) => ({ id, name }));
      const exams = [...owned, ...joined].flatMap(item => all('SELECT * FROM exams WHERE classroom = ? ORDER BY title', item.id)
        .map(exam => ({ ...publicExam(exam, user, owns(user, item)), className: item.name })));
      return [200, { owned, joined, exams }];
    }
    if (path === 'classes' && method === 'POST') {
      requires(isTeacher(user), 403, '只有教師可建立班級。');
      const name = string(data.name, '班級名稱');
      const domain = String(data.domain || '').trim().toLowerCase();
      requires(!domain || /^[a-z0-9][a-z0-9.-]{0,251}\.[a-z]{2,}$/.test(domain), 400, '請填寫學校 Google Workspace 網域。');
      const classroom = { id: randomUUID(), name, domain, code: random(12) };
      run('INSERT INTO classes VALUES (?, ?, ?, ?, ?)', classroom.id, user.id, name, domain || null, classroom.code);
      return [201, classroom];
    }
    if (path === 'join' && method === 'POST') {
      const code = string(data.code, '班級代碼', 100);
      const classroom = get('SELECT * FROM classes WHERE code = ?', code);
      requires(classroom, 404, '找不到這個班級邀請。');
      requires(!classroom.domain || classroom.domain === user.domain ||
        get('SELECT 1 FROM exceptions WHERE classroom = ? AND email = ?', classroom.id, user.email),
      403, '請改用學校 Google 帳號，或請老師核准你的帳號。');
      if (!owns(user, classroom)) run('INSERT OR IGNORE INTO members VALUES (?, ?)', classroom.id, user.id);
      return [200, { id: classroom.id, name: classroom.name }];
    }
    if (path === 'exceptions' && method === 'POST') {
      const classroom = owner(user, string(data.classroom, '班級'));
      const email = emailAddress(data.email);
      requires(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, '請輸入完整的 Google 帳號電子郵件。');
      run('INSERT OR IGNORE INTO exceptions VALUES (?, ?)', classroom.id, email);
      return [200, { email }];
    }
    if (path === 'exams' && method === 'POST') {
      const classroom = owner(user, string(data.classroom, '班級'));
      const title = string(data.title, '測驗名稱');
      const prompt = string(data.prompt, '測驗任務', 5000);
      requires(labs.has(data.lab), 400, '請選擇實驗。');
      const opens = date(data.opens), closes = date(data.closes);
      requires(!opens || !closes || opens < closes, 400, '截止時間須晚於開放時間。');
      const exam = { id: randomUUID(), classroom: classroom.id, title, lab: data.lab, prompt, opens, closes, seed: randomInt(7) };
      run('INSERT INTO exams VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...Object.values(exam));
      return [201, exam];
    }
    const [resource, id, action, extra] = path.split('/');
    requires(id && !extra, 404, '查無頁面。');
    if (resource === 'exams') {
      const exam = get('SELECT * FROM exams WHERE id = ?', id);
      requires(exam, 404, '查無測驗。');
      const classroom = findClass(exam.classroom);
      const teacher = owns(user, classroom);
      requires(teacher || member(user, classroom), 403, '請先加入此測驗的班級。');
      const attempt = get('SELECT * FROM attempts WHERE exam = ? AND student = ?', id, user.id);
      if (method === 'GET' && !action) {
        const roster = teacher ? all(`
          SELECT u.id, u.name, u.email, a.id AS attempt, a.submitted, a.published
          FROM members m JOIN users u ON u.id = m.student LEFT JOIN attempts a ON a.exam = ? AND a.student = u.id
          WHERE m.classroom = ? ORDER BY u.name`, id, classroom.id) : null;
        return [200, { exam: publicExam(exam, user, teacher), teacher, attempt: attemptView(attempt), roster }];
      }
      if (method === 'POST' && ['draft', 'submit'].includes(action)) {
        requires(!teacher, 403, '教師由批改頁查看作答。');
        if (action === 'submit' && attempt?.submitted) return [200, attemptView(attempt)];
        requires(!attempt?.submitted, 409, '此測驗已交卷。');
        const now = Date.now();
        requires((!exam.opens || exam.opens <= now) && (!exam.closes || now < exam.closes), 409, '目前不在測驗開放時間內。');
        const snapshot = snapshotJSON(data.snapshot);
        run(`
          INSERT INTO attempts (id, exam, student, snapshot, submitted) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(exam, student) DO UPDATE SET snapshot=excluded.snapshot, submitted=excluded.submitted
          WHERE attempts.submitted IS NULL
        `, randomUUID(), id, user.id, snapshot, action === 'submit' ? now : null);
        return [200, attemptView(get('SELECT * FROM attempts WHERE exam = ? AND student = ?', id, user.id))];
      }
    }
    if (resource === 'submissions') {
      const row = get('SELECT * FROM attempts WHERE id = ?', id);
      requires(row?.submitted, 404, '查無已交卷的作答。');
      const exam = get('SELECT * FROM exams WHERE id = ?', row.exam);
      const classroom = findClass(exam.classroom);
      const teacher = owns(user, classroom);
      if (method === 'GET' && !action) {
        requires(teacher || (row.student === user.id && member(user, classroom)), 403, '無法查看此作答。');
        const student = get('SELECT id, name, email FROM users WHERE id = ?', row.student);
        const submissionExam = publicExam(exam, student, false);
        return [200, { exam: submissionExam, student, attempt: attemptView(row, teacher), teacher }];
      }
      if (method === 'POST' && action === 'grade') {
        requires(teacher, 403, '只有班級教師可批改。');
        requires(Array.isArray(data.scores) && data.scores.length === 4 &&
          data.scores.every(score => Number.isInteger(score) && score >= 0 && score <= 25) &&
          typeof data.comment === 'string' && data.comment.length <= 5000 && typeof data.publish === 'boolean', 400, '請確認給分與評語。');
        const grade = { scores: data.scores, comment: data.comment };
        const published = data.publish ? Date.now() : null;
        run('UPDATE attempts SET grade = ?, published = ? WHERE id = ?', JSON.stringify(grade), published, id);
        return [200, { grade, published }];
      }
    }
    requires(false, 404, '查無頁面。');
  }

  const server = createServer(async (request, response) => {
    const send = (status, payload) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
    };
    const redirect = (location, cookies = []) => {
      response.writeHead(303, { Location: location, 'Set-Cookie': cookies });
      response.end();
    };
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const location = new URL(request.url, origin);
      const path = decodeURIComponent(location.pathname);
      const query = location.searchParams;
      const method = request.method;
      const session = cookieValue(request, 'optics_session');
      const user = session ? get('SELECT u.* FROM sessions s JOIN users u ON s.user = u.id WHERE s.key = ? AND s.expires > ?', digest(session), Date.now()) : null;
      if (method === 'POST') requires(request.headers.origin === origin, 403, '此請求來自其他網站。');
      if (path === '/optics/auth/start' && method === 'GET') {
        requires(clientId && clientSecret, 503, 'Google 登入尚未設定。');
        const destination = query.get('next') || '/optics/';
        requires(/^\/optics\/(?:\?(?:exam|join)=[a-zA-Z0-9_-]+)?$/.test(destination), 400, '登入後的連結格式有誤。');
        const state = random(), nonce = random(), verifier = random();
        run('DELETE FROM oauth WHERE expires <= ?', Date.now());
        run('INSERT INTO oauth VALUES (?, ?, ?, ?, ?)', digest(state), nonce, verifier, destination, Date.now() + 600000);
        return redirect(googleAuthorization(config, state, nonce, digest(verifier)), [cookie('optics_oauth', state, 600)]);
      }
      if (path === '/optics/auth/callback' && method === 'GET') {
        const state = query.get('state');
        const key = state && state === cookieValue(request, 'optics_oauth') ? digest(state) : null;
        const login = key && get('DELETE FROM oauth WHERE key = ? AND expires > ? RETURNING *', key, Date.now());
        if (!login || !query.get('code')) return redirect('/optics/?login=retry', [cookie('optics_oauth', '', 0)]);
        try {
          const identity = await googleIdentity(config, query.get('code'), login.nonce, login.verifier);
          if (session) run('DELETE FROM sessions WHERE key = ?', digest(session));
          return redirect(login.destination, [sessionFor(identity), cookie('optics_oauth', '', 0)]);
        } catch {
          const separator = login.destination.includes('?') ? '&' : '?';
          return redirect(login.destination + separator + 'login=retry', [cookie('optics_oauth', '', 0)]);
        }
      }
      if (path === '/optics/api/logout' && method === 'POST') {
        if (session) run('DELETE FROM sessions WHERE key = ?', digest(session));
        response.setHeader('Set-Cookie', cookie('optics_session', '', 0));
        return send(200, {});
      }
      if (path.startsWith('/optics/api/')) {
        const [status, data] = api(user, method, path.slice(12), method === 'POST' ? await body(request) : null);
        return send(status, data);
      }
      if (path === '/optics') return redirect('/optics/');
      const relative = path === '/' ? 'index.html' : path === '/optics/' ? 'optics/index.html' : path.slice(1);
      const allowed = simulationAssets.has(relative) ||
        (relative.startsWith('optics/') && labAssets.has(relative.slice(7))) ||
        /^(?:[a-z0-9-]+\.js|assets\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_-]+\.(?:png|webp|jpg|svg|mp3|wav|flac))$/.test(relative);
      requires(method === 'GET' && allowed && !relative.includes('..') && !relative.includes('\\'), 404, '查無頁面。');
      const content = await readFile(new URL(relative.split('/').map(encodeURIComponent).join('/'), root)).catch(() => null);
      requires(content, 404, '查無檔案。');
      response.writeHead(200, { 'Content-Type': mime[relative.split('.').at(-1)] || 'application/octet-stream' });
      response.end(content);
    } catch (error) {
      if (!error.status) console.error(error);
      send(error.status || 500, { error: error.status ? error.message : '暫時無法處理，請稍後重試。' });
    }
  });
  return { server, sessionFor, close: () => new Promise(resolve => server.close(() => { db.close(); resolve(); })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const origin = process.env.OPTICS_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + port;
  const app = createPlatform({
    database: process.env.OPTICS_DB || fileURLToPath(new URL('../optics-data.sqlite', import.meta.url)),
    origin,
    teachers: (process.env.OPTICS_TEACHERS || '').split(','),
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  });
  app.server.listen(port, process.env.OPTICS_HOST || '127.0.0.1', () => console.log('Optics lab: ' + origin + '/optics/'));
}
