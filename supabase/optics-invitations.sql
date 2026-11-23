-- Apply after optics/supabase-setup.sql in the assessment project.
create table if not exists app_private.optics_roster (
  class_id uuid not null references public.classes(id) on delete cascade,
  email text not null,
  student_number text not null,
  student_name text not null,
  primary key (class_id, email),
  unique (class_id, student_number)
);
alter table app_private.optics_roster enable row level security;
revoke all on app_private.optics_roster from public, anon, authenticated;

create or replace function public.app_prepare_invite(
  p_class_code text, p_email text, p_student_number text, p_student_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := app_private.uid();
  addr text := lower(btrim(coalesce(p_email, '')));
  sid text := btrim(coalesce(p_student_number, ''));
  full_name text := btrim(coalesce(p_student_name, ''));
  class_id_value uuid;
begin
  select id into class_id_value from public.classes
  where lower(code) = lower(btrim(coalesce(p_class_code, ''))) and teacher_id = u;
  if not found or not app_private.is_teacher(u) then raise exception '只有班級教師可以匯入名單'; end if;
  if char_length(addr) > 254 or addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(sid) not between 1 and 30 or char_length(full_name) not between 1 and 50
  then raise exception '請檢查學號、姓名與學校信箱'; end if;
  if exists (select 1 from public.profiles where lower(email) = addr and is_teacher) then
    raise exception '教師帳號不能當作學生邀請';
  end if;
  insert into app_private.optics_roster(class_id, email, student_number, student_name)
  values(class_id_value, addr, sid, full_name)
  on conflict (class_id,email) do update
    set student_number=excluded.student_number, student_name=excluded.student_name;
  return jsonb_build_object('existing', exists (
    select 1 from auth.users where lower(email) = addr and email_confirmed_at is not null
  ));
end $$;

create or replace function public.app_claim_invites() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := app_private.uid();
  addr text;
  entry app_private.optics_roster;
  n int;
begin
  select lower(email) into addr from auth.users where id = u and email_confirmed_at is not null;
  if addr is null or app_private.is_teacher(u) then return jsonb_build_object('joined', 0); end if;
  select * into entry from app_private.optics_roster where email = addr order by class_id limit 1;
  if not found then return jsonb_build_object('joined', 0); end if;
  insert into public.profiles(id,email,name,sid) values(u,addr,entry.student_name,entry.student_number)
  on conflict (id) do update set email=excluded.email, name=excluded.name, sid=excluded.sid;
  insert into public.class_members(class_id, student_id)
  select class_id, u from app_private.optics_roster where email = addr on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('joined', n);
end $$;

create or replace function public.app_join(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.uid(); c public.classes;
begin
  select * into c from public.classes where lower(code) = lower(btrim(coalesce(p_code, '')));
  if not found then raise exception '找不到這個班級代碼，請向老師確認'; end if;
  perform public.app_claim_invites();
  if not exists (select 1 from public.class_members where class_id = c.id and student_id = u) then
    raise exception '找不到這個帳號的班級邀請，請使用名單上的學校信箱啟用帳號';
  end if;
  return jsonb_build_object('name', c.name);
end $$;

revoke all on function public.app_prepare_invite(text,text,text,text), public.app_claim_invites(), public.app_join(text) from public, anon;
grant execute on function public.app_prepare_invite(text,text,text,text), public.app_claim_invites(), public.app_join(text) to authenticated;
