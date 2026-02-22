-- Watchdog para pedidos en cola (queued) en Supabase.
-- Ejecutar en SQL Editor.
-- Este script NO envía pedidos; solo monitorea y registra casos atascados.

-- 1) Índice para acelerar consultas por estado/fecha
create index if not exists idx_sales_orders_status_updated_at
  on public.sales_orders(status, updated_at desc);

-- 2) Tabla de eventos del watchdog
create table if not exists public.order_watchdog_events (
  id bigserial primary key,
  sales_order_id uuid not null,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_watchdog_events_order_created_at
  on public.order_watchdog_events(sales_order_id, created_at desc);

-- 3) Vista de salud de cola (para dashboard rápido)
create or replace view public.vw_sales_orders_queue_health as
select
  count(*) filter (where status = 'queued') as queued_total,
  count(*) filter (where status = 'queued' and updated_at < now() - interval '5 minutes') as queued_5m,
  count(*) filter (where status = 'queued' and updated_at < now() - interval '15 minutes') as queued_15m,
  count(*) filter (where status = 'queued' and updated_at < now() - interval '30 minutes') as queued_30m,
  count(*) filter (where status = 'error') as error_total,
  count(*) filter (where status = 'processing') as processing_total,
  count(*) filter (where status = 'sent') as sent_total
from public.sales_orders;

-- 4) Función que registra pedidos queued atascados (> N minutos)
create or replace function public.log_stale_queued_orders(max_age_minutes int default 15)
returns int
language plpgsql
security definer
as $$
declare
  v_logged int := 0;
begin
  with stale as (
    select so.id
    from public.sales_orders so
    where so.status = 'queued'
      and so.updated_at < now() - make_interval(mins => max_age_minutes)
  ),
  inserted as (
    insert into public.order_watchdog_events (sales_order_id, event_type, message)
    select
      s.id,
      'queued_stale',
      format('Pedido en queued por mas de %s minutos', max_age_minutes)
    from stale s
    where not exists (
      select 1
      from public.order_watchdog_events e
      where e.sales_order_id = s.id
        and e.event_type = 'queued_stale'
        and e.created_at > now() - interval '30 minutes'
    )
    returning 1
  )
  select count(*) into v_logged from inserted;

  return v_logged;
end;
$$;

-- 5) (Opcional) Programar watchdog cada 5 minutos con pg_cron
-- Si ya tienes pg_cron habilitado, descomenta:
--
-- create extension if not exists pg_cron;
-- select cron.unschedule('orders-watchdog-queued-stale');
-- select cron.schedule(
--   'orders-watchdog-queued-stale',
--   '*/5 * * * *',
--   $$select public.log_stale_queued_orders(15);$$
-- );

-- 6) Consulta rápida para inspección manual:
-- select * from public.vw_sales_orders_queue_health;
-- select * from public.order_watchdog_events order by created_at desc limit 50;
-- select id, status, sap_docnum, last_error, updated_at
-- from public.sales_orders
-- where status = 'queued'
-- order by updated_at asc
-- limit 100;
