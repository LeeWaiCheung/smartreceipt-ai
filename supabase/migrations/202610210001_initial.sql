-- Run once in the Supabase SQL editor. No API credentials belong in this file.
create table public.categories (
  id text primary key,
  name text not null,
  color text not null,
  icon text not null
);
insert into public.categories values
('food','餐飲','#168b70','Utensils'), ('transport','交通','#74c5af','TrainFront'),
('office','辦公','#8498d3','BriefcaseBusiness'), ('software','軟件訂閱','#b49bdb','Layers'),
('utilities','繳費','#e3b66d','Zap'), ('travel','差旅','#6daec8','Plane'),
('other','其他','#a0a9b6','MoreHorizontal');

create table public.app_config (
  id boolean primary key default true check (id),
  daily_ai_limit integer not null default 20 check (daily_ai_limit between 1 and 100)
);
insert into public.app_config (id) values (true);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_name text not null check (length(original_name) between 1 and 200),
  storage_path text not null,
  page_paths text[] not null check (cardinality(page_paths) between 1 and 10),
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  file_size integer not null check (file_size between 1 and 10485760),
  status text not null default 'uploaded' check (status in ('uploaded','processing','needs_review','confirmed','failed')),
  extraction jsonb,
  model text,
  error_message text,
  active_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, file_hash),
  unique (id, user_id)
);
create index receipts_owner_created on public.receipts(user_id, created_at desc);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null unique,
  merchant text not null check (length(trim(merchant)) between 1 and 160),
  transaction_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency in ('HKD','USD','CNY')),
  tax numeric(18,2) check (tax >= 0 and tax <= amount),
  category_id text not null references public.categories(id),
  exchange_rate numeric(20,10) not null check (exchange_rate > 0),
  exchange_rate_date date not null,
  exchange_rate_source text not null,
  amount_hkd numeric(20,2) not null check (amount_hkd > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (receipt_id, user_id) references public.receipts(id,user_id) on delete cascade,
  check (amount_hkd = round(amount * exchange_rate, 2)),
  check (exchange_rate_date <= transaction_date)
);
create index transactions_owner_date on public.transactions(user_id, transaction_date desc);
create index transactions_owner_category on public.transactions(user_id, category_id);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_hkd numeric(18,2) not null check (amount_hkd > 0),
  unique(user_id, month)
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  status text not null default 'processing' check (status in ('processing','succeeded','failed')),
  model text,
  elapsed_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (receipt_id,user_id) references public.receipts(id,user_id) on delete cascade
);
create index ai_runs_owner_time on public.ai_runs(user_id,created_at desc);

alter table public.categories enable row level security;
alter table public.app_config enable row level security;
alter table public.receipts enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.ai_runs enable row level security;

revoke all on public.categories,public.app_config,public.receipts,public.transactions,public.budgets,public.ai_runs from anon,authenticated;
grant select on public.categories,public.receipts,public.transactions,public.budgets,public.ai_runs to authenticated;
grant all on public.categories,public.app_config,public.receipts,public.transactions,public.budgets,public.ai_runs to service_role;
create policy categories_read on public.categories for select to authenticated using (true);
create policy receipts_owner_read on public.receipts for select to authenticated using ((select auth.uid()) = user_id);
create policy transactions_owner_read on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy budgets_owner_read on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_runs_owner_read on public.ai_runs for select to authenticated using ((select auth.uid()) = user_id);

