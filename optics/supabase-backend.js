// 班級與測驗的後端：把 classroom.js 原本呼叫的 api(路徑, 資料) 轉成 Supabase 的登入與資料庫函式。
// supabase-js 只在第一次需要時才載入，所以即使連不上 Supabase，練習模式也不受影響。
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let client;

// 測試用：注入假的 client
export function useClientForTest(fake) { client = fake; }

async function supabase() {
  if (client) return client;
  if (!SUPABASE_URL || SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_ANON_KEY.includes('YOUR-ANON')) {
    throw new Error('尚未設定 Supabase。請老師編輯 optics/supabase-config.js。練習模式不受影響。');
  }
  const { createClient } = await import(SUPABASE_JS);
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return client;
}

const messages = [
  [/invalid login credentials/i, 'Email 或密碼錯誤。'],
  [/user already registered|already been registered/i, '這個 Email 已經註冊過，請直接登入。'],
  [/password should be at least|weak.password/i, '密碼太短，請至少使用 6 個字元。'],
  [/unable to validate email|invalid format|email address .* is invalid/i, 'Email 格式不正確。'],
  [/email not confirmed/i, '這個帳號還沒完成 Email 驗證。請聯絡老師。'],
  [/rate limit|too many requests/i, '操作太頻繁，請稍等一分鐘再試。'],
  [/failed to fetch|networkerror|load failed/i, '無法連線，請檢查網路後再試。'],
  [/jwt expired|invalid jwt|not authenticated/i, '登入已過期，請重新登入。']
];
function explain(error) {
  const text = error?.message || String(error);
  return new Error(messages.find(([pattern]) => pattern.test(text))?.[1] || text);
}

async function rpc(name, args = {}) {
  const sb = await supabase();
  const { data, error } = await sb.rpc(name, args);
  if (error) throw explain(error);
  return data;
}

export async function api(path, data = {}) {
  const sb = await supabase();

  if (path === 'me') {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { user: null };
    await rpc('app_claim_invites');
    const result = await rpc('app_me');
    if (!result?.user) await sb.auth.signOut();
    return result;
  }
  if (path === 'login') {
    const { error } = await sb.auth.signInWithPassword({ email: data.email.trim(), password: data.password });
    if (error) throw explain(error);
    return {};
  }
  if (path === 'verify-invite') {
    const { error } = await sb.auth.verifyOtp({ token_hash: data.token, type: 'invite' });
    if (error) throw new Error('邀請連結無效、已使用或已過期，請聯絡老師。');
    return {};
  }
  if (path === 'set-invite-password') {
    const { error } = await sb.auth.updateUser({ password: data.password });
    if (error) throw explain(error);
    return {};
  }
  if (path === 'claim-invites') return rpc('app_claim_invites');
  if (path === 'logout') {
    const { error } = await sb.auth.signOut();
    if (error) throw explain(error);
    return {};
  }

  if (path === 'dashboard') return rpc('app_dashboard');
  if (path === 'join') return rpc('app_join', { p_code: data.code });
  if (path === 'classes') return rpc('app_create_class', { p_name: data.name });
  if (path === 'exams') {
    return rpc('app_create_exam', {
      p_class: data.classroom, p_title: data.title, p_lab: data.lab, p_prompt: data.prompt,
      p_opens: data.opens || null, p_closes: data.closes || null, p_auto_publish: Boolean(data.autoPublish)
    });
  }

  let match;
  if ((match = path.match(/^exams\/([^/]+)$/))) return rpc('app_get_exam', { p_exam: match[1] });
  if ((match = path.match(/^exams\/([^/]+)\/delete$/))) return rpc('app_delete_empty_exam', { p_exam: match[1] });
  if ((match = path.match(/^exams\/([^/]+)\/draft$/))) return rpc('app_save_draft', { p_exam: match[1], p_snapshot: data.snapshot });
  if ((match = path.match(/^exams\/([^/]+)\/submit$/))) return rpc('app_submit', { p_exam: match[1], p_snapshot: data.snapshot });
  if ((match = path.match(/^exams\/([^/]+)\/publish$/))) return rpc('app_publish_all', { p_exam: match[1] });
  if ((match = path.match(/^submissions\/([^/]+)$/))) return rpc('app_get_submission', { p_attempt: match[1] });
  if ((match = path.match(/^submissions\/([^/]+)\/grade$/))) {
    return rpc('app_grade', {
      p_attempt: match[1], p_scores: data.scores, p_comment: data.comment || '', p_publish: Boolean(data.publish)
    });
  }
  throw new Error('未知的操作：' + path);
}
