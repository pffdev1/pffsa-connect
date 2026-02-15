-- Bootstrap completo para reconstruir acceso por vendedor/admin.
-- Ejecutar en Supabase SQL Editor.

-- 1) Tabla de perfiles (si no existe)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  role text NOT NULL DEFAULT 'vendedor',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Asegurar columnas por si la tabla ya existia con esquema previo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'vendedor';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Constraint de rol
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'vendedor'));
  END IF;
END $$;

-- 2) RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 3) Marcar admins por correo (si el usuario auth ya existe)
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com');

-- 4) RLS en customers por Vendedor/admin
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers por Vendedores o Admin" ON public.customers;
DROP POLICY IF EXISTS "Customers por Vendedor o Admin" ON public.customers;

DO $$
DECLARE
  seller_col text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'Vendedor'
  ) THEN
    seller_col := '"Vendedor"';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'Vendedores'
  ) THEN
    seller_col := '"Vendedores"';
  ELSE
    RAISE EXCEPTION 'No existe la columna Vendedor/Vendedores en public.customers';
  END IF;

  EXECUTE format(
    'CREATE POLICY "Customers por Vendedor o Admin"
     ON public.customers
     FOR SELECT
     TO authenticated
     USING (
       EXISTS (
         SELECT 1
         FROM public.profiles p
         WHERE p.id = auth.uid()
           AND (
             p.role = ''admin''
             OR upper(regexp_replace(trim(p.full_name), ''[._-]+'', '' '', ''g'')) =
                upper(regexp_replace(trim(public.customers.%s), ''\s+'', '' '', ''g''))
           )
       )
     )',
    seller_col
  );
END $$;
