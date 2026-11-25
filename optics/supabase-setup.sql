-- =====================================================================
-- 光學實驗室「班級與測驗」資料庫設定（Supabase）
--
-- 使用方式：Supabase 後台 → SQL Editor → New query → 貼上整份 → Run
-- 這份腳本可以重複執行（更新批改規則時，重新貼上再 Run 即可）。
--
-- 設計重點
--   1. 資料表全部開啟 RLS 且不開放任何直接存取；前端只能呼叫下面的 app_* 函式。
--   2. 學生只能讀到自己的作答；老師只能讀到自己班級的作答。
--   3. 每位學生的實驗參數（折射率、焦距、波長）由伺服器依「測驗＋學生」決定，
--      同班同學的數據不會一樣。
--   4. 交卷時由伺服器自動批改（四個評分項各 25 分），老師可再調整。
-- =====================================================================

create schema if not exists app_private;

-- ---------------------------------------------------------------------
-- 資料表
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null,
  sid         text,                              -- 學號或座號
  is_teacher  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 150),
  code        text not null unique,
  teacher_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id    uuid not null references public.classes (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.exams (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 150),
  lab           text not null check (lab in ('refraction', 'lens', 'slit')),
  prompt        text not null check (char_length(prompt) between 1 and 5000),
  opens_at      timestamptz,
  closes_at     timestamptz,
  auto_publish  boolean not null default false,
  created_at    timestamptz not null default now(),
  check (opens_at is null or closes_at is null or opens_at < closes_at)
);

create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  exam_id       uuid not null references public.exams (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  snapshot      jsonb,
  updated_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  scores        int[],                           -- 目前採計的四項分數
  comment       text,                            -- 目前採計的評語
  grade_source  text check (grade_source in ('auto', 'teacher')),
  published     boolean not null default false,
  auto_scores   int[],                           -- 自動批改的原始結果（保留供比對）
  auto_comment  text,
  unique (exam_id, student_id)
);

create index if not exists attempts_exam_idx on public.attempts (exam_id);
create index if not exists class_members_student_idx on public.class_members (student_id);

-- 全部鎖死：前端（anon / authenticated）不能直接讀寫資料表
alter table public.profiles       enable row level security;
alter table public.classes        enable row level security;
alter table public.class_members  enable row level security;
alter table public.exams          enable row level security;
alter table public.attempts       enable row level security;
revoke all on table public.profiles, public.classes, public.class_members,
                    public.exams, public.attempts from anon, authenticated;

-- ---------------------------------------------------------------------
-- 學生資料由名單啟用函式建立。教師由專案管理員建立對應的 profile。
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- 小工具
-- ---------------------------------------------------------------------
create or replace function app_private.uid() returns uuid
language plpgsql stable as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '請先登入'; end if;
  return u;
end $$;

create or replace function app_private.is_teacher(p_user uuid) returns boolean
language sql stable as $$
  select coalesce((select is_teacher from public.profiles where id = p_user), false)
$$;

create or replace function app_private.label(p public.profiles) returns text
language sql immutable as $$ select coalesce(nullif(p.sid, ''), p.email) $$;

create or replace function app_private.ms(t timestamptz) returns bigint
language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function app_private.num(j jsonb) returns numeric
language sql immutable as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric end
$$;

create or replace function app_private.to_int_array(j jsonb) returns int[]
language sql immutable as $$
  select case when jsonb_typeof(j) = 'array'
    then (select array_agg((x.value)::int order by x.ord)
          from jsonb_array_elements_text(j) with ordinality as x(value, ord))
  end
$$;

-- 每位學生在每次測驗的專屬參數（0–6），模擬器依此微調折射率、焦距、波長
create or replace function app_private.exam_seed(p_exam uuid, p_student uuid) returns int
language sql immutable as $$
  select ((hashtext(p_exam::text || p_student::text)::bigint & 2147483647) % 7)::int
$$;

create or replace function app_private.grace() returns interval
language sql immutable as $$ select interval '30 seconds' $$;

create or replace function app_private.exam_json(e public.exams, p_student uuid, p_hide_prompt boolean default false)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'lab', e.lab,
    'prompt', case when p_hide_prompt then '' else e.prompt end,
    'opens', case when e.opens_at is null then null else app_private.ms(e.opens_at) end,
    'closes', case when e.closes_at is null then null else app_private.ms(e.closes_at) end,
    'submitUntil', app_private.ms(e.closes_at + app_private.grace()),
    'seed', app_private.exam_seed(e.id, p_student),
    'autoPublish', e.auto_publish,
    'className', (select c.name from public.classes c where c.id = e.class_id)
  )
$$;

-- 模擬器內的「真值」（與 lab.js 的參數一致）
create or replace function app_private.true_index(p_medium text, p_seed int) returns numeric
language sql immutable as $$
  select (case p_medium when 'water' then 1.333 when 'salt' then 1.36 when 'glass' then 1.50 end) + p_seed * 0.002
$$;

