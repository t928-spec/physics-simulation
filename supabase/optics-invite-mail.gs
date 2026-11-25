const ROSTER_SHEET = '光學測驗名單';
const ROSTER_HEADERS = ['班級代碼', '學號', '姓名', '學校信箱', '寄送狀態', '班級名稱', '座號'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('光學實驗室')
    .addItem('建立名單工作表', 'prepareOpticsRoster')
    .addItem('寄送班級邀請', 'showOpticsInviteDialog')
    .addItem('同步座號', 'showOpticsSeatDialog')
    .addToUi();
}

function prepareOpticsRoster() {
  const book = SpreadsheetApp.getActive();
  const existing = book.getSheetByName(ROSTER_SHEET);
  if (existing) {
    const header = existing.getRange('F1');
    if (header.isBlank()) header.setValue(ROSTER_HEADERS[5]);
    const seatHeader = existing.getRange('G1');
    if (seatHeader.isBlank()) {
      existing.getRange('F1').copyTo(seatHeader, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      seatHeader.setValue('座號');
    }
    return;
  }
  const sheet = book.insertSheet(ROSTER_SHEET);
  sheet.getRange(1, 1, 1, ROSTER_HEADERS.length).setValues([ROSTER_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('A:B').setNumberFormat('@');
}

function showOpticsInviteDialog() {
  showOpticsRosterDialog_(false);
}

function showOpticsSeatDialog() {
  showOpticsRosterDialog_(true);
}

function showOpticsRosterDialog_(syncSeats) {
  const { rows } = readOpticsRoster_();
  const classes = new Map();
  for (const [rawCode, , , , , rawName] of rows) {
    const code = rawCode.trim().toLowerCase();
    if (code && !classes.get(code)) classes.set(code, rawName.trim());
  }
  if (!classes.size) {
    SpreadsheetApp.getUi().alert('請先在名單的 A 欄填入班級代碼。');
    return;
  }
  const classOptions = JSON.stringify([...classes].sort()).replace(/</g, '\\u003c');
  const title = syncSeats ? '同步座號' : '寄送班級邀請';
  const description = syncSeats ? '選擇班級，同步 G 欄已填寫的座號。空白列會略過。' : '選擇班級後，使用光學實驗室教師帳號寄送該班尚未寄出的邀請。';
  const handler = syncSeats ? 'syncOpticsSeats' : 'sendOpticsInvites';
  const html = HtmlService.createHtmlOutput(`
    <meta charset="utf-8">
    <form id="send">
      <p>${description}</p>
      <p><label>班級 <select name="classCode" required>
        <option value="">請選擇班級</option>
      </select></label></p>
      <p><label>教師 Email <input name="email" type="email" required autocomplete="username"></label></p>
      <p><label>實驗室密碼 <input name="password" type="password" required autocomplete="current-password"></label></p>
      <button>${title}</button>
      <p id="result" role="status"></p>
    </form>
    <script>
      const classSelect = document.querySelector('select[name="classCode"]');
      for (const [code, name] of ${classOptions}) {
        classSelect.add(new Option(name ? name + '（' + code + '）' : code, code));
      }
      document.getElementById('send').addEventListener('submit', function (event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button');
        const result = document.getElementById('result');
        button.disabled = true;
        classSelect.disabled = true;
        result.textContent = '正在處理名單…';
        const password = form.elements.password.value;
        form.elements.password.value = '';
        google.script.run.withSuccessHandler(function (message) {
          result.textContent = message;
          button.disabled = false;
          classSelect.disabled = false;
        }).withFailureHandler(function (error) {
          result.textContent = error.message;
          button.disabled = false;
          classSelect.disabled = false;
        }).${handler}(form.elements.email.value, password, classSelect.value);
      });
    </script>
  `).setWidth(420).setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

function requestOpticsJson_(url, key, payload, bearer) {
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: key, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    followRedirects: false
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    let detail;
    try {
      const body = JSON.parse(response.getContentText());
      detail = body.message || body.error;
      if (body.code === '23505') detail = '班級內有重複的座號，請核對名單。';
    } catch { /* no JSON */ }
    throw new Error(typeof detail === 'string' && [400, 409].includes(status) ? detail : '系統未接受此請求（' + status + '）。');
  }
  return JSON.parse(response.getContentText());
}

function readOpticsRoster_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(ROSTER_SHEET);
  const lastRow = sheet ? sheet.getLastRow() : 0;
  if (lastRow < 2) throw new Error('請先建立工作表並填入名單。');
  const rows = sheet.getRange(2, 1, lastRow - 1, ROSTER_HEADERS.length).getDisplayValues();
  return { sheet, rows };
}

function opticsCredentials_(email, password) {
  if (!email || !password) throw new Error('請輸入教師帳號與密碼。');
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('OPTICS_SUPABASE_URL') || '').replace(/\/$/, '');
  const key = props.getProperty('OPTICS_SUPABASE_PUBLISHABLE_KEY') || '';
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base) || !key) throw new Error('請先設定 Supabase 專案網址與公開金鑰。');
  return { base, key };
}

