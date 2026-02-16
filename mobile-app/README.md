# PFFSA Connect - Mobile App

Aplicacion movil (Expo/React Native) para gestion de clientes, catalogo y pedidos.

## Requisitos

- Node.js 18+
- npm 9+
- Variables de entorno en `mobile-app/.env`

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Ejecutar

```bash
npm install
npx expo start
```

## Fuente de datos del catalogo

La pantalla `catalogo` consulta la vista `public.vw_catalogo_cliente` en Supabase.

Campos esperados por la app:

- `ItemCode`
- `ItemName`
- `Marca`
- `UOM`
- `Url` (opcional)
- `CardCode`
- `Price`
- `PriceSource` (opcional, recomendado)

## Regla de precio mostrada

La app muestra un solo precio por item, con esta prioridad:

1. Oferta especifica por `CardCode` (`CARDCODE_OFFER`)
2. Oferta por nivel/lista (`LISTNUM_OFFER`)
3. Precio base (`BASE_PRICE`)

Si la vista trae filas duplicadas para el mismo `ItemCode`, la app normaliza y conserva la fila con mayor prioridad (`PriceSource`).

## Reglas de oferta recomendadas en SQL

Para evitar inconsistencias, la vista en Supabase debe resolver el precio final con la misma prioridad:

1. Oferta activa por `CardCode + ItemCode`
2. Si no existe, oferta activa por `ListNum + ItemCode`
3. Si no existe, `prices.Price`

Esto permite que `catalogo` y `pedido` trabajen con un precio final unico y consistente.
