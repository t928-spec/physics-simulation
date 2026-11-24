import { assessmentSnapshot, openAssessment } from './lab.js';

const area = document.getElementById('classroom');
const lab = document.getElementById('lab');
const toggle = document.getElementById('classroom-toggle');
const query = new URLSearchParams(location.search);
const titles = { refraction: '折射率的測定', lens: '薄透鏡成像', slit: '光的干涉與繞射' };
const rubric = ['實驗步驟', '器材使用', '讀值', '數據分析'];
const apiRoot = new URL('./api/', location.href);
const formatTime = time => new Date(time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
let identity;
let active;
let saveTimer;
let saveQueue = Promise.resolve();
let viewVersion = 0;

function append(parent, tag, text = '', attributes = {}) {
  const element = document.createElement(tag);
  element.textContent = text;
  Object.assign(element, attributes);
  parent.append(element);
  return element;
}
function status(parent) { return append(parent, 'p', '', { role: 'status' }); }
function link(parent, text, params) {
  const url = new URL('./', location.href);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return append(parent, 'a', text, { href: url.href });
}
function button(parent, text, callback) {
  const element = append(parent, 'button', text, { type: 'button' });
  element.addEventListener('click', callback);
  return element;
}
function input(parent, text, type, attributes = {}) {
  const label = append(parent, 'label', text);
  const field = append(label, type === 'textarea' || type === 'select' ? type : 'input', '', {
    ...(type === 'textarea' || type === 'select' ? {} : { type }), ...attributes
  });
  field.setAttribute('aria-label', text);
  return field;
}
function options(parent, text, entries) {
  const select = input(parent, text, 'select');
  for (const [value, label] of entries) append(select, 'option', label, { value });
  return select;
}
function form(parent, label, handler) {
  const element = append(parent, 'form');
  const fields = append(element, 'div', '', { className: 'controls' });
  const feedback = status(element);
  const send = append(element, 'button', label, { type: 'submit' });
  element.addEventListener('submit', async event => {
    event.preventDefault();
    send.disabled = true;
    feedback.textContent = '處理中…';
    try { feedback.textContent = await handler() || ''; }
    catch (error) { feedback.textContent = error.message; }
    finally { send.disabled = false; }
  });
  return fields;
}
async function api(path, data) {
  const response = await fetch(new URL(path, apiRoot), {
    credentials: 'same-origin',
    ...(data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('此網址提供練習模式。測驗請從老師發送的平台連結開啟。');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '連線失敗，請稍後再試。');
  return result;
}
async function practice() {
  if (active) {
    if (active.submitting) return;
    toggle.disabled = true;
    clearTimeout(saveTimer);
    try {
      if (!(await saveDraft())) return;
      clearTimeout(saveTimer);
      active = null;
    } finally {
      toggle.disabled = false;
    }
  }
  viewVersion++;
  if (query.has('exam')) openAssessment(null);
  for (const key of ['exam', 'join', 'login', 'classroom']) query.delete(key);
  const url = new URL(location.href);
  url.search = query.toString();
  history.replaceState(null, '', url);
  document.documentElement.classList.remove('exam-entry');
  area.hidden = true;
  lab.hidden = false;
  toggle.textContent = '班級與測驗';
}
function showPanel() {
  area.replaceChildren();
  area.hidden = false;
  lab.hidden = true;
  toggle.textContent = '返回實驗練習';
}
function resetRoute() {
  location.href = new URL('./', location.href);
}
function share(parent, type, value, caption) {
  const anchor = link(append(parent, 'p'), caption, { [type]: value });
  const output = status(parent);
  button(parent, '複製連結', async () => {
    try { await navigator.clipboard.writeText(anchor.href); output.textContent = '已複製，可貼到 Google Classroom。'; }
    catch { output.textContent = anchor.href; }
  });
}
function accountControls() {
  const toolbar = append(area, 'div', '', { className: 'controls' });
  append(toolbar, 'span', `${identity.user.name}（${identity.user.email}）`);
  button(toolbar, '登出', async () => {
    try { await api('logout', {}); resetRoute(); }
    catch (error) { append(area, 'p', error.message); }
  });
}

async function dashboard() {
  const version = ++viewVersion;
  showPanel();
  append(area, 'h2', '班級與測驗');
  try {
    identity = await api('me');
    if (version !== viewVersion) return;
    if (!identity.user) {
      if (!identity.google) return append(area, 'p', '這個部署尚未設定 Google 登入。練習可直接使用。');
      if (query.has('login')) append(area, 'p', '登入未完成，請再試一次。如果學校帳號拒絕存取，請聯絡老師確認校方權限。');
      const start = new URL('./auth/start', location.href);
      const destination = new URL('./', location.href);
      for (const key of ['exam', 'join']) if (query.has(key)) { destination.searchParams.set(key, query.get(key)); break; }
      start.searchParams.set('next', destination.pathname + destination.search);
      append(area, 'a', '使用 Google 帳號登入', { href: start.href });
      return;
    }
    if (query.has('exam')) return await showExam(query.get('exam'));
    accountControls();
    if (query.has('join')) {
      const fields = form(area, '加入班級', async () => {
        const classroom = await api('join', { code: query.get('join') });
        append(area, 'p', '已加入 ' + classroom.name);
        resetRoute();
      });
      append(fields, 'span', '確認以目前帳號加入老師邀請的班級。');
    }
    const { owned, joined, exams } = await api('dashboard');
    if (version !== viewVersion) return;
    if (identity.user.teacher) {
      append(area, 'h3', '建立班級');
      const fields = form(area, '建立班級', async () => {
        await api('classes', { name: className.value, domain: domain.value });
        await dashboard();
      });
      const className = input(fields, '班級名稱', 'text', { required: true, maxLength: 150 });
      const domain = input(fields, '學校 Workspace 網域', 'text', { value: identity.user.domain || '', placeholder: '可留空以接受任何 Google 帳號' });
      for (const classroom of owned) {
        const box = append(area, 'section');
        append(box, 'h3', classroom.name);
        share(box, 'join', classroom.code, '班級加入連結');
        const access = form(box, '核准帳號', async () => {
          const { email } = await api('exceptions', { classroom: classroom.id, email: account.value });
          return '已核准 ' + email + '。學生可使用原班級連結加入。';
        });
        const account = input(access, '核准個別 Google 帳號', 'email', { required: true });
        const creator = form(box, '建立測驗', async () => {
          await api('exams', { classroom: classroom.id, title: title.value, lab: experiment.value, prompt: prompt.value,
            opens: opens.value ? opens.value + ':00+08:00' : '', closes: closes.value ? closes.value + ':00+08:00' : '' });
          await dashboard();
        });
        const title = input(creator, '測驗名稱', 'text', { required: true, maxLength: 150 });
        const experiment = options(creator, '實驗', Object.entries(titles));
        const opens = input(creator, '開放時間（臺灣）', 'datetime-local');
        const closes = input(creator, '截止時間（臺灣）', 'datetime-local');
        const prompt = input(creator, '作答任務', 'textarea', { required: true, maxLength: 5000, rows: 3 });
      }
    }
    if (!query.has('join') && !identity.user.teacher) {
      const joiner = form(area, '加入班級', async () => { await api('join', { code: code.value }); await dashboard(); });
      const code = input(joiner, '班級代碼', 'text', { required: true, maxLength: 100 });
    }
    if (joined.length) append(area, 'p', '已加入班級｜' + joined.map(item => item.name).join('、'));
    append(area, 'h3', '測驗');
    if (!exams.length) append(area, 'p', '目前沒有測驗。');
    for (const exam of exams) {
      link(append(area, 'p'), exam.className + '｜' + exam.title, { exam: exam.id });
    }
  } catch (error) {
    if (version !== viewVersion) return;
    append(area, 'p', error.message, { role: 'status' });
  }
}

function grades(parent, attempt) {
  if (!attempt.grade) return append(parent, 'p', '成績待教師發布。');
  const total = attempt.grade.scores.reduce((sum, n) => sum + n, 0);
  append(parent, 'p', `總分 ${total}／100｜${rubric.map((name, i) => name + ' ' + attempt.grade.scores[i]).join('、')}`);
  append(parent, 'p', attempt.grade.comment || '教師未留評語。');
}
async function showExam(id) {
  const version = viewVersion;
  const { exam, teacher, attempt, roster } = await api('exams/' + id);
  if (version !== viewVersion) return;
  showPanel();
  link(append(area, 'p'), '返回班級與測驗', { classroom: 1 });
  accountControls();
  append(area, 'h2', exam.title);
  const time = [
    exam.opens ? '開放於 ' + formatTime(exam.opens) : '立即開放',
    exam.closes ? '截止於 ' + formatTime(exam.closes) : '無截止時間'
  ].join('｜');
  append(area, 'p', time);
  if (teacher) {
    append(area, 'p', exam.prompt);
    share(area, 'exam', id, '測驗作答連結');
    append(area, 'h3', '作答與批改');
    if (!roster.length) append(area, 'p', '班級尚無學生加入。');
    for (const student of roster) {
      const row = append(area, 'div', '', { className: 'controls' });
      append(row, 'span', `${student.name}（${student.email}）｜${student.published ? '已發布' : student.submitted ? '已交卷' : student.attempt ? '有草稿' : '未作答'}`);
      if (student.submitted) button(row, '檢視與批改', () => review(student.attempt, id).catch(error => append(area, 'p', error.message)));
    }
    return;
  }
  const early = exam.opens && exam.opens > Date.now();
  const late = exam.closes && exam.closes <= Date.now();
  if (attempt?.submitted) {
    append(area, 'p', '已交卷｜' + formatTime(attempt.submitted));
    grades(area, attempt);
    openAssessment(exam, attempt.snapshot, true);
    lab.hidden = false;
    return;
  }
  if (early || late) {
    append(area, 'p', early ? '測驗尚未開放。' : '測驗時間已結束。');
    if (late && attempt?.snapshot) { openAssessment(exam, attempt.snapshot, true); lab.hidden = false; }
    return;
  }
  openAssessment(exam, attempt?.snapshot);
  lab.hidden = false;
  const feedback = status(area);
  feedback.textContent = attempt ? '已載入上次儲存的草稿。' : '作答會自動儲存。請完成量測與分析後交卷。';
  active = { id, feedback, submitting: false };
  const submit = button(area, '交卷', async () => {
    if (!confirm('交卷後會鎖定作答。確定交卷嗎？')) return;
    clearTimeout(saveTimer);
    active.submitting = true;
    submit.disabled = true;
    toggle.disabled = true;
    feedback.textContent = '正在交卷…';
    const snapshot = assessmentSnapshot();
    openAssessment(exam, snapshot, true);
    try {
      await saveQueue;
      await api('exams/' + id + '/submit', { snapshot });
    } catch (error) {
      active = { id, feedback, submitting: false };
      openAssessment(exam, snapshot);
      feedback.textContent = error.message + '。請再試一次。';
      submit.disabled = false;
      return;
    } finally {
      toggle.disabled = false;
    }
    active = null;
    feedback.textContent = '交卷成功。';
    showExam(id).catch(error => { feedback.textContent = '已交卷。重新載入即可查看交卷紀錄。' + error.message; });
  });
  button(area, '儲存草稿', () => { clearTimeout(saveTimer); saveDraft(); });
}
function saveDraft() {
  const attempt = active;
  if (!attempt || attempt.submitting) return;
  const snapshot = assessmentSnapshot();
  saveQueue = saveQueue.then(async () => {
    if (active !== attempt || active.submitting) return;
    try {
      await api('exams/' + attempt.id + '/draft', { snapshot });
      attempt.feedback.textContent = '草稿已儲存。';
      return true;
    } catch (error) {
      attempt.feedback.textContent = error.message + '。可重試儲存草稿。';
      return false;
    }
  });
  return saveQueue;
}
async function review(submission, examId) {
  const version = viewVersion;
  const { exam, student, attempt } = await api('submissions/' + submission);
  if (version !== viewVersion) return;
  showPanel();
  button(area, '返回批改清單', () => showExam(examId).catch(error => append(area, 'p', error.message)));
  append(area, 'h2', exam.title + '｜' + student.name);
  append(area, 'p', '交卷時間 ' + formatTime(attempt.submitted));
  const fields = form(area, '儲存批改', async () => {
    const result = await api('submissions/' + submission + '/grade', {
      scores: scores.map(score => score.valueAsNumber), comment: comment.value, publish: published.checked
    });
    return result.published ? '已發布給學生。' : '已儲存批改草稿。';
  });
  const scores = rubric.map((name, i) => input(fields, name + '（0–25）', 'number',
    { min: 0, max: 25, step: 1, required: true, value: attempt.grade?.scores[i] ?? '' }));
  const comment = input(fields, '評語', 'textarea', { value: attempt.grade?.comment || '', maxLength: 5000, rows: 3 });
  const published = input(fields, '發布給學生', 'checkbox', { checked: Boolean(attempt.published) });
  const details = append(area, 'details');
  append(details, 'summary', '檢視操作紀錄與原始讀值');
  const scroll = append(details, 'div', '', { className: 'scroll' });
  const eventLabels = {
    'prepare-refraction': '配置折射器材', 'place-pin': '插針', 'remove-pin': '撤回長針', 'trace-rays': '描繪光路',
    'select-medium': '選擇介質', 'mount-lens': '安裝透鏡', 'change-lens': '更換透鏡',
    'screen-near': '像屏移近', 'screen-far': '像屏移遠', 'near-focus-reading': '近端調焦讀值',
    'select-laser': '切換雷射', 'swap-plate': '更換狹縫', 'align-apparatus': '配置光具座',
    'laser-on': '開啟雷射', 'laser-off': '關閉雷射', 'set-ruler': '設定尺標',
    'record-measurement': '記錄量測', 'adjust': '調整器材', 'delete-reading': '刪除紀錄'
  };
  const table = append(scroll, 'table');
  const heading = table.createTHead().insertRow();
  ['次序', '操作', '參數與讀值'].forEach(text => append(heading, 'th', text, { scope: 'col' }));
  const body = table.createTBody();
  attempt.snapshot.events.forEach(({ type, ...data }, i) => {
    const row = body.insertRow();
    row.insertCell().textContent = i + 1;
    row.insertCell().textContent = eventLabels[type] || ({
      'change-spacing': '調整雙狹縫間距', 'change-single-plate': '更換單狹縫片', 'adjust-screen-distance': '調整屏距'
    })[type] || type;
    row.insertCell().textContent = Object.entries(data).map(([key, value]) => key + ' ' + JSON.stringify(value)).join('｜');
  });
  openAssessment(exam, attempt.snapshot, true);
  lab.hidden = false;
}

document.addEventListener('lab-change', () => {
  if (!active || active.submitting) return;
  clearTimeout(saveTimer);
  active.feedback.textContent = '草稿有變更…';
  saveTimer = setTimeout(saveDraft, 550);
});
toggle.addEventListener('click', () => area.hidden ? dashboard() : practice());
if (query.has('exam') || query.has('join') || query.has('login') || query.has('classroom')) dashboard();
