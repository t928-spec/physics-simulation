import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const url = Deno.env.get('SUPABASE_URL') ?? '';
const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const site = Deno.env.get('OPTICS_SITE_URL') ?? '';
const domains = (Deno.env.get('OPTICS_SCHOOL_DOMAINS') ?? '').split(',').map(domain => domain.trim().toLowerCase()).filter(Boolean);
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: '請使用 POST。' }, 405);
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: '請先登入教師帳號。' }, 401);
  if (!domains.length || !site.startsWith('https://')) return json({ error: '尚未設定光學實驗室網址與學校信箱網域。' }, 503);

  let fields;
  try { fields = await request.json(); } catch { return json({ error: '邀請資料格式錯誤。' }, 400); }
  const { classCode, email, studentNumber, name } = fields ?? {};
  const addr = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!domains.includes(addr.split('@')[1]) || addr.split('@').length !== 2 ||
      typeof classCode !== 'string' || typeof studentNumber !== 'string' || typeof name !== 'string') {
    return json({ error: '請檢查班級、學號、姓名與學校信箱。' }, 400);
  }

  const teacher = createClient(url, publicKey, { ...clientOptions, global: { headers: { Authorization: auth } } });
  const { data: user, error: authError } = await teacher.auth.getUser(auth.slice(7));
  if (authError || !user.user) return json({ error: '教師登入已失效。' }, 401);
  const { data: roster, error: rosterError } = await teacher.rpc('app_prepare_invite', {
    p_class_code: classCode, p_email: addr, p_student_number: studentNumber, p_student_name: name
  });
  if (rosterError) return json({ error: '無法匯入此列。請確認班級權限、學號是否重複，以及信箱格式。' }, 400);
  if (roster.existing) return json({ link: site, existing: true });

  const admin = createClient(url, secret, clientOptions);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email: addr, options: { redirectTo: site } });
  const token = data?.properties?.hashed_token;
  if (error || !token) return json({ error: '無法產生啟用連結，請稍後重試。' }, 502);
  const link = new URL(site);
  link.searchParams.set('activate', '1');
  link.hash = new URLSearchParams({ token_hash: token }).toString();
  return json({ link: link.href, existing: false });
});
