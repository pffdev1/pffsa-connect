-- Admin KPI aggregation hardening.
-- Run in Supabase SQL Editor (production first in staging if available).

create or replace function public.get_admin_dashboard_kpis()
returns table (
  orders_today bigint,
  orders_yesterday bigint,
  sales_today numeric,
  sales_yesterday numeric,
  sales_global_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_order_id boolean := false;
  has_sales_order_id boolean := false;
  sql_text text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_order_lines'
      and column_name = 'order_id'
  )
  into has_order_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_order_lines'
      and column_name = 'sales_order_id'
  )
  into has_sales_order_id;

  if has_order_id then
    sql_text := $q$
      with boundaries as (
        select
          date_trunc('day', now()) as today_start,
          date_trunc('day', now()) + interval '1 day' as tomorrow_start,
          date_trunc('day', now()) - interval '1 day' as yesterday_start
      ),
      orders_today as (
        select count(*)::bigint as value
        from public.sales_orders o, boundaries b
        where o.created_at >= b.today_start
          and o.created_at < b.tomorrow_start
      ),
      orders_yesterday as (
        select count(*)::bigint as value
        from public.sales_orders o, boundaries b
        where o.created_at >= b.yesterday_start
          and o.created_at < b.today_start
      ),
      sales_today as (
        select
          coalesce(
            sum(
              coalesce(
                nullif(to_jsonb(l)->>'line_total', '')::numeric,
                nullif(to_jsonb(l)->>'LineTotal', '')::numeric,
                nullif(to_jsonb(l)->>'total', '')::numeric,
                nullif(to_jsonb(l)->>'Total', '')::numeric,
                (
                  coalesce(
                    nullif(to_jsonb(l)->>'quantity', '')::numeric,
                    nullif(to_jsonb(l)->>'Quantity', '')::numeric,
                    0
                  ) * coalesce(
                    nullif(to_jsonb(l)->>'unit_price', '')::numeric,
                    nullif(to_jsonb(l)->>'UnitPrice', '')::numeric,
                    nullif(to_jsonb(l)->>'price', '')::numeric,
                    nullif(to_jsonb(l)->>'Price', '')::numeric,
                    0
                  )
                )
              )
            ),
            0
          )::numeric as value
        from public.sales_order_lines l
        join public.sales_orders o on l.order_id = o.id
        join boundaries b on true
        where o.created_at >= b.today_start
          and o.created_at < b.tomorrow_start
      ),
      sales_yesterday as (
        select
          coalesce(
            sum(
              coalesce(
                nullif(to_jsonb(l)->>'line_total', '')::numeric,
                nullif(to_jsonb(l)->>'LineTotal', '')::numeric,
                nullif(to_jsonb(l)->>'total', '')::numeric,
                nullif(to_jsonb(l)->>'Total', '')::numeric,
                (
                  coalesce(
                    nullif(to_jsonb(l)->>'quantity', '')::numeric,
                    nullif(to_jsonb(l)->>'Quantity', '')::numeric,
                    0
                  ) * coalesce(
                    nullif(to_jsonb(l)->>'unit_price', '')::numeric,
                    nullif(to_jsonb(l)->>'UnitPrice', '')::numeric,
                    nullif(to_jsonb(l)->>'price', '')::numeric,
                    nullif(to_jsonb(l)->>'Price', '')::numeric,
                    0
                  )
                )
              )
            ),
            0
          )::numeric as value
        from public.sales_order_lines l
        join public.sales_orders o on l.order_id = o.id
        join boundaries b on true
        where o.created_at >= b.yesterday_start
          and o.created_at < b.today_start
      ),
      sales_global as (
        select
          coalesce(
            sum(
              coalesce(
                nullif(to_jsonb(l)->>'line_total', '')::numeric,
                nullif(to_jsonb(l)->>'LineTotal', '')::numeric,
                nullif(to_jsonb(l)->>'total', '')::numeric,
                nullif(to_jsonb(l)->>'Total', '')::numeric,
                (
                  coalesce(
                    nullif(to_jsonb(l)->>'quantity', '')::numeric,
                    nullif(to_jsonb(l)->>'Quantity', '')::numeric,
                    0
                  ) * coalesce(
                    nullif(to_jsonb(l)->>'unit_price', '')::numeric,
                    nullif(to_jsonb(l)->>'UnitPrice', '')::numeric,
                    nullif(to_jsonb(l)->>'price', '')::numeric,
                    nullif(to_jsonb(l)->>'Price', '')::numeric,
                    0
                  )
                )
              )
            ),
            0
          )::numeric as value
        from public.sales_order_lines l
      )
      select
        (select value from orders_today) as orders_today,
        (select value from orders_yesterday) as orders_yesterday,
        (select value from sales_today) as sales_today,
        (select value from sales_yesterday) as sales_yesterday,
        (select value from sales_global) as sales_global_total
    $q$;
  elsif has_sales_order_id then
    sql_text := $q$
      with boundaries as (
        select
          date_trunc('day', now()) as today_start,
          date_trunc('day', now()) + interval '1 day' as tomorrow_start,
          date_trunc('day', now()) - interval '1 day' as yesterday_start
      ),
      orders_today as (
        select count(*)::bigint as value
        from public.sales_orders o, boundaries b
        where o.created_at >= b.today_start
          and o.created_at < b.tomorrow_start
      ),
      orders_yesterday as (
        select count(*)::bigint as value
        from public.sales_orders o, boundaries b
        where o.created_at >= b.yesterday_start
          and o.created_at < b.today_start
      ),
      sales_today as (
        select
          coalesce(
            sum(
              coalesce(
                nullif(to_jsonb(l)->>'line_total', '')::numeric,
                nullif(to_jsonb(l)->>'LineTotal', '')::numeric,
                nullif(to_jsonb(l)->>'total', '')::numeric,
                nullif(to_jsonb(l)->>'Total', '')::numeric,
                (
                  coalesce(
                    nullif(to_jsonb(l)->>'quantity', '')::numeric,
                    nullif(to_jsonb(l)->>'Quantity', '')::numeric,
                    0
                  ) * coalesce(
                    nullif(to_jsonb(l)->>'unit_price', '')::numeric,
                    nullif(to_jsonb(l)->>'UnitPrice', '')::numeric,
                    nullif(to_jsonb(l)->>'price', '')::numeric,
                    nullif(to_jsonb(l)->>'Price', '')::numeric,
                    0
                  )
                )
              )
            ),
            0
          )::numeric as value
        from public.sales_order_lines l
        join public.sales_orders o on l.sales_order_id = o.id
        join boundaries b on true
        where o.created_at >= b.today_start
          and o.created_at < b.tomorrow_start
      ),
      sales_yesterday as (
        select
          coalesce(
            sum(
              coalesce(
                nullif(to_jsonb(l)->>'line_total', '')::numeric,
                nullif(to_jsonb(l)->>'LineTotal', '')::numeric,
                nullif(to_jsonb(l)->>'total', '')::numeric,
                nullif(to_jsonb(l)->>'Total', '')::numeric,
                (
                  coalesce(
                    nullif(to_jsonb(l)->>'quantity', '')::numeric,
                    nullif(to_jsonb(l)->>'Quantity', '')::numeric,
                    0
                  ) * coalesce(
                    nullif(to_jsonb(l)->>'unit_price', '')::numeric,
                    nullif(to_jsonb(l)->>'UnitPrice', '')::numeric,
                    nullif(to_jsonb(l)->>'price', '')::numeric,
                    nullif(to_jsonb(l)->>'Price', '')::numeric,
                    0
                  )
                )
              )
            ),
            0
          )::numeric as value
        from public.sales_order_lines l
        join public.sales_orders o on l.sales_order_id = o.id
        join boundaries b on true
        where o.created_at >= b.yesterday_start
          and o.created_at < b.today_start
      ),
      sales_global as (
        select
          coalesce(
            sum(
              coalesce(
                nullif(to_jsonb(l)->>'line_total', '')::numeric,
                nullif(to_jsonb(l)->>'LineTotal', '')::numeric,
                nullif(to_jsonb(l)->>'total', '')::numeric,
                nullif(to_jsonb(l)->>'Total', '')::numeric,
                (
                  coalesce(
                    nullif(to_jsonb(l)->>'quantity', '')::numeric,
                    nullif(to_jsonb(l)->>'Quantity', '')::numeric,
                    0
                  ) * coalesce(
                    nullif(to_jsonb(l)->>'unit_price', '')::numeric,
                    nullif(to_jsonb(l)->>'UnitPrice', '')::numeric,
                    nullif(to_jsonb(l)->>'price', '')::numeric,
                    nullif(to_jsonb(l)->>'Price', '')::numeric,
                    0
                  )
                )
              )
            ),
            0
          )::numeric as value
        from public.sales_order_lines l
      )
      select
        (select value from orders_today) as orders_today,
        (select value from orders_yesterday) as orders_yesterday,
        (select value from sales_today) as sales_today,
        (select value from sales_yesterday) as sales_yesterday,
        (select value from sales_global) as sales_global_total
    $q$;
  else
    sql_text := $q$
      with boundaries as (
        select
          date_trunc('day', now()) as today_start,
          date_trunc('day', now()) + interval '1 day' as tomorrow_start,
          date_trunc('day', now()) - interval '1 day' as yesterday_start
      ),
      orders_today as (
        select count(*)::bigint as value
        from public.sales_orders o, boundaries b
        where o.created_at >= b.today_start
          and o.created_at < b.tomorrow_start
      ),
      orders_yesterday as (
        select count(*)::bigint as value
        from public.sales_orders o, boundaries b
        where o.created_at >= b.yesterday_start
          and o.created_at < b.today_start
      )
      select
        (select value from orders_today) as orders_today,
        (select value from orders_yesterday) as orders_yesterday,
        0::numeric as sales_today,
        0::numeric as sales_yesterday,
        0::numeric as sales_global_total
    $q$;
  end if;

  return query execute sql_text;
end;
$$;

grant execute on function public.get_admin_dashboard_kpis() to authenticated;
grant execute on function public.get_admin_dashboard_kpis() to service_role;
