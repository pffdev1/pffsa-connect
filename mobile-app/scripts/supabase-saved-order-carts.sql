-- Saved carts for Pedido screen (max 3 per user, ttl 48h).
-- Run in Supabase SQL Editor.

create table if not exists public.saved_order_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_code text null,
  customer_name text null,
  cart_payload jsonb not null default '[]'::jsonb,
  item_count int not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  updated_at timestamptz not null default now(),
  constraint saved_order_carts_item_count_non_negative check (item_count >= 0),
  constraint saved_order_carts_payload_array check (jsonb_typeof(cart_payload) = 'array')
);

create index if not exists idx_saved_order_carts_user_created
  on public.saved_order_carts (user_id, created_at desc);

create index if not exists idx_saved_order_carts_user_expires
  on public.saved_order_carts (user_id, expires_at desc);

create or replace function public.enforce_saved_order_carts_limit()
returns trigger
language plpgsql
as $$
declare
  v_active_count int;
begin
  select count(*)
  into v_active_count
  from public.saved_order_carts
  where user_id = new.user_id
    and expires_at > now();

  if v_active_count >= 3 then
    raise exception 'MAX_SAVED_CARTS_REACHED';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_saved_order_carts_limit on public.saved_order_carts;
create trigger trg_saved_order_carts_limit
before insert on public.saved_order_carts
for each row execute function public.enforce_saved_order_carts_limit();

create or replace function public.touch_saved_order_carts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_saved_order_carts_updated_at on public.saved_order_carts;
create trigger trg_saved_order_carts_updated_at
before update on public.saved_order_carts
for each row execute function public.touch_saved_order_carts_updated_at();

alter table public.saved_order_carts enable row level security;

drop policy if exists saved_order_carts_select_own on public.saved_order_carts;
create policy saved_order_carts_select_own
on public.saved_order_carts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists saved_order_carts_insert_own on public.saved_order_carts;
create policy saved_order_carts_insert_own
on public.saved_order_carts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists saved_order_carts_update_own on public.saved_order_carts;
create policy saved_order_carts_update_own
on public.saved_order_carts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists saved_order_carts_delete_own on public.saved_order_carts;
create policy saved_order_carts_delete_own
on public.saved_order_carts
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.saved_order_carts to authenticated;

-- Optional maintenance function (call from scheduler if needed).
create or replace function public.cleanup_expired_saved_order_carts()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.saved_order_carts
    where expires_at <= now()
    returning 1
  )
  select count(*)::int from deleted;
$$;
