-- Push notifications for customer unlock events only.
-- Run in Supabase SQL Editor.

create table if not exists public.customer_unlock_push_events (
  id bigserial primary key,
  card_code text not null,
  customer_name text null,
  vendedor text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  lock_owner text null,
  locked_at timestamptz null,
  last_attempt_at timestamptz null,
  last_attempt_error text null
);

create index if not exists idx_customer_unlock_push_events_card_code_created_at
  on public.customer_unlock_push_events (card_code, created_at desc);

create index if not exists idx_customer_unlock_push_events_dispatch
  on public.customer_unlock_push_events (sent_at, next_attempt_at, created_at);

create or replace function public.enqueue_customer_unlocked_push_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_blocked text;
  v_new_blocked text;
  v_card_code text;
  v_customer_name text;
  v_vendedor text;
begin
  v_old_blocked := upper(trim(coalesce(to_jsonb(old)->>'Bloqueado', to_jsonb(old)->>'bloqueado', '')));
  v_new_blocked := upper(trim(coalesce(to_jsonb(new)->>'Bloqueado', to_jsonb(new)->>'bloqueado', '')));

  if v_old_blocked <> 'Y' or v_new_blocked <> 'N' then
    return new;
  end if;

  v_card_code := trim(coalesce(to_jsonb(new)->>'CardCode', to_jsonb(new)->>'card_code', ''));
  if v_card_code = '' then
    return new;
  end if;

  v_customer_name := trim(
    coalesce(
      to_jsonb(new)->>'CardFName',
      to_jsonb(new)->>'CardName',
      to_jsonb(new)->>'card_f_name',
      to_jsonb(new)->>'card_name',
      v_card_code
    )
  );
  v_vendedor := trim(coalesce(to_jsonb(new)->>'Vendedor', to_jsonb(new)->>'vendedor', ''));

  insert into public.customer_unlock_push_events (
    card_code,
    customer_name,
    vendedor,
    payload
  )
  select
    v_card_code,
    nullif(v_customer_name, ''),
    nullif(v_vendedor, ''),
    jsonb_build_object(
      'card_code', v_card_code,
      'customer_name', nullif(v_customer_name, ''),
      'vendedor', nullif(v_vendedor, '')
    )
  where not exists (
    select 1
    from public.customer_unlock_push_events e
    where e.card_code = v_card_code
      and e.created_at > now() - interval '60 seconds'
  );

  return new;
end;
$$;

drop trigger if exists trg_enqueue_customer_unlocked_push_event on public.customers;
create trigger trg_enqueue_customer_unlocked_push_event
after update of "Bloqueado"
on public.customers
for each row
execute function public.enqueue_customer_unlocked_push_event();

create or replace function public.claim_customer_unlock_push_events(
  p_max_rows int default 50,
  p_lock_owner text default null
)
returns table (
  id bigint,
  card_code text,
  customer_name text,
  vendedor text,
  payload jsonb,
  attempt_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text := coalesce(nullif(trim(p_lock_owner), ''), gen_random_uuid()::text);
begin
  return query
  with picked as (
    select e.id as event_id
    from public.customer_unlock_push_events e
    where e.sent_at is null
      and e.next_attempt_at <= now()
      and (
        e.locked_at is null
        or e.locked_at < now() - interval '5 minutes'
      )
    order by e.created_at asc
    limit greatest(p_max_rows, 1)
    for update skip locked
  ),
  claimed as (
    update public.customer_unlock_push_events e
    set lock_owner = v_owner,
        locked_at = now(),
        last_attempt_at = now(),
        attempt_count = e.attempt_count + 1
    where e.id in (select p.event_id from picked p)
    returning e.*
  )
  select
    c.id,
    c.card_code,
    c.customer_name,
    c.vendedor,
    c.payload,
    c.attempt_count
  from claimed c
  order by c.created_at asc;
end;
$$;

create or replace function public.mark_customer_unlock_push_event_sent(
  p_event_id bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.customer_unlock_push_events
  set sent_at = now(),
      lock_owner = null,
      locked_at = null,
      last_attempt_error = null
  where id = p_event_id;
$$;

create or replace function public.mark_customer_unlock_push_event_failed(
  p_event_id bigint,
  p_error text,
  p_retry_in_seconds int default 300
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.customer_unlock_push_events
  set next_attempt_at = now() + make_interval(secs => greatest(p_retry_in_seconds, 30)),
      lock_owner = null,
      locked_at = null,
      last_attempt_error = left(coalesce(p_error, 'unknown error'), 1000)
  where id = p_event_id;
$$;

-- Optional checks:
-- select * from public.customer_unlock_push_events order by created_at desc limit 50;
-- select * from public.claim_customer_unlock_push_events(10, 'manual-test');
