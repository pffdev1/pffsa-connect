# Tareas propuestas tras revision rapida del codigo

## 1) Corregir error tipografico
- **Tipo:** Typo/copy.
- **Hallazgo:** En `mobile-app/README.md` aparecen varias palabras sin acento en espanol (por ejemplo, "Aplicacion movil" y "gestion"), lo que reduce la calidad editorial del documento de onboarding.
- **Tarea propuesta:** Normalizar tildes y ortografia en el README movil (p. ej. "Aplicacion movil", "gestion", "catalogo", "lineas", "unico").
- **Criterio de aceptacion:** El documento queda revisado con ortografia consistente en espanol y sin cambios funcionales.

## 2) Corregir una falla funcional en filtros de ordenes
- **Tipo:** Bug.
- **Hallazgo:** En `fetchOrdersInRange` y `fetchAllOrders`, cuando se pasa `createdBy`, siempre se aplica `.eq('created_by', createdBy)` incluso en variantes de esquema que usan `seller_id` y no `created_by`. Eso provoca que los intentos de fallback fallen por columna inexistente y no devuelvan datos en esos esquemas.
- **Tarea propuesta:** Hacer que cada intento de consulta aplique el filtro por la columna disponible (`created_by` o `seller_id`) segun el `select` usado, o definir metadatos por intento para saber que filtro corresponde.
- **Criterio de aceptacion:** Con esquemas alternos (solo `seller_id`) y con `createdBy` informado, ambas funciones retornan resultados validos en lugar de error.

## 3) Corregir discrepancia en documentacion
- **Tipo:** Documentacion inconsistente.
- **Hallazgo:** `mobile-app/docs/push_phase1.md` indica ejecutar `mobile-app/docs/push_phase1.sql`, pero ese archivo no existe en el repositorio. Los scripts SQL reales relacionados estan en `mobile-app/scripts/`.
- **Tarea propuesta:** Actualizar la guia para apuntar a los SQL existentes en `mobile-app/scripts/` (o agregar el archivo faltante en `docs/` si era intencional).
- **Criterio de aceptacion:** La ruta indicada en la guia existe en el repositorio y el flujo se puede seguir sin pasos rotos.

## 4) Mejorar una prueba
- **Tipo:** Calidad de test.
- **Hallazgo:** No hay pruebas automatizadas que validen el fallback de columnas en `homeRepository`.
- **Tarea propuesta:** Agregar pruebas unitarias para `fetchOrdersInRange` y `fetchAllOrders` simulando respuestas de Supabase con esquemas mixtos (`created_by` vs `seller_id`) y verificando que el filtro dinamico use la columna correcta.
- **Criterio de aceptacion:** Las pruebas fallan con la implementacion actual y pasan con la correccion, cubriendo al menos:
  1. esquema con `created_by`;
  2. esquema con `seller_id`;
  3. caso sin filtro `createdBy`.

## Nota de trazabilidad
- En este repositorio, la tarea quedo registrada en el commit actual `5cea6eb`.
- Si trabajas en otra rama o remoto, usa `git log --oneline` para ubicar el commit equivalente.
