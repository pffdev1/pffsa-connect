-- Evita pedidos duplicados por reintentos de red (idempotencia).
-- Ejecutar en Supabase SQL Editor.

alter table public.sales_orders
  add column if not exists client_order_id text;

create unique index if not exists uq_sales_orders_created_by_client_order_id
  on public.sales_orders(created_by, client_order_id)
  where client_order_id is not null;

-- Ajusta tu RPC create_sales_order para recibir:
-- p_client_order_id text default null
-- y usarlo en el insert de cabecera:
--
-- insert into public.sales_orders (
--   client_order_id, card_code, doc_due_date, zona, id_ruta, created_by, status, comments
-- )
-- values (
--   nullif(trim(p_client_order_id), ''),
--   trim(p_card_code),
--   p_doc_due_date,
--   trim(p_zona),
--   trim(p_id_ruta),
--   v_user_id,
--   'draft',
--   nullif(trim(p_comments), '')
-- )
-- on conflict (created_by, client_order_id)
-- do update set updated_at = now()
-- returning id into v_order_id;
