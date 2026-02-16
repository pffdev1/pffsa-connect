-- Realtime + RLS final para public.customers
-- Ejecutar en Supabase SQL Editor

-- 1) Necesario para recibir payload.old completo en postgres_changes (UPDATE/DELETE)
ALTER TABLE public.customers REPLICA IDENTITY FULL;

-- 2) Funcion de normalizacion (alineada con normalizeSellerName del cliente)
CREATE OR REPLACE FUNCTION public.normalize_seller_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(
    regexp_replace(
      regexp_replace(trim(coalesce(input, '')), '[._-]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- 3) RLS: admin ve todo, vendedor solo clientes de su cartera
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers SELECT por Vendedor o Admin" ON public.customers;

CREATE POLICY "Customers SELECT por Vendedor o Admin"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        lower(coalesce(p.role, '')) = 'admin'
        OR public.normalize_seller_name(p.full_name) = public.normalize_seller_name(public.customers."Vendedor")
      )
  )
);