create or replace function app_private.pt_angle(x1 numeric, y1 numeric, x2 numeric, y2 numeric) returns numeric
language sql immutable as $$
  select degrees(atan2((y2 - y1)::float8, (x2 - x1)::float8))::numeric
$$;

-- ---------------------------------------------------------------------
-- 自動批改：四個評分項各 25 分
--   實驗步驟：是否依正確流程完成每一筆量測，並完成足夠的組數
--   器材使用：是否改變變因（入射角／物距／屏距），取得足夠多且範圍夠廣的條件
--   讀　　值：讀出的數值與器材實際狀態的吻合程度
--   數據分析：計算是否正確、結果與真值的誤差、趨勢線、結論
-- ---------------------------------------------------------------------
create or replace function app_private.grade_snapshot(p_lab text, p_seed int, p_snap jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  ev  jsonb := case when jsonb_typeof(p_snap -> 'events') = 'array' then p_snap -> 'events' else '[]'::jsonb end;
  rws jsonb := case when jsonb_typeof(p_snap -> 'rows')   = 'array' then p_snap -> 'rows'   else '[]'::jsonb end;
  e jsonb; t text;
  -- 流程狀態
  prepared boolean := false; npins int := 0; traced boolean := false;
  mounted boolean := false; near_done boolean := false;
  aligned boolean := false; laser_on boolean := false; ruler_set boolean := false;
  total_rec int := 0; good_rec int := 0;
  -- 逐筆評估
  recs jsonb[]; used boolean[]; k int; m int; r jsonb; s jsonb;
  n_rows int := 0; sum_read numeric := 0; n_full int := 0; n_half int := 0; n_bad int := 0;
  n_calc_ok int := 0; sum_err numeric := 0; n_err int := 0;
  conds numeric[] := '{}'; grps text[] := '{}';
  rd numeric; calc_ok boolean; res numeric; truth numeric; cond numeric;
  -- 折射率
  i_val numeric; r_val numeric; ig numeric; rg numeric; err numeric; ncalc numeric;
  ax numeric; ay numeric; bx numeric; by_ numeric; cx numeric; cy numeric;
  -- 透鏡
  p_val numeric; q_val numeric; p_set numeric; f_true numeric; q_true numeric; fp numeric; fq numeric;
  convex boolean; fcalc numeric; dn numeric;
  -- 狹縫
  l_val numeric; dy_val numeric; lam numeric; wid numeric; dbl boolean; ls numeric; sp numeric;
  d_used numeric; intv numeric; rel numeric; fdy numeric; fl numeric; known numeric;
  -- 分數
  best_d int; best_spread numeric; thr numeric; stp numeric;
  s_step int; s_equip int; s_read int; s_ana int; a_calc int; a_acc int; a_graph int; a_text int;
  mean_err numeric; text_len int; has_fit boolean; n_unver int := 0; truncated boolean;
  var_name text; var_unit text; flow text; read_hint text; last_lens text;
  c1 text; c2 text; c3 text; c4 text;
begin
  -- 模擬器最多記錄 300 筆操作；超過時，後面的量測無法對應到操作紀錄
  truncated := jsonb_array_length(ev) >= 300;

  -- 1) 流程檢查：依事件順序模擬操作
  for e in select value from jsonb_array_elements(ev) loop
    t := e ->> 'type';
    if p_lab = 'refraction' then
      if t = 'prepare-refraction' then prepared := true; npins := 0; traced := false;
      elsif t = 'select-medium' then prepared := false; npins := 0; traced := false;
      elsif t = 'place-pin' then if prepared then npins := npins + 1; end if;
      elsif t = 'remove-pin' then npins := greatest(npins - 1, 0);
      elsif t = 'trace-rays' then
        if prepared and jsonb_typeof(e -> 'pins') = 'array' and jsonb_array_length(e -> 'pins') >= 2 then traced := true; end if;
      elsif t = 'record-measurement' then
        total_rec := total_rec + 1;
        if traced then good_rec := good_rec + 1; end if;
        traced := false;
      end if;
    elsif p_lab = 'lens' then
      if t = 'mount-lens' then mounted := true; near_done := false;
      elsif t = 'change-lens' then mounted := false; near_done := false;
      elsif t = 'screen-near' then near_done := false;
      elsif t = 'near-focus-reading' then near_done := true;
      elsif t = 'record-measurement' then
        total_rec := total_rec + 1;
        last_lens := e -> 'setup' ->> 'lens';
        if mounted and (last_lens = 'concave' or near_done) then good_rec := good_rec + 1; end if;
        near_done := false;
      end if;
    else
      if t in ('swap-plate', 'change-spacing', 'change-single-plate') then
        aligned := false; laser_on := false; ruler_set := false;
      elsif t = 'align-apparatus' then aligned := true;
      elsif t = 'laser-on' then laser_on := aligned;
      elsif t = 'laser-off' then laser_on := false; ruler_set := false;
      elsif t in ('select-laser', 'adjust-screen-distance') then ruler_set := false;
      elsif t = 'set-ruler' then ruler_set := laser_on;
      elsif t = 'record-measurement' then
        total_rec := total_rec + 1;
        if aligned and laser_on and ruler_set then good_rec := good_rec + 1; end if;
        ruler_set := false;
      end if;
    end if;
  end loop;

  -- 2) 把留在表格裡的每一筆數據，對應回當時的器材設定
  select coalesce(array_agg(x.value order by x.ord), '{}'::jsonb[]) into recs
  from jsonb_array_elements(ev) with ordinality as x(value, ord)
  where x.value ->> 'type' = 'record-measurement';
  used := array_fill(false, array[greatest(coalesce(array_length(recs, 1), 0), 1)]);

  for k in 0 .. jsonb_array_length(rws) - 1 loop
    r := rws -> k;
    s := null;
    for m in 1 .. coalesce(array_length(recs, 1), 0) loop
      if not used[m] and (recs[m] -> 'row') = r then
        used[m] := true; s := recs[m] -> 'setup'; exit;
      end if;
    end loop;
    -- 操作紀錄達上限而對不上的數據：不扣分、不計分，交給老師複核
    if s is null and truncated then n_unver := n_unver + 1; continue; end if;
    rd := 0; calc_ok := false; res := app_private.num(r -> 'result'); truth := null; cond := null;

    if p_lab = 'refraction' then
      i_val := app_private.num(r -> 'i'); r_val := app_private.num(r -> 'r'); cond := i_val;
      ig := null; rg := null;
      if s is not null and jsonb_typeof(s -> 'pins') = 'array' then
        truth := app_private.true_index(s ->> 'medium', p_seed);
        ax := app_private.num(s -> 'pins' -> 0 -> 0); ay := app_private.num(s -> 'pins' -> 0 -> 1);
        bx := app_private.num(s -> 'pins' -> 1 -> 0); by_ := app_private.num(s -> 'pins' -> 1 -> 1);
        cx := app_private.num(s -> 'pins' -> 2 -> 0); cy := app_private.num(s -> 'pins' -> 2 -> 1);
        if (s ->> 'medium') = 'glass' then
          if ax is not null and bx is not null and cx is not null then
            ig := abs(app_private.pt_angle(ax, ay, bx, by_));
            rg := abs(app_private.pt_angle(bx, by_, cx, cy));
          end if;
        elsif ax is not null and bx is not null then
          ig := abs(app_private.pt_angle(ax, ay, 300, 145));
          rg := abs(app_private.pt_angle(300, 145, bx, by_));
        end if;
        if ig is not null and i_val is not null and r_val is not null then
          err := greatest(abs(i_val - ig), abs(r_val - rg));
          rd := case when err <= 2 then 1 when err <= 4 then 0.5 else 0 end;
        end if;
      end if;
      if res is not null and i_val > 0 and i_val < 90 and r_val > 0 and r_val < 90 then
        ncalc := sin(radians(i_val::float8))::numeric / sin(radians(r_val::float8))::numeric;
        calc_ok := abs(res - ncalc) <= greatest(0.001, 0.045 * abs(ncalc));
      end if;

    elsif p_lab = 'lens' then
      p_val := app_private.num(r -> 'p'); q_val := app_private.num(r -> 'q'); cond := p_val;
      if s is not null then
        p_set := app_private.num(s -> 'p');
        convex := (s ->> 'lens') = 'convex';
        f_true := case when convex then 15 + p_seed * 0.2 else -(15 + p_seed * 0.2) end;
        truth := f_true;
        dn := case when p_set > 0 then 1 / f_true - 1 / p_set end;
        if dn is not null and abs(dn) > 0.000000001 and p_val is not null and q_val is not null then
          q_true := 1 / dn;
          fp := case when abs(p_val - p_set) <= 0.55 then 1 when abs(p_val - p_set) <= 1.1 then 0.5 else 0 end;
          if convex then
            fq := case when abs(q_val - q_true) <= 1.5 then 1 when abs(q_val - q_true) <= 3 then 0.5 else 0 end;
          else
            fq := case when q_val < 0 and abs(q_val - q_true) <= 0.65 then 1
                       when q_val < 0 and abs(q_val - q_true) <= 1.3 then 0.5 else 0 end;
          end if;
          rd := least(fp, fq);
        end if;
      end if;
      if res is not null and p_val > 0 and q_val is not null and q_val <> 0 and (1 / p_val + 1 / q_val) <> 0 then
        fcalc := 1 / (1 / p_val + 1 / q_val);
        calc_ok := abs(res - fcalc) <= greatest(0.001, 0.045 * abs(fcalc));
      end if;

    else
      l_val := app_private.num(r -> 'L'); dy_val := app_private.num(r -> 'dy'); cond := l_val;
      if s is not null then
        lam := (case when (s ->> 'color') = 'red' then 650 else 532 end) + p_seed;
        wid := case when app_private.num(s -> 'variant') = 1 then 0.10 else 0.16 end;
        dbl := (s ->> 'plate') = 'double';
        ls := app_private.num(s -> 'L'); sp := app_private.num(s -> 'spacing');
        truth := case when dbl then lam else wid end;
        d_used := case when dbl then sp else wid end;
        if ls is not null and d_used > 0 and dy_val is not null and l_val is not null then
          intv := lam * ls / (10000 * d_used);
          rel := abs(dy_val - intv) / intv;
          fdy := case when rel <= 0.10 then 1 when rel <= 0.25 then 0.5 else 0 end;
          fl  := case when abs(l_val - ls) <= 0.05 then 1 else 0.5 end;
          rd := fdy * fl;
        end if;
      end if;
      sp := app_private.num(r -> 'spacing');
      if res is not null and l_val > 0 and dy_val > 0 then
        if sp is not null then
          fcalc := 10000 * sp * dy_val / l_val;
        else
          known := app_private.num(r -> 'lambda');
          fcalc := case when known > 0 then known * l_val / (10000 * dy_val) end;
        end if;
        calc_ok := fcalc is not null and abs(res - fcalc) <= greatest(0.001, 0.045 * abs(fcalc));
      end if;
    end if;

    -- 對不上任何實際操作的數據（例如直接編造的數字）不採計
    if s is null then calc_ok := false; cond := null; end if;

    n_rows := n_rows + 1;
    sum_read := sum_read + rd;
    if rd = 1 then n_full := n_full + 1; elsif rd > 0 then n_half := n_half + 1; else n_bad := n_bad + 1; end if;
    if calc_ok then n_calc_ok := n_calc_ok + 1; end if;
    if res is not null and truth is not null and truth <> 0 then
      sum_err := sum_err + abs(res - truth) / abs(truth); n_err := n_err + 1;
    end if;
    if cond is not null then conds := conds || cond; grps := grps || coalesce(r ->> 'group', ''); end if;
  end loop;

  -- 3) 條件涵蓋度（取數據最多樣的那一組）
  stp := case p_lab when 'refraction' then 5 when 'lens' then 1 else 0.1 end;
  thr := case p_lab when 'refraction' then 30 when 'lens' then 10 else 0.6 end;
  var_name := case p_lab when 'refraction' then '入射角' when 'lens' then '物距' else '屏距' end;
  var_unit := case p_lab when 'refraction' then '°' when 'lens' then ' cm' else ' m' end;
  flow := case p_lab
    when 'refraction' then '配置器材 → 插針 → 移去介質並畫線 → 記錄'
    when 'lens' then case when last_lens = 'concave'
                       then '裝上光具座 → 調整視點與參考物直到視差消失 → 記錄'
                       else '裝上光具座 → 近端、遠端各調焦一次 → 記錄' end
    else '配置器材 → 開啟雷射 → 設定兩個尺標 → 記錄' end;
  read_hint := case p_lab
    when 'refraction' then '請在「俯視量角」下，以法線為 0° 讀出入射線與折射線的角度。'
    when 'lens' then '請核對光具座刻度與像距的正負號；凸透鏡要找到最清晰的像，凹透鏡要讓視差消失。'
    else '請把兩個尺標對準相鄰暗紋最暗的中心，並核對屏距。' end;

  select q.d, q.spr into best_d, best_spread from (
    select count(distinct round(c / stp)) as d, max(c) - min(c) as spr
    from unnest(grps, conds) as u(g, c) group by g
  ) q order by q.d desc, q.spr desc limit 1;
  best_d := coalesce(best_d, 0); best_spread := coalesce(best_spread, 0);

  -- 4) 分數
  s_step := case when total_rec = 0 then 0
            else round(10.0 * good_rec / total_rec + 15.0 * least(good_rec / 3.0, 1))::int end;
  s_equip := case when best_d >= 3 then 15 when best_d = 2 then 8 when best_d = 1 then 3 else 0 end
           + case when best_d >= 2 and best_spread >= thr then 10
                  when best_d >= 2 and best_spread >= thr / 2 then 5 else 0 end;
  s_read := case when n_rows = 0 then 0
            else round(25.0 * (sum_read / n_rows) * least(n_rows / 2.0, 1))::int end;

  mean_err := case when n_err > 0 then sum_err / n_err end;
  has_fit := jsonb_typeof(p_snap -> 'fit') = 'object';
  text_len := char_length(regexp_replace(coalesce(p_snap ->> 'analysis', ''), '^[[:space:]　]+|[[:space:]　]+$', '', 'g'));
  a_calc := case when n_rows = 0 then 0 else round(10.0 * n_calc_ok / n_rows)::int end;
  a_acc := case when mean_err <= 0.03 then 2 when mean_err <= 0.06 then 1 else 0 end;
  a_graph := case when n_rows >= 2 and has_fit then 3 else 0 end;
  a_text := case when n_rows = 0 then 0 when text_len >= 30 then 10 when text_len >= 10 then 3 else 0 end;
  s_ana := a_calc + a_acc + a_graph + a_text;

  s_step := least(greatest(s_step, 0), 25); s_equip := least(greatest(s_equip, 0), 25);
  s_read := least(greatest(s_read, 0), 25); s_ana := least(greatest(s_ana, 0), 25);

  -- 5) 逐項回饋
  if n_rows = 0 then
    c1 := format('實驗步驟 %s/25：沒有任何量測紀錄。流程是：%s。', s_step, flow);
    c2 := format('器材使用 %s/25：沒有量測紀錄，無法評估。', s_equip);
    c3 := format('讀值 %s/25：沒有量測紀錄，無法評估。', s_read);
    c4 := format('數據分析 %s/25：沒有量測紀錄，無法評估。', s_ana);
    if text_len = 0 then c4 := c4 || ' 未填寫分析與結論。'; end if;
  else
    c1 := format('實驗步驟 %s/25：共記錄 %s 筆，其中 %s 筆依完整流程（%s）取得。', s_step, total_rec, good_rec, flow)
       || case when good_rec < total_rec then ' 有些紀錄沒有重新完成流程就記下（例如沒有重新插針、重新調焦或重設尺標），每一組數據都應該重新量測。' else '' end
       || case when good_rec < 3 then ' 建議至少完成 3 組獨立量測。' else '' end;
    c2 := format('器材使用 %s/25：同一條件下共取得 %s 種不同的%s，範圍 %s%s。', s_equip, best_d, var_name,
                 round(best_spread, 2), var_unit)
       || case when best_d < 3 or best_spread < thr
            then format(' 建議至少改變 3 種%s，且範圍至少 %s%s，才能檢驗關係是否成立。', var_name, thr, var_unit) else '' end;
    c3 := format('讀值 %s/25：%s 筆讀值準確、%s 筆略有偏差、%s 筆誤差過大。', s_read, n_full, n_half, n_bad)
       || case when n_full < n_rows then ' ' || read_hint else '' end;
    c4 := format('數據分析 %s/25：計算 %s/10（%s/%s 筆相符）；標準值差距 %s/2（平均相對誤差約 %s%%）；趨勢線 %s/3（%s）；文字 %s/10（%s）。',
                 s_ana, a_calc, n_calc_ok, n_rows, a_acc, coalesce(round(mean_err * 100, 1)::text, '—'), a_graph,
                 case when a_graph > 0 then '已畫出趨勢線' else '尚未啟用趨勢線（請在散布圖勾選最小平方法趨勢線）' end,
                 a_text,
                 case when text_len = 0 then '未填寫分析與結論'
                      when a_text = 10 then '已寫分析與結論（內容由老師審閱）'
                      else '分析與結論太短，建議說明選軸理由、斜率的物理意義與誤差來源' end)
       || case when n_calc_ok < n_rows then ' 請檢查公式、單位換算與正負號。' else '' end;
  end if;

  if n_unver > 0 then
    c4 := c4 || E'\n' || format('提醒：有 %s 筆數據因操作紀錄達到上限（300 筆），無法逐筆檢查，以上分數未計入這些數據，請老師複核。', n_unver);
  end if;

  return jsonb_build_object(
    'scores', jsonb_build_array(s_step, s_equip, s_read, s_ana),
    'comment', c1 || E'\n' || c2 || E'\n' || c3 || E'\n' || c4
  );
