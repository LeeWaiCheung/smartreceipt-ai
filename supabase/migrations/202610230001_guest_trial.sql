-- Additive migration: apply after 202610210001_initial.sql.
-- Temporary identities use immutable auth app_metadata; ordinary owner RLS still applies.
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours'
);
create index guest_sessions_expiry on public.guest_sessions(expires_at);
create table public.guest_daily_usage (
  day date primary key,admissions integer not null default 0,ai_attempts integer not null default 0
);
create table public.guest_network_usage (
  day date not null,ip_hash text not null,admissions integer not null default 0,primary key(day,ip_hash)
);
alter table public.guest_sessions enable row level security;
alter table public.guest_daily_usage enable row level security;
alter table public.guest_network_usage enable row level security;
revoke all on public.guest_sessions,public.guest_daily_usage,public.guest_network_usage from anon,authenticated;
grant select on public.guest_sessions to authenticated;
grant all on public.guest_sessions,public.guest_daily_usage,public.guest_network_usage to service_role;
create policy guest_session_owner_read on public.guest_sessions for select to authenticated using(user_id=(select auth.uid()));

create function public.workspace_access_active() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid() and (
    coalesce(u.raw_app_meta_data->>'smartreceipt_guest','false')<>'true' or exists(
      select 1 from public.guest_sessions s where s.user_id=u.id and s.expires_at>now()
      and s.id::text=u.raw_app_meta_data->>'smartreceipt_guest_session'
    )
  ));
$$;
revoke all on function public.workspace_access_active() from public,anon;
grant execute on function public.workspace_access_active() to authenticated,service_role;
alter policy receipts_owner_read on public.receipts using(user_id=(select auth.uid()) and (select public.workspace_access_active()));
alter policy transactions_owner_read on public.transactions using(user_id=(select auth.uid()) and (select public.workspace_access_active()));
alter policy budgets_owner_read on public.budgets using(user_id=(select auth.uid()) and (select public.workspace_access_active()));
alter policy ai_runs_owner_read on public.ai_runs using(user_id=(select auth.uid()) and (select public.workspace_access_active()));
alter policy receipt_files_owner_read on storage.objects using(bucket_id='receipts' and split_part(name,'/',1)=(select auth.uid())::text and (select public.workspace_access_active()));

-- Counters have no auth-user FK: deleting/recreating a trial cannot reset the global budget.
create function public.reserve_guest_session(p_ip_hash text) returns public.guest_sessions
language plpgsql security definer set search_path='' as $$
declare v_day date:=(now() at time zone 'Asia/Hong_Kong')::date;v_result public.guest_sessions;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_NETWORK_HASH'; end if;
  insert into public.guest_daily_usage(day) values(v_day) on conflict do nothing;
  update public.guest_daily_usage set admissions=admissions+1 where day=v_day and admissions<5;
  if not found then raise exception 'TRIAL_ADMISSION_LIMIT'; end if;
  insert into public.guest_network_usage(day,ip_hash) values(v_day,p_ip_hash) on conflict do nothing;
  update public.guest_network_usage set admissions=admissions+1 where day=v_day and ip_hash=p_ip_hash and admissions<2;
  if not found then raise exception 'TRIAL_NETWORK_LIMIT'; end if;
  insert into public.guest_sessions(ip_hash) values(p_ip_hash) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.reserve_guest_session(text) from public,anon,authenticated;
grant execute on function public.reserve_guest_session(text) to service_role;

