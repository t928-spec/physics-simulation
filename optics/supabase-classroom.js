import { assessmentSnapshot, openAssessment } from './lab.js';
import { api } from './supabase-backend.js';

const area = document.getElementById('classroom');
const lab = document.getElementById('lab');
const toggle = document.getElementById('classroom-toggle');
const query = new URLSearchParams(location.search);
const titles = { refraction: '折射率的測定', lens: '薄透鏡成像', slit: '光的干涉與繞射' };
const defaultPrompts = {
  refraction: '使用玻璃磚完成折射率測定。改變入射角，記錄至少 3 組入射角、折射角與折射率。以 sin θr 為橫軸、sin θi 為縱軸繪圖並加入趨勢線。在「分析與結論」說明斜率的物理意義，以及一項可能的量測偏差。',
  lens: '使用凸透鏡，改變物距並調整像屏至成像清晰。記錄至少 3 組物距 p、像距 q 與算得的焦距。以 1/p 為橫軸、1/q 為縱軸繪圖並加入趨勢線。在「分析與結論」說明如何從趨勢線求焦距，以及一項可能的量測偏差。',
  slit: '選擇同一色雷射與同一片雙狹縫，改變狹縫到屏幕的距離 L，記錄至少 3 組 L、相鄰暗紋間距 Δy 與算得的波長。以 L 為橫軸、Δy 為縱軸繪圖並加入趨勢線。在「分析與結論」說明斜率與波長的關係，並留意單位換算。'
};
const rubric = ['實驗步驟', '器材使用', '讀值', '數據分析'];
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
async function practice() {
  if (active) {
    if (active.submitting) return;
    toggle.disabled = true;
    clearTimeout(saveTimer);
    try {
      if (!draftClosed(active) && !(await saveDraft())) return;
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
  document.body.classList.remove('student-exam');
  toggle.textContent = '班級與測驗';
}
function showPanel() {
  document.body.classList.remove('student-exam');
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
function classInvitation(parent, code) {
  const row = append(parent, 'div', '', { className: 'controls' });
  const label = append(row, 'span', '班級代碼 ');
  append(label, 'code', code);
  const output = status(parent);
  button(row, '複製班級代碼', async () => {
    try { await navigator.clipboard.writeText(code); output.textContent = '已複製班級代碼。'; }
    catch { output.textContent = '請手動複製班級代碼：' + code; }
  });
  append(parent, 'p', '把這個代碼填入教師試算表的「班級代碼」欄，再從試算表寄送邀請。學生從學校信箱啟用後會自動加入。');
}
function accountControls() {
  const toolbar = append(area, 'div', '', { className: 'controls' });
  append(toolbar, 'span', `${identity.user.name}（${identity.user.label}）`);
  button(toolbar, '登出', async () => {
    try { await api('logout', {}); resetRoute(); }
    catch (error) { append(area, 'p', error.message); }
  });
}
function loginPanel() {
  append(area, 'p', '第一次使用請從學校信箱開啟老師寄送的邀請。啟用後可用學校 Email 和密碼登入。');
  const login = form(area, '登入', async () => {
    await api('login', { email: loginEmail.value, password: loginPassword.value });
    await dashboard();
  });
  const loginEmail = input(login, 'Email', 'email', { required: true, autocomplete: 'username' });
  const loginPassword = input(login, '密碼', 'password', { required: true, autocomplete: 'current-password' });

}

function activationPanel() {
  const token = new URLSearchParams(location.hash.slice(1)).get('token_hash');
  append(area, 'h3', '設定實驗室密碼');
  if (!token) {
    append(area, 'p', '邀請連結不完整。請重新開啟通知信中的連結，或請老師重寄。');
    return;
  }
  let verified = false;
  const fields = form(area, '設定密碼並啟用', async () => {
    if (first.value !== second.value) throw new Error('兩次輸入的密碼不同。');
    if (!verified) {
      await api('verify-invite', { token });
      verified = true;
    }
    await api('set-invite-password', { password: first.value });
    await api('claim-invites');
    query.delete('activate');
    const url = new URL(location.href);
    url.hash = '';
    url.search = query.toString();
    history.replaceState(null, '', url);
    await dashboard();
  });
  const first = input(fields, '新密碼（至少 8 個字元）', 'password', { required: true, minLength: 8, autocomplete: 'new-password' });
  const second = input(fields, '再輸入一次密碼', 'password', { required: true, minLength: 8, autocomplete: 'new-password' });
}

async function dashboard() {
  const version = ++viewVersion;
  showPanel();
  append(area, 'h2', '班級與測驗');
  if (query.has('activate')) return activationPanel();
  try {
    identity = await api('me');
    if (version !== viewVersion) return;
    if (!identity.user) return loginPanel();
    if (query.has('exam')) return await showExam(query.get('exam'));
    accountControls();
    if (query.has('join') && !identity.user.teacher) {
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
        await api('classes', { name: className.value });
        await dashboard();
      });
      const className = input(fields, '班級名稱', 'text', { required: true, maxLength: 150 });
      for (const classroom of owned) {
        const box = append(area, 'section');
        append(box, 'h3', classroom.name);
        classInvitation(box, classroom.code);
        const creator = form(box, '建立測驗', async () => {
          await api('exams', { classroom: classroom.id, title: title.value, lab: experiment.value, prompt: prompt.value,
            opens: opens.value ? opens.value + ':00+08:00' : '', closes: closes.value ? closes.value + ':00+08:00' : '',
            autoPublish: autoPublish.checked });
          await dashboard();
        });
        const title = input(creator, '測驗名稱', 'text', { required: true, maxLength: 150 });
        const experiment = options(creator, '實驗', Object.entries(titles));
        const opens = input(creator, '開放時間（臺灣）', 'datetime-local');
        const closes = input(creator, '截止時間（臺灣）', 'datetime-local');
        const prompt = input(creator, '作答任務', 'textarea', { required: true, maxLength: 5000, rows: 3 });
        let previousDefault = defaultPrompts[experiment.value];
        prompt.value = previousDefault;
        experiment.addEventListener('change', () => {
          const nextDefault = defaultPrompts[experiment.value];
          if (!prompt.value.trim() || prompt.value === previousDefault) prompt.value = nextDefault;
          previousDefault = nextDefault;
        });
        button(creator, '套用此實驗的預設任務', () => {
          if (prompt.value.trim() && prompt.value !== previousDefault &&
              !confirm('要用預設任務取代目前的文字嗎？')) return;
          prompt.value = previousDefault;
        });
        const autoPublish = input(creator, '交卷後立即發布成績（學生馬上看到分數與回饋）', 'checkbox', { checked: false });
        append(creator, 'span', '系統會依「實驗步驟、器材使用、讀值、數據分析」各 25 分自動批改，老師可再調整。');
      }
    }
    if (!query.has('join') && !identity.user.teacher) {
      const joiner = form(area, '加入班級', async () => { await api('join', { code: code.value }); await dashboard(); });
      const code = input(joiner, '班級代碼', 'text', { required: true, maxLength: 100 });
    }
    if (joined.length) append(area, 'p', '已加入班級｜' + joined.map(item => item.name).join('、'));
    append(area, 'h3', '測驗');
    if (!exams.length) append(area, 'p', '目前沒有測驗。');
    else {
      const list = append(area, 'ul', '', { className: 'exam-list' });
      for (const exam of exams) {
        const card = link(append(list, 'li'), '', { exam: exam.id });
        card.className = 'exam-card';
        const summary = append(card, 'span', '', { className: 'exam-card-summary' });
        append(summary, 'span', '班級 ' + exam.className, { className: 'exam-card-class' });
        append(summary, 'strong', exam.title);
        append(card, 'span', '›', { className: 'exam-card-arrow' }).setAttribute('aria-hidden', 'true');
      }
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
  append(parent, 'p', attempt.grade.comment || '教師未留評語。', { style: 'white-space: pre-line' });
}
async function showExam(id) {
  const version = viewVersion;
  const { exam, teacher, attempt, roster, canDelete } = await api('exams/' + id);
  if (version !== viewVersion) return;
  showPanel();
  if (!teacher) {
    document.body.classList.add('student-exam');
    append(area, 'p', '測驗模式', { className: 'exam-mode-label' });
  }
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
    if (canDelete) {
      const deletionStatus = status(area);
      const remove = button(area, '刪除測驗', async () => {
        if (!confirm('確定刪除「' + exam.title + '」？刪除後無法復原。')) return;
        remove.disabled = true;
        try {
          await api('exams/' + id + '/delete');
          location.href = new URL('?classroom=1', location.href);
        } catch (error) {
          deletionStatus.textContent = error.message;
          remove.disabled = false;
        }
      });
    } else if (canDelete === false) {
      append(area, 'p', '已有學生儲存草稿或交卷，無法刪除此測驗。');
    }
    append(area, 'h3', '作答與批改');
    if (!roster.length) append(area, 'p', '班級尚無學生加入。');
    if (roster.some(student => student.submitted && !student.published)) {
      const output = status(area);
      button(area, '發布全部已交卷學生的成績', async () => {
        if (!confirm('確定把所有已交卷學生的目前成績發布給學生嗎？')) return;
        try {
          const { count } = await api('exams/' + id + '/publish', {});
          await showExam(id);
          append(area, 'p', `已發布 ${count} 份成績。`, { role: 'status' });
        } catch (error) { output.textContent = error.message; }
      });
    }
    for (const student of roster) {
      const row = append(area, 'div', '', { className: 'controls' });
      const state = student.published ? '已發布' : student.submitted ? '已交卷' : student.attempt ? '有草稿' : '未作答';
      append(row, 'span', `${student.name}（${student.label}）｜${state}` + (student.total == null ? '' : `｜${student.total} 分`));
      if (student.submitted) button(row, '檢視與批改', () => review(student.attempt, id).catch(error => append(area, 'p', error.message)));
    }
    return;
  }
  const early = exam.opens && exam.opens > Date.now();
  const submitUntil = exam.submitUntil ?? exam.closes;
  const late = submitUntil && submitUntil <= Date.now();
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
  const attemptState = { id, feedback, submitting: false, draftCloses: exam.closes };
  active = attemptState;
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
      attemptState.submitting = false;
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
  const save = button(area, '儲存草稿', () => { clearTimeout(saveTimer); saveDraft(); });
  if (draftClosed(attemptState)) {
    save.hidden = true;
    showGraceNotice(attemptState);
  }
}
function draftClosed(attempt) {
  return Boolean(attempt.draftCloses && Date.now() >= attempt.draftCloses);
}
function showGraceNotice(attempt) {
  attempt.feedback.textContent = '草稿儲存已截止。若還在 30 秒寬限內，請直接交卷。';
}
function saveDraft() {
  const attempt = active;
  if (!attempt || attempt.submitting) return;
  if (draftClosed(attempt)) {
    showGraceNotice(attempt);
    return;
  }
  const snapshot = assessmentSnapshot();
  saveQueue = saveQueue.then(async () => {
    if (active !== attempt || active.submitting) return;
    if (draftClosed(attempt)) {
      showGraceNotice(attempt);
      return;
    }
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
  const total = append(append(area, 'p'), 'strong', '', { role: 'status' });
  if (attempt.grade?.source === 'auto') append(area, 'p', '以下分數與評語是系統自動批改的結果，可以調整後儲存。');
  const fields = form(area, '儲存批改', async () => {
    const result = await api('submissions/' + submission + '/grade', {
      scores: scores.map(score => score.valueAsNumber), comment: comment.value, publish: published.checked
    });
    return result.published ? '已發布給學生。' : '已儲存批改草稿。';
  });
  const scores = rubric.map((name, i) => input(fields, name + '（0–25）', 'number',
    { min: 0, max: 25, step: 1, required: true, value: attempt.grade?.scores[i] ?? '' }));
  const updateTotal = () => {
    total.textContent = scores.every(score => score.validity.valid)
      ? '總分 ' + scores.reduce((sum, score) => sum + score.valueAsNumber, 0) + '／100'
      : '總分：請填妥四項分數';
  };
  for (const score of scores) score.addEventListener('input', updateTotal);
  updateTotal();
  const comment = input(fields, '評語', 'textarea', { value: attempt.grade?.comment || '', maxLength: 5000, rows: 6 });
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
  if (draftClosed(active)) {
    showGraceNotice(active);
    return;
  }
  active.feedback.textContent = '草稿有變更…';
  saveTimer = setTimeout(saveDraft, 550);
});
toggle.addEventListener('click', () => area.hidden ? dashboard() : practice());
if (query.has('exam') || query.has('join') || query.has('login') || query.has('classroom') || query.has('activate')) dashboard();
