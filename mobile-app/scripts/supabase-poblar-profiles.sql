-- Poblar/actualizar profiles desde auth.users
-- Ejecutar en Supabase SQL Editor (despues del bootstrap).

-- 1) Insertar o actualizar perfiles para todos los usuarios autenticados.
INSERT INTO public.profiles (id, email, full_name, role)
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
  END AS role
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
  role = CASE
    WHEN EXCLUDED.email IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com') THEN 'admin'
    ELSE COALESCE(public.profiles.role, 'vendedor')
  END,
  updated_at = now();

-- 2) Refuerzo: admins por correo.
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE lower(email) IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com');

-- 3) Verificacion rapida.
SELECT id, email, full_name, role
FROM public.profiles
ORDER BY role DESC, email;