end $$;

create or replace function app_private.try_grade(p_lab text, p_seed int, p_snap jsonb) returns jsonb
language plpgsql immutable as $$
begin
  return app_private.grade_snapshot(p_lab, p_seed, p_snap);
exception when others then
  raise warning '自動批改失敗：%', sqlerrm;
  return null;
end $$;

-- 交卷：批改、鎖定，必要時直接發布
create or replace function app_private.finish_attempt(p_attempt uuid, p_at timestamptz) returns void
language plpgsql as $$
declare a public.attempts; e public.exams; g jsonb; sc int[];
begin
  select * into a from public.attempts where id = p_attempt for update;
  if not found or a.submitted_at is not null then return; end if;
  select * into e from public.exams where id = a.exam_id;
  g := app_private.try_grade(e.lab, app_private.exam_seed(e.id, a.student_id), a.snapshot);
  sc := app_private.to_int_array(g -> 'scores');
  update public.attempts set
    submitted_at = p_at,
    auto_scores  = sc,
    auto_comment = g ->> 'comment',
    scores       = sc,
    comment      = g ->> 'comment',
    grade_source = case when sc is null then null else 'auto' end,
    published    = (e.auto_publish and sc is not null)
  where id = p_attempt;
end $$;

-- 截止寬限：截止後這段時間內，學生仍可「手動交卷」；寬限結束後才「自動收卷」。
-- 兩個動作以同一個時間點（截止時間 + 寬限）為界，彼此互斥，不會搶同一份作答。
-- 寬限結束後，把沒交卷但有作答內容的草稿自動收卷（交卷時間記為截止時間）
create or replace function app_private.collect_expired(p_exam uuid) returns void
language plpgsql as $$
declare e public.exams; a record;
begin
  select * into e from public.exams where id = p_exam;
  if not found or e.closes_at is null or now() < e.closes_at + app_private.grace() then return; end if;
  for a in select id from public.attempts
           where exam_id = p_exam and submitted_at is null and snapshot is not null loop
    perform app_private.finish_attempt(a.id, e.closes_at);
  end loop;
