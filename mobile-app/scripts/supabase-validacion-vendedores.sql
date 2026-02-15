-- Validaciones de consistencia entre profiles y customers.
-- Ejecutar en Supabase SQL Editor.

-- 1) Vendedores en customers sin perfil asociado (match exacto).
SELECT DISTINCT c."Vendedor" AS vendedor_sap_sin_perfil
FROM public.customers c
LEFT JOIN public.profiles p
  ON p.full_name = c."Vendedor"
WHERE c."Vendedor" IS NOT NULL
  AND trim(c."Vendedor") <> ''
  AND p.id IS NULL
ORDER BY 1;

-- 2) Vendedores en customers sin perfil asociado (match normalizado trim+lower).
SELECT DISTINCT c."Vendedor" AS vendedor_sap_sin_perfil_normalizado
FROM public.customers c
LEFT JOIN public.profiles p
  ON lower(trim(p.full_name)) = lower(trim(c."Vendedor"))
WHERE c."Vendedor" IS NOT NULL
  AND trim(c."Vendedor") <> ''
  AND p.id IS NULL
ORDER BY 1;

-- 3) Perfiles vendedor sin clientes asignados (match exacto).
SELECT p.id, p.email, p.full_name
FROM public.profiles p
LEFT JOIN public.customers c
  ON c."Vendedor" = p.full_name
WHERE p.role = 'vendedor'
  AND c."Vendedor" IS NULL
ORDER BY p.full_name;

-- 4) Duplicados de full_name en perfiles de vendedores.
SELECT p.full_name, count(*) AS repeticiones
FROM public.profiles p
WHERE p.role = 'vendedor'
  AND p.full_name IS NOT NULL
  AND trim(p.full_name) <> ''
GROUP BY p.full_name
HAVING count(*) > 1
ORDER BY repeticiones DESC, p.full_name;

-- 5) Resumen de cobertura (exacto y normalizado).
SELECT
  (SELECT count(DISTINCT c."Vendedor")
   FROM public.customers c
   WHERE c."Vendedor" IS NOT NULL AND trim(c."Vendedor") <> '') AS vendedores_sap_distintos,
  (SELECT count(DISTINCT p.full_name)
   FROM public.profiles p
   WHERE p.role = 'vendedor' AND p.full_name IS NOT NULL AND trim(p.full_name) <> '') AS vendedores_en_profiles,
  (SELECT count(DISTINCT c."Vendedor")
   FROM public.customers c
   JOIN public.profiles p ON p.full_name = c."Vendedor"
   WHERE c."Vendedor" IS NOT NULL AND trim(c."Vendedor") <> '' AND p.role = 'vendedor') AS match_exacto,
  (SELECT count(DISTINCT c."Vendedor")
   FROM public.customers c
   JOIN public.profiles p ON lower(trim(p.full_name)) = lower(trim(c."Vendedor"))
   WHERE c."Vendedor" IS NOT NULL AND trim(c."Vendedor") <> '' AND p.role = 'vendedor') AS match_normalizado;

-- 6) Verificacion de admins configurados.
SELECT id, email, full_name, role
FROM public.profiles
WHERE lower(email) IN ('weelmer.moreno@pffsa.com', 'medin.barroso@pffsa.com')
ORDER BY email;
