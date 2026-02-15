-- Auto-crear/actualizar profiles cuando se crea un usuario en auth.users
-- Ejecutar en Supabase SQL Editor.

-- 1) Funcion que sincroniza auth.users -> public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  computed_email text;
  base_full_name text;
  computed_full_name text;
  computed_role text;
BEGIN
  computed_email := lower(new.email);
  base_full_name := COALESCE(
    NULLIF(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(trim(split_part(new.email, '@', 1)), '')
  );
  computed_full_name := upper(
    regexp_replace(
      regexp_replace(trim(base_full_name), '[._-]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  );

  computed_role := CASE
    WHEN computed_email IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com') THEN 'admin'
    ELSE 'vendedor'
  END;

  INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
  VALUES (new.id, computed_email, computed_full_name, computed_role, now(), now())
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
    role = CASE
      WHEN EXCLUDED.email IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com') THEN 'admin'
      ELSE COALESCE(public.profiles.role, 'vendedor')
    END,
    updated_at = now();

  RETURN new;
END;
$$;

-- 2) Trigger en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- 3) Backfill para usuarios ya existentes
INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
SELECT
  u.id,
  lower(u.email) AS email,
  upper(
    regexp_replace(
      regexp_replace(
        trim(
          COALESCE(
            NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
            NULLIF(trim(split_part(u.email, '@', 1)), '')
          )
        ),
        '[._-]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  ) AS full_name,
  CASE
    WHEN lower(u.email) IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com') THEN 'admin'
    ELSE 'vendedor'
  END AS role,
  now(),
  now()
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 4) Verificacion rapida
SELECT id, email, full_name, role
FROM public.profiles
ORDER BY role DESC, email;