end $$;

-- 掃描所有已過期的測驗（排程每分鐘執行；也可手動執行 select app_private.collect_all_expired();）
create or replace function app_private.collect_all_expired() returns int
language plpgsql as $$
declare x record; n int := 0;
begin
  for x in select distinct e.id from public.exams e
           join public.attempts a on a.exam_id = e.id
           where e.closes_at is not null and now() >= e.closes_at + app_private.grace()
             and a.submitted_at is null and a.snapshot is not null loop
    perform app_private.collect_expired(x.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- 老師用：重新自動批改某次測驗（不會動到老師手動批改過的）
-- 用法：select app_private.regrade_exam('測驗 id');
create or replace function app_private.regrade_exam(p_exam uuid) returns int
language plpgsql as $$
declare e public.exams; a record; g jsonb; sc int[]; n int := 0;
begin
  select * into e from public.exams where id = p_exam;
  for a in select * from public.attempts
           where exam_id = p_exam and submitted_at is not null
             and coalesce(grade_source, 'auto') = 'auto' loop
    g := app_private.try_grade(e.lab, app_private.exam_seed(e.id, a.student_id), a.snapshot);
    sc := app_private.to_int_array(g -> 'scores');
    update public.attempts set auto_scores = sc, auto_comment = g ->> 'comment',
      scores = sc, comment = g ->> 'comment', grade_source = case when sc is null then null else 'auto' end
    where id = a.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 前端呼叫的函式（全部以 app_ 開頭）
-- ---------------------------------------------------------------------
create or replace function public.app_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then return jsonb_build_object('user', null); end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('user', null); end if;
  return jsonb_build_object('user', jsonb_build_object(
    'id', p.id, 'name', p.name, 'label', app_private.label(p), 'teacher', p.is_teacher));
end $$;

create or replace function public.app_dashboard() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid();
begin
  return jsonb_build_object(
    'owned', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code) order by c.created_at)
                       from public.classes c where c.teacher_id = u), '[]'::jsonb),
    'joined', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by m.joined_at)
                        from public.class_members m join public.classes c on c.id = m.class_id
                        where m.student_id = u), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'className', c.name) order by e.created_at desc)
                       from public.exams e join public.classes c on c.id = e.class_id
                       where c.teacher_id = u
                          or exists (select 1 from public.class_members m where m.class_id = c.id and m.student_id = u)),
                      '[]'::jsonb));
