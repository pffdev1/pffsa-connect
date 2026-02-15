-- RLS de customers por campo Vendedor + rol admin.
-- Ejecutar en Supabase SQL Editor despues del script de profiles.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers por Vendedor o Admin" ON public.customers;

CREATE POLICY "Customers por Vendedor o Admin"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR upper(regexp_replace(trim(p.full_name), '[._-]+', ' ', 'g')) =
           upper(regexp_replace(trim(public.customers."Vendedor"), '\s+', ' ', 'g'))
      )
  )
);
