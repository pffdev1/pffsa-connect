-- Hardening and verification for high concurrency in customers/catalog search.
-- Run in Supabase SQL Editor.

-- 1) Enable trigram extension for fast ILIKE '%term%' searches.
create extension if not exists pg_trgm;

-- 2) Customers table indexes (created only if table/columns exist).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'CardCode'
  ) then
    execute 'create index if not exists idx_customers_cardcode on public.customers ("CardCode")';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'CardName'
  ) then
    execute 'create index if not exists idx_customers_cardname_trgm on public.customers using gin ("CardName" gin_trgm_ops)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'CardFName'
  ) then
    execute 'create index if not exists idx_customers_cardfname_trgm on public.customers using gin ("CardFName" gin_trgm_ops)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'RUC'
  ) then
    execute 'create index if not exists idx_customers_ruc_trgm on public.customers using gin ("RUC" gin_trgm_ops)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'Nivel'
  ) then
    execute 'create index if not exists idx_customers_nivel on public.customers ("Nivel")';
  end if;
end $$;

-- 3) Products table indexes (for catalog search by code/name/brand).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'ItemCode'
  ) then
    execute 'create index if not exists idx_products_itemcode on public.products ("ItemCode")';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'ItemName'
  ) then
    execute 'create index if not exists idx_products_itemname_trgm on public.products using gin ("ItemName" gin_trgm_ops)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'Marca'
  ) then
    execute 'create index if not exists idx_products_marca_trgm on public.products using gin ("Marca" gin_trgm_ops)';
  end if;
end $$;

-- 4) View definition sanity check (for vw_catalogo_cliente).
select schemaname, viewname
from pg_views
where schemaname = 'public' and viewname = 'vw_catalogo_cliente';

-- 5) Index inventory check for customers/products.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('customers', 'products')
order by tablename, indexname;

-- 6) Optional: runtime stats (if pg_stat_statements is enabled).
-- select query, calls, total_exec_time, mean_exec_time, rows
-- from pg_stat_statements
-- where query ilike '%from "customers"%'
--    or query ilike '%from "vw_catalogo_cliente"%'
-- order by total_exec_time desc
-- limit 20;