end $$;

create or replace function public.app_join(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); c public.classes;
begin
  select * into c from public.classes where lower(code) = lower(btrim(coalesce(p_code, '')));
  if not found then raise exception '找不到這個班級代碼，請向老師確認'; end if;
  insert into public.class_members (class_id, student_id) values (c.id, u) on conflict do nothing;
  return jsonb_build_object('name', c.name);
end $$;

create or replace function public.app_create_class(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); c public.classes;
begin
  if not app_private.is_teacher(u) then raise exception '只有教師帳號可以建立班級'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception '請輸入班級名稱'; end if;
  insert into public.classes (name, code, teacher_id)
  values (left(btrim(p_name), 150), substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), u)
  returning * into c;
  return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code);
end $$;

create or replace function public.app_create_exam(
  p_class uuid, p_title text, p_lab text, p_prompt text,
  p_opens timestamptz default null, p_closes timestamptz default null, p_auto_publish boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); e public.exams;
begin
  if not exists (select 1 from public.classes where id = p_class and teacher_id = u) then
    raise exception '只能替自己的班級建立測驗';
  end if;
  if p_lab not in ('refraction', 'lens', 'slit') then raise exception '實驗類型不正確'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_prompt, '')) = '' then
    raise exception '請填寫測驗名稱與作答任務';
  end if;
  if p_opens is not null and p_closes is not null and p_opens >= p_closes then
    raise exception '截止時間必須晚於開放時間';
  end if;
  insert into public.exams (class_id, title, lab, prompt, opens_at, closes_at, auto_publish)
  values (p_class, left(btrim(p_title), 150), p_lab, btrim(p_prompt), p_opens, p_closes, coalesce(p_auto_publish, false))
  returning * into e;
  return jsonb_build_object('id', e.id);
