-- Normaliza full_name en profiles a formato SAP (MAYUSCULAS y espacios).
-- Ejemplo: zulay.gonzalez -> ZULAY GONZALEZ
-- Ejecutar en Supabase SQL Editor.

UPDATE public.profiles
SET
  full_name = upper(
    regexp_replace(
      regexp_replace(trim(coalesce(full_name, split_part(email, '@', 1))), '[._-]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  ),
  updated_at = now()
WHERE role = 'vendedor'
  AND coalesce(full_name, '') <> '';

-- Validacion rapida
SELECT id, email, full_name, role
FROM public.profiles
WHERE role = 'vendedor'
ORDER BY full_name;