-- This function executes with the verified caller's identity. A per-user
-- transaction lock makes quota reservation safe against parallel requests.
create function public.reserve_ai_run(p_receipt_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_limit integer;
  v_run uuid;
  v_day timestamptz := date_trunc('day',now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  select * into v_receipt from public.receipts where id=p_receipt_id and user_id=v_user for update;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  if v_receipt.status in ('confirmed','needs_review') then raise exception 'ALREADY_EXTRACTED'; end if;
  if v_receipt.status='processing' and v_receipt.updated_at > now() - interval '3 minutes' then
    raise exception 'ALREADY_PROCESSING';
  end if;
  select daily_ai_limit into v_limit from public.app_config where id=true;
  if (select count(*) from public.ai_runs where user_id=v_user and created_at>=v_day) >= coalesce(v_limit,20) then
    raise exception 'DAILY_LIMIT';
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

create function public.complete_ai_run(
  p_user_id uuid,p_receipt_id uuid,p_run_id uuid,p_extraction jsonb,
  p_model text,p_elapsed_ms integer,p_input_tokens integer,p_output_tokens integer,p_error text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.receipts where id=p_receipt_id and user_id=p_user_id and active_run_id=p_run_id for update;
  if not found then return false; end if;
  update public.ai_runs set status=case when p_error is null then 'succeeded' else 'failed' end,
    model=p_model,elapsed_ms=p_elapsed_ms,input_tokens=p_input_tokens,output_tokens=p_output_tokens,
    error_code=p_error,completed_at=now() where id=p_run_id and user_id=p_user_id;
  update public.receipts set status=case when p_error is null then 'needs_review' else 'failed' end,
    extraction=p_extraction,model=p_model,error_message=p_error,active_run_id=null,updated_at=now()
    where id=p_receipt_id and user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.complete_ai_run(uuid,uuid,uuid,jsonb,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.complete_ai_run(uuid,uuid,uuid,jsonb,text,integer,integer,integer,text) to service_role;

create function public.confirm_transaction(p_user_id uuid,p_receipt_id uuid,p_data jsonb)
returns public.transactions
language plpgsql security definer set search_path = ''
as $$
declare v_result public.transactions;
begin
  perform 1 from public.receipts where id=p_receipt_id and user_id=p_user_id and status in ('needs_review','confirmed') for update;
  if not found then raise exception 'RECEIPT_NOT_READY'; end if;
  insert into public.transactions(user_id,receipt_id,merchant,transaction_date,amount,currency,tax,category_id,
    exchange_rate,exchange_rate_date,exchange_rate_source,amount_hkd)
  values(p_user_id,p_receipt_id,p_data->>'merchant',(p_data->>'transaction_date')::date,
    (p_data->>'amount')::numeric,p_data->>'currency',(p_data->>'tax')::numeric,p_data->>'category_id',
    (p_data->>'exchange_rate')::numeric,(p_data->>'exchange_rate_date')::date,
    p_data->>'exchange_rate_source',(p_data->>'amount_hkd')::numeric)
  on conflict(receipt_id) do update set merchant=excluded.merchant,transaction_date=excluded.transaction_date,
    amount=excluded.amount,currency=excluded.currency,tax=excluded.tax,category_id=excluded.category_id,
    exchange_rate=excluded.exchange_rate,exchange_rate_date=excluded.exchange_rate_date,
    exchange_rate_source=excluded.exchange_rate_source,amount_hkd=excluded.amount_hkd,updated_at=now()
  returning * into v_result;
  update public.receipts set status='confirmed',updated_at=now() where id=p_receipt_id and user_id=p_user_id;
  return v_result;
end;
$$;
revoke all on function public.confirm_transaction(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_transaction(uuid,uuid,jsonb) to service_role;

create function public.remove_transaction(p_user_id uuid,p_transaction_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_receipt uuid;
begin
  delete from public.transactions where id=p_transaction_id and user_id=p_user_id returning receipt_id into v_receipt;
  if v_receipt is null then return false; end if;
  update public.receipts set status='needs_review',updated_at=now() where id=v_receipt and user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.remove_transaction(uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_transaction(uuid,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('receipts','receipts',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=array['image/jpeg','image/png','application/pdf'];
create policy receipt_files_owner_read on storage.objects for select to authenticated
  using(bucket_id='receipts' and split_part(name,'/',1)=(select auth.uid())::text);
-- Upload URLs are issued by the authenticated server for exact object paths.
-- There is deliberately no general client INSERT/UPDATE permission.

-- Decimal aggregates execute as the caller, preserving transactions RLS.
-- Amounts are JSON strings to avoid a JavaScript binary-float boundary.
create function public.dashboard_summary(p_month date)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with bounds as (
    select date_trunc('month',p_month)::date as first_day
  ), scoped as (
    select t.* from public.transactions t,bounds b
    where t.user_id=auth.uid()
      and t.transaction_date>=b.first_day-interval '5 months'
      and t.transaction_date<b.first_day+interval '1 month'
  )
  select jsonb_build_object(
    'month',to_char(b.first_day,'YYYY-MM'),
    'total',(select coalesce(sum(t.amount_hkd),0)::text from scoped t where t.transaction_date>=b.first_day),
    'previous_total',(select coalesce(sum(t.amount_hkd),0)::text from scoped t where t.transaction_date>=b.first_day-interval '1 month' and t.transaction_date<b.first_day),
    'categories',(select jsonb_agg(jsonb_build_object('id',c.id,'amount_hkd',c.amount::text) order by c.id) from (
      select cat.id,coalesce(sum(t.amount_hkd),0) as amount
      from public.categories cat left join scoped t on t.category_id=cat.id and t.transaction_date>=b.first_day
      group by cat.id
    ) c),
    'trends',(select jsonb_agg(jsonb_build_object('month',to_char(m.month,'YYYY-MM'),'amount_hkd',m.amount::text) order by m.month) from (
      select g.month,coalesce(sum(t.amount_hkd),0) as amount
      from generate_series(b.first_day-interval '5 months',b.first_day,interval '1 month') g(month)
      left join scoped t on t.transaction_date>=g.month and t.transaction_date<g.month+interval '1 month'
      group by g.month
    ) m)
  ) from bounds b;
$$;
revoke all on function public.dashboard_summary(date) from public,anon;
grant execute on function public.dashboard_summary(date) to authenticated;