end $$;

create or replace function public.app_delete_empty_exam(p_exam uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid();
begin
  -- The exam lock serializes deletion with the foreign-key check on new attempts.
  perform e.id from public.exams e
    join public.classes c on c.id = e.class_id
    join public.profiles p on p.id = c.teacher_id
    where e.id = p_exam and c.teacher_id = u and p.is_teacher
    for update of e;
  if not found then raise exception '找不到可刪除的測驗'; end if;
  if exists (select 1 from public.attempts where exam_id = p_exam) then
    raise exception '已有學生作答紀錄，無法刪除測驗';
  end if;
  delete from public.exams where id = p_exam;
end $$;

create table if not exists app_private.optics_class_seats (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_number text not null,
  seat integer not null check (seat between 1 and 999),
  primary key (class_id, student_number),
  unique (class_id, seat) deferrable initially deferred
);

create or replace function public.app_save_class_seats(p_class uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); affected int;
begin
  if not app_private.is_teacher(u) or not exists (
    select 1 from public.classes where id = p_class and teacher_id = u
  ) then raise exception '找不到可管理的班級'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception '名單格式不正確'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or exists (
    select 1 from jsonb_array_elements(p_rows) row
    where coalesce(row->>'studentNumber', '') !~ '^[0-9]{1,30}$'
       or coalesce(row->>'seat', '') !~ '^[1-9][0-9]{0,2}$'
  ) then raise exception '請檢查學號與座號（1–999）'; end if;
  insert into app_private.optics_class_seats(class_id, student_number, seat)
  select p_class, row->>'studentNumber', (row->>'seat')::int from jsonb_array_elements(p_rows) row
  on conflict (class_id, student_number) do update set seat = excluded.seat;
  get diagnostics affected = row_count;
  return affected;
end $$;

create or replace function public.app_get_exam(p_exam uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); e public.exams; c public.classes; a public.attempts; is_owner boolean;
begin
  select * into e from public.exams where id = p_exam;
  if not found then raise exception '找不到這個測驗'; end if;
  select * into c from public.classes where id = e.class_id;
  is_owner := c.teacher_id = u;
  if not is_owner and not exists (select 1 from public.class_members where class_id = c.id and student_id = u) then
    raise exception '你還沒有加入這個班級，請先用班級連結加入';
  end if;
  perform app_private.collect_expired(p_exam);

  if is_owner then
    return jsonb_build_object(
      'exam', app_private.exam_json(e, u), 'teacher', true, 'attempt', null,
      'canDelete', not exists (select 1 from public.attempts where exam_id = e.id),
      'roster', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', p.name,
                 'label', app_private.label(p),
                 'studentNumber', p.sid,
                 'seat', seats.seat,
                 'scores', at.scores,
                 'attempt', at.id,
                 'submitted', at.submitted_at is not null,
                 'published', coalesce(at.published, false),
                 'total', case when at.scores is null then null else (select sum(x) from unnest(at.scores) as x) end)
               order by seats.seat nulls last, nullif(p.sid, ''), p.name)
        from public.class_members m
        join public.profiles p on p.id = m.student_id
        left join app_private.optics_class_seats seats on seats.class_id = m.class_id and seats.student_number = p.sid
        left join public.attempts at on at.exam_id = e.id and at.student_id = m.student_id
        where m.class_id = c.id), '[]'::jsonb));
  end if;

  select * into a from public.attempts where exam_id = e.id and student_id = u;
  return jsonb_build_object(
    'exam', app_private.exam_json(e, u, e.opens_at is not null and now() < e.opens_at),
    'teacher', false,
    'roster', null,
    'attempt', case when not found then null else jsonb_build_object(
      'id', a.id,
      'submitted', case when a.submitted_at is null then null else app_private.ms(a.submitted_at) end,
      'snapshot', a.snapshot,
      'published', a.published,
      'grade', case when a.published and a.scores is not null
                    then jsonb_build_object('scores', to_jsonb(a.scores), 'comment', a.comment) end) end);
