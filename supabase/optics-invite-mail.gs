const ROSTER_SHEET = '光學測驗名單';
const ROSTER_HEADERS = ['班級代碼', '學號', '姓名', '學校信箱', '寄送狀態'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('光學實驗室')
    .addItem('建立名單工作表', 'prepareOpticsRoster')
    .addItem('寄送班級邀請', 'showOpticsInviteDialog')
    .addToUi();
}

function prepareOpticsRoster() {
  const book = SpreadsheetApp.getActive();
  if (book.getSheetByName(ROSTER_SHEET)) return;
  const sheet = book.insertSheet(ROSTER_SHEET);
  sheet.getRange(1, 1, 1, ROSTER_HEADERS.length).setValues([ROSTER_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange('A:B').setNumberFormat('@');
}

function showOpticsInviteDialog() {
  const html = HtmlService.createHtmlOutput(`
    <meta charset="utf-8">
    <form id="send">
      <p>使用光學實驗室的教師帳號，寄送名單中尚未寄出的邀請。</p>
      <p><label>教師 Email <input name="email" type="email" required autocomplete="username"></label></p>
      <p><label>實驗室密碼 <input name="password" type="password" required autocomplete="current-password"></label></p>
      <button>確認寄送</button>
      <p id="result" role="status"></p>
    </form>
    <script>
      document.getElementById('send').addEventListener('submit', function (event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button');
        const result = document.getElementById('result');
        button.disabled = true;
        result.textContent = '正在處理名單…';
        const password = form.elements.password.value;
        form.elements.password.value = '';
        google.script.run.withSuccessHandler(function (message) {
          result.textContent = message;
          button.disabled = false;
        }).withFailureHandler(function (error) {
          result.textContent = error.message;
          button.disabled = false;
        }).sendOpticsInvites(form.elements.email.value, password);
      });
    </script>
  `).setWidth(420).setHeight(270);
  SpreadsheetApp.getUi().showModalDialog(html, '寄送班級邀請');
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
    try { detail = JSON.parse(response.getContentText()).error; } catch { /* no JSON */ }
    throw new Error(typeof detail === 'string' && status === 400 ? detail : '系統未接受此請求（' + status + '）。');
  }
  return JSON.parse(response.getContentText());
}

function sendOpticsInvites(email, password) {
  if (!email || !password) throw new Error('請輸入教師帳號與密碼。');
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('OPTICS_SUPABASE_URL') || '').replace(/\/$/, '');
  const key = props.getProperty('OPTICS_SUPABASE_PUBLISHABLE_KEY') || '';
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base) || !key) throw new Error('請先設定 Supabase 專案網址與公開金鑰。');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) throw new Error('已有一批邀請正在寄送。');
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(ROSTER_SHEET);
    if (!sheet || sheet.getLastRow() < 2) throw new Error('請先建立工作表並填入名單。');
    const session = requestOpticsJson_(base + '/auth/v1/token?grant_type=password', key, { email: email.trim(), password });
    if (!session.access_token) throw new Error('教師登入失敗。');
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ROSTER_HEADERS.length).getDisplayValues();
    const allowance = Math.min(MailApp.getRemainingDailyQuota(), 30);
    if (allowance < 1) throw new Error('今天的 Google 寄信額度已用完。');
    let sent = 0, failed = 0;
    for (const [index, row] of rows.entries()) {
      const [code, studentNumber, name, address, previous] = row.map(value => value.trim());
      if (!row.slice(0, 4).some(Boolean) || previous.startsWith('已寄出')) continue;
      if (sent + failed >= allowance) break;
      const status = sheet.getRange(index + 2, 5);
      try {
        if (!code || !studentNumber || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
          throw new Error('請檢查班級代碼、學號、姓名與信箱。');
        }
        const invite = requestOpticsJson_(base + '/functions/v1/optics-invite', key,
          { classCode: code, email: address, studentNumber, name }, session.access_token);
        if (typeof invite.link !== 'string' || !invite.link.startsWith('https://')) throw new Error('系統沒有傳回可用連結。');
        const instructions = invite.existing
          ? '你的帳號已加入名單，請使用原本的帳號登入：\n'
          : '請使用以下專屬連結啟用帳號並自行設定密碼。若連結過期，請聯絡老師：\n';
        MailApp.sendEmail(address, '光學實驗室班級邀請', name + '同學你好，\n\n' + instructions + invite.link);
        status.setValue('已寄出｜' + new Date().toISOString());
        sent++;
      } catch (error) {
        status.setValue('失敗｜' + error.message);
        failed++;
      }
    }
    return '本批已寄出 ' + sent + ' 封，失敗 ' + failed + ' 筆。每批最多 30 筆，可再次執行；已寄出的列會略過。';
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}