function syncOpticsSeats(email, password, classCode) {
  const selectedCode = String(classCode || '').trim().toLowerCase();
  if (!selectedCode) throw new Error('請先選擇班級。');
  const { rows } = readOpticsRoster_();
  const seats = [];
  const seenStudents = new Set();
  const seenSeats = new Set();
  for (const [index, row] of rows.entries()) {
    const [code, studentNumber, , , , , seatText] = row.map(value => value.trim());
    if (code.toLowerCase() !== selectedCode || !seatText) continue;
    const seat = Number(seatText);
    if (!/^\d{1,30}$/.test(studentNumber) || !/^\d{1,3}$/.test(seatText) || seat < 1 ||
        seenStudents.has(studentNumber) || seenSeats.has(seat)) {
      throw new Error('第 ' + (index + 2) + ' 列的學號或座號有誤或重複。');
    }
    seenStudents.add(studentNumber);
    seenSeats.add(seat);
    seats.push({ studentNumber, seat });
  }
  if (!seats.length) throw new Error('請先填寫這個班級的座號。');
  const { base, key } = opticsCredentials_(email, password);
  const session = requestOpticsJson_(base + '/auth/v1/token?grant_type=password', key, { email: email.trim(), password });
  if (!session.access_token) throw new Error('教師登入失敗。');
  const rpc = (name, data) => requestOpticsJson_(base + '/rest/v1/rpc/' + name, key, data, session.access_token);
  const classroom = rpc('app_dashboard', {}).owned.find(item => item.code.toLowerCase() === selectedCode);
  if (!classroom) throw new Error('這個班級代碼不在你的教師帳號下。');
  const count = rpc('app_save_class_seats', { p_class: classroom.id, p_rows: seats });
  return classroom.name + ' 已同步 ' + count + ' 筆座號。';
}

function sendOpticsInvites(email, password, classCode) {
  const selectedCode = String(classCode || '').trim().toLowerCase();
  if (!selectedCode) throw new Error('請先選擇要寄送的班級。');
  const { base, key } = opticsCredentials_(email, password);
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) throw new Error('已有一批邀請正在寄送。');
  try {
    const { sheet, rows } = readOpticsRoster_();
    const pending = rows.map((row, index) => ({ fields: row.map(value => value.trim()), index }))
      .filter(({ fields }) => fields[0].toLowerCase() === selectedCode && !fields[4].startsWith('已寄出'));
    if (!pending.length) return '班級 ' + selectedCode + ' 目前沒有待寄送的邀請。';
    const session = requestOpticsJson_(base + '/auth/v1/token?grant_type=password', key, { email: email.trim(), password });
    if (!session.access_token) throw new Error('教師登入失敗。');
    const allowance = Math.min(MailApp.getRemainingDailyQuota(), 30);
    if (allowance < 1) throw new Error('今天的 Google 寄信額度已用完。');
    let sent = 0, failed = 0;
    for (const { fields: [, studentNumber, name, address], index } of pending) {
      if (sent + failed >= allowance) break;
      const status = sheet.getRange(index + 2, 5);
      try {
        if (!studentNumber || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
          throw new Error('請檢查班級代碼、學號、姓名與信箱。');
        }
        const invite = requestOpticsJson_(base + '/functions/v1/optics-invite', key,
          { classCode: selectedCode, email: address, studentNumber, name }, session.access_token);
        if (typeof invite.link !== 'string' || !invite.link.startsWith('https://')) throw new Error('系統沒有傳回可用連結。');
        const instructions = invite.existing
          ? '你的帳號已加入班級，可以使用原本的光學實驗室密碼登入。'
          : '首次啟用（只用一次）\n請點下方專屬連結設定光學實驗室密碼。設好後，請回到上方一般網址登入。如果還沒完成設定，專屬連結就已失效，請聯絡老師。\n' + invite.link;
        const login = '光學實驗室一般網址（請收藏）\nhttps://t928-spec.github.io/physics-simulation/optics/\n' +
          '設定完密碼後，每次請從這個網址進入，點選「班級與測驗」，用完整的學校信箱和你設定的光學實驗室密碼登入。';
        MailApp.sendEmail(address, '光學實驗室班級邀請', name + '同學你好，\n\n' + login + '\n\n' + instructions);
        status.setValue('已寄出｜' + new Date().toISOString());
        sent++;
      } catch (error) {
        status.setValue('失敗｜' + error.message);
        failed++;
      }
    }
    return '班級 ' + selectedCode + ' 本批已寄出 ' + sent + ' 封，失敗 ' + failed + ' 筆。每批最多 30 筆，可再次執行；已寄出的列會略過。';
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}