end $$;

create or replace function app_private.check_window(e public.exams, p_grace interval) returns void
language plpgsql stable as $$
begin
  if e.opens_at is not null and now() < e.opens_at then raise exception '測驗尚未開放'; end if;
  if e.closes_at is not null and now() >= e.closes_at + p_grace then raise exception '測驗時間已結束'; end if;
end $$;

create or replace function app_private.save_attempt(p_exam uuid, p_snapshot jsonb, p_grace interval) returns uuid
language plpgsql as $$
declare u uuid := app_private.uid(); e public.exams; aid uuid;
begin
  select * into e from public.exams where id = p_exam;
  if not found then raise exception '找不到這個測驗'; end if;
  if not exists (select 1 from public.class_members m where m.class_id = e.class_id and m.student_id = u) then
    raise exception '你不在這個班級，無法作答';
  end if;
  perform app_private.check_window(e, p_grace);
  if jsonb_typeof(p_snapshot) <> 'object' then raise exception '作答資料格式不正確'; end if;
  if pg_column_size(p_snapshot) > 2000000 then raise exception '作答資料過大'; end if;
  insert into public.attempts (exam_id, student_id, snapshot, updated_at)
  values (p_exam, u, p_snapshot, now())
  on conflict (exam_id, student_id) do update
    set snapshot = excluded.snapshot, updated_at = now()
    where public.attempts.submitted_at is null
  returning id into aid;
  if aid is null then raise exception '已經交卷，無法再修改'; end if;
  return aid;
end $$;

