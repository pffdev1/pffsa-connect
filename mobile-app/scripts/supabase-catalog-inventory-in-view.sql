-- Include inventory badges (warehouses 100 and 010) directly in catalog view.
-- Run in Supabase SQL Editor for environments where this has not been applied yet.

create index if not exists idx_inventory_itemcode_idbodega
  on public.inventory ("ItemCode", "IDBodega");

create or replace view public.vw_catalogo_cliente as
select
  p."ItemCode",
  p."ItemName",
  p."Marca",
  p."UOM",
  p."Url",
  c."CardCode",
  c."CardFName",
  c."ListNum",
  coalesce(oc."PrecioOferta", ol."PrecioOferta", pr."Price") as "Price",
  case
    when oc."PrecioOferta" is not null then 'CARDCODE_OFFER'::text
    when ol."PrecioOferta" is not null then 'LISTNUM_OFFER'::text
    else 'BASE_PRICE'::text
  end as "PriceSource",
  inv."Inventory100",
  inv."Inventory010"
from customers c
join prices pr on pr."IDLista" = c."ListNum"
join products p on p."ItemCode" = pr."ItemCode"
left join lateral (
  select o."PrecioOferta"
  from offers_customer o
  where o."CardCode" = c."CardCode"
    and o."ItemCode" = p."ItemCode"
    and o."Estado" = 'A'::text
    and (o."FechaInicio" is null or current_date >= o."FechaInicio")
    and (o."FechaFin" is null or current_date <= o."FechaFin")
  order by o.updated_at desc
  limit 1
) oc on true
left join lateral (
  select o."PrecioOferta"
  from offers_level o
  where o."ListNum" = c."ListNum"
    and o."ItemCode" = p."ItemCode"
    and o."Estado" = 'A'::text
    and (o."FechaInicio" is null or current_date >= o."FechaInicio")
    and (o."FechaFin" is null or current_date <= o."FechaFin")
  order by o.updated_at desc
  limit 1
) ol on true
left join lateral (
  select
    max(case when i."IDBodega" = '100' then i."Inventario" end) as "Inventory100",
    max(case when i."IDBodega" = '010' then i."Inventario" end) as "Inventory010"
  from inventory i
  where i."ItemCode" = p."ItemCode"
    and i."IDBodega" in ('100', '010')
) inv on true;