-- Exact paths are allocated under a lock before any signed upload capability is issued.
create function public.register_guest_receipt(p_user_id uuid,p_id uuid,p_name text,p_hash text,p_type text,p_size integer,p_pages integer)
returns public.receipts language plpgsql security definer set search_path='' as $$
declare v_result public.receipts;v_prefix text;v_ext text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  perform 1 from auth.users u join public.guest_sessions s on s.user_id=u.id
    where u.id=p_user_id and u.raw_app_meta_data->>'smartreceipt_guest'='true'
    and u.raw_app_meta_data->>'smartreceipt_guest_session'=s.id::text and s.expires_at>now();
  if not found then raise exception 'TRIAL_EXPIRED'; end if;
  select * into v_result from public.receipts where user_id=p_user_id and file_hash=p_hash;
  if found then return v_result; end if;
  if (select count(*) from public.receipts where user_id=p_user_id)>=3 then raise exception 'TRIAL_FILES_LIMIT'; end if;
  if p_pages not between 1 and 2 or p_size not between 1 and 5242880 then raise exception 'TRIAL_FILE_SIZE'; end if;
  if p_type not in ('image/jpeg','image/png','application/pdf') then raise exception 'TRIAL_FILE_SIZE'; end if;
  v_prefix:=p_user_id::text||'/'||p_id::text;
  v_ext:=case p_type when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end;
  insert into public.receipts(id,user_id,original_name,storage_path,page_paths,file_hash,mime_type,file_size)
    values(p_id,p_user_id,p_name,v_prefix||'/original.'||v_ext,
      array(select v_prefix||'/page-'||lpad(i::text,2,'0')||'.jpg' from generate_series(1,p_pages) i),p_hash,p_type,p_size)
    returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.register_guest_receipt(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.register_guest_receipt(uuid,uuid,text,text,text,integer,integer) to service_role;

create or replace function public.reserve_ai_run(p_receipt_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_limit integer;
  v_run uuid;
  v_guest boolean;
  v_count integer;
  v_day timestamptz := date_trunc('day',now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.workspace_access_active() then raise exception 'TRIAL_EXPIRED'; end if;
  select coalesce(raw_app_meta_data->>'smartreceipt_guest'='true',false) into v_guest from auth.users where id=v_user;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  select * into v_receipt from public.receipts where id=p_receipt_id and user_id=v_user for update;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  if v_receipt.status in ('confirmed','needs_review') then raise exception 'ALREADY_EXTRACTED'; end if;
  if v_receipt.status='processing' and v_receipt.updated_at > now() - interval '3 minutes' then
    raise exception 'ALREADY_PROCESSING';
  end if;
  if v_guest then
    if (select count(*) from public.ai_runs where user_id=v_user)>=3 then raise exception 'TRIAL_LIMIT'; end if;
    insert into public.guest_daily_usage(day) values((now() at time zone 'Asia/Hong_Kong')::date) on conflict do nothing;
    update public.guest_daily_usage set ai_attempts=ai_attempts+1
      where day=(now() at time zone 'Asia/Hong_Kong')::date and ai_attempts<20 returning ai_attempts into v_count;
    if not found then raise exception 'TRIAL_GLOBAL_LIMIT'; end if;
  else
    select daily_ai_limit into v_limit from public.app_config where id=true;
    if (select count(*) from public.ai_runs where user_id=v_user and created_at>=v_day)>=coalesce(v_limit,20) then raise exception 'DAILY_LIMIT'; end if;
  end if;
  if (select count(*) from public.ai_runs where receipt_id=p_receipt_id) >= 3 then raise exception 'RETRY_LIMIT'; end if;
  update public.ai_runs set status='failed',error_code='LEASE_EXPIRED',completed_at=now()
    where id=v_receipt.active_run_id and status='processing';
  insert into public.ai_runs(user_id,receipt_id) values(v_user,p_receipt_id) returning id into v_run;
  update public.receipts set status='processing',active_run_id=v_run,error_message=null,updated_at=now()
    where id=p_receipt_id;
  return v_run;
end;
$$;
revoke all on function public.reserve_ai_run(uuid) from public,anon;
grant execute on function public.reserve_ai_run(uuid) to authenticated;


-- Isolated trial storage enforces the 5 MB cap even for direct signed uploads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trial-receipts','trial-receipts',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy trial_files_owner_read on storage.objects for select to authenticated
using(bucket_id='trial-receipts' and split_part(name,'/',1)=(select auth.uid())::text and (select public.workspace_access_active()));