create or replace function public.app_save_draft(p_exam uuid, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.save_attempt(p_exam, p_snapshot, interval '0 seconds');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_submit(p_exam uuid, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  -- 截止後寬限時間內仍接受交卷，避免按下去剛好超時
  aid := app_private.save_attempt(p_exam, p_snapshot, app_private.grace());
  perform app_private.finish_attempt(aid, now());
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.app_get_submission(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); a public.attempts; e public.exams; p public.profiles;
begin
  select * into a from public.attempts where id = p_attempt;
  if not found then raise exception '找不到這份作答'; end if;
  select * into e from public.exams where id = a.exam_id;
  if not exists (select 1 from public.classes c where c.id = e.class_id and c.teacher_id = u) then
    raise exception '只有班級教師可以檢視作答';
  end if;
  select * into p from public.profiles where id = a.student_id;
  return jsonb_build_object(
    'exam', app_private.exam_json(e, a.student_id),
    'student', jsonb_build_object('name', p.name, 'label', app_private.label(p)),
    'attempt', jsonb_build_object(
      'id', a.id,
      'submitted', case when a.submitted_at is null then null else app_private.ms(a.submitted_at) end,
      'snapshot', a.snapshot,
      'published', a.published,
      'grade', case when a.scores is null then null else
                 jsonb_build_object('scores', to_jsonb(a.scores), 'comment', a.comment, 'source', a.grade_source) end));
end $$;

create or replace function public.app_grade(p_attempt uuid, p_scores int[], p_comment text, p_publish boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); a public.attempts; e public.exams; i int;
begin
  select * into a from public.attempts where id = p_attempt;
  if not found then raise exception '找不到這份作答'; end if;
  select * into e from public.exams where id = a.exam_id;
  if not exists (select 1 from public.classes c where c.id = e.class_id and c.teacher_id = u) then
    raise exception '只有班級教師可以批改';
  end if;
  if a.submitted_at is null then raise exception '學生尚未交卷'; end if;
  if p_scores is null or coalesce(array_length(p_scores, 1), 0) <> 4 then raise exception '需要四個評分項的分數'; end if;
  for i in 1 .. 4 loop
    if p_scores[i] is null or p_scores[i] < 0 or p_scores[i] > 25 then
      raise exception '每一項分數必須在 0 到 25 之間';
    end if;
  end loop;
  update public.attempts
     set scores = p_scores, comment = left(coalesce(p_comment, ''), 5000),
         grade_source = 'teacher', published = coalesce(p_publish, false)
   where id = p_attempt;
  return jsonb_build_object('published', coalesce(p_publish, false));
end $$;

create or replace function public.app_publish_all(p_exam uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); n int;
begin
  if not exists (select 1 from public.exams e join public.classes c on c.id = e.class_id
                 where e.id = p_exam and c.teacher_id = u) then
    raise exception '只有班級教師可以發布成績';
  end if;
  perform app_private.collect_expired(p_exam);
  update public.attempts set published = true
   where exam_id = p_exam and submitted_at is not null and scores is not null and not published;
  get diagnostics n = row_count;
  return jsonb_build_object('count', n);
end $$;

-- 排程：每分鐘自動收卷已過期的測驗（不必等有人打開頁面）
-- 需要 pg_cron；Supabase 免費方案可用。若這段顯示 NOTICE，表示尚未啟用，
-- 請到 Database → Extensions 開啟 pg_cron，再重新執行本腳本。
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'collect-expired-exams';
  perform cron.schedule('collect-expired-exams', '* * * * *', 'select app_private.collect_all_expired()');
exception when others then
  raise notice '未能建立自動收卷排程（%）。仍可運作：老師或學生開啟測驗頁時會收卷；也可手動執行 select app_private.collect_all_expired();', sqlerrm;
end $$;

-- 只有登入的使用者能呼叫 app_* 函式
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'app_me', 'app_dashboard', 'app_join', 'app_create_class', 'app_create_exam',
      'app_get_exam', 'app_save_class_seats', 'app_delete_empty_exam', 'app_save_draft', 'app_submit', 'app_get_submission', 'app_grade', 'app_publish_all'
    )
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 老師匯出成績：在 SQL Editor 執行 select * from app_private.exam_results;
-- 結果表格右上角可以 Download CSV
-- ---------------------------------------------------------------------
create or replace view app_private.exam_results as
select c.name  as "班級",
       e.title as "測驗",
       p.sid   as "學號",
       p.name  as "姓名",
       p.email as "Email",
       (at.submitted_at at time zone 'Asia/Taipei') as "交卷時間",
       at.scores[1] as "實驗步驟",
       at.scores[2] as "器材使用",
       at.scores[3] as "讀值",
       at.scores[4] as "數據分析",
       (select sum(x) from unnest(at.scores) as x) as "總分",
       case at.grade_source when 'teacher' then '老師批改' when 'auto' then '自動批改' end as "批改方式",
       at.published as "已發布",
       e.id as "測驗id"
from public.attempts at
join public.exams e on e.id = at.exam_id
join public.classes c on c.id = e.class_id
join public.profiles p on p.id = at.student_id
where at.submitted_at is not null
order by c.name, p.sid, p.name;
