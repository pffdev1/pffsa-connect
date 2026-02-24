# Arquitectura objetivo (Feature-based + DDD liviano)

## Estado actual

- `app/` se usa para routing con Expo Router.
- Hay modulos globales en `src/components`, `src/services`, `src/context`, `src/constants`.
- Parte de la logica de negocio vive dentro de pantallas.

## Decision de arquitectura

Usar **feature-based** como estructura principal y **DDD liviano** dentro de cada feature.

## Estructura base

```txt
app/                                # Solo rutas y layouts (Expo Router)
src/
  features/
    profile/
      domain/                       # Entidades y reglas del dominio
      application/                  # Casos de uso/orquestacion
      infrastructure/               # Repositorios/adapters (Supabase, cache, etc)
      presentation/
        screens/                    # Pantallas
        components/                 # Componentes de la feature
        hooks/                      # Hooks de la feature
  shared/
    ui/                             # Componentes UI reutilizables cross-feature
    lib/                            # Utilidades generales sin dominio
    config/                         # Configuracion compartida
```

## Reglas practicas

- `app/` no contiene reglas de negocio ni acceso directo a datos.
- Cada feature es duena de su logica.
- `shared/` no depende de `features/`.
- `domain/` no depende de React, Expo ni Supabase.
- `infrastructure/` implementa contratos de `application/domain`.

## Migracion por fases

1. Mantener rutas existentes y convertir cada archivo de `app/(tabs)` en wrapper.
2. Migrar `pedido` y `clientes` a `src/features/.../presentation/screens`.
3. Extraer consultas Supabase por feature a `infrastructure/`.
4. Extraer reglas y normalizadores a `domain/` y `application/`.
5. Reducir `src/services` y `src/components` globales a `shared/` o features.

## Estado implementado

- `profile`, `orders`, `customers`, `home`, `catalog` y `auth` ya viven en `src/features/...`.
- `pedido` y `clientes` ya consumen repositorios de `infrastructure/` para Supabase.
- Reglas/normalizadores extraidos:
  - `src/features/orders/domain/orderDateRules.js`
  - `src/features/orders/application/orderBuilders.js`
  - `src/features/customers/domain/customerRules.js`
  - `src/features/customers/application/customersQueryPolicy.js`
- Paso 5 aplicado:
  - `CustomerGrid` y `CustomerCard` movidos a `src/features/customers/presentation/components/`.
  - `CartContext` movido a `src/shared/state/cart/CartContext.js` (ownership compartido entre `catalogo`, `pedido`, `clientes`, tabs y layout).
  - Capa compartida de infraestructura creada en `src/shared/infrastructure/` y usada por `app/` y `features/`.
  - Implementacion principal movida a `src/shared/infrastructure/*`.
  - Wrappers sin uso en `src/components/Customer*` y `src/context/CartContext.js` eliminados.
  - Capa legacy `src/services/*` eliminada (sin referencias activas).
  - `app/` mantiene solo wrappers de rutas y layouts.

## Actualizaciones recientes (alineadas a esta arquitectura)

- `auth`:
  - Intro previa a login consolidada en un solo componente de presentacion:
    - `src/features/auth/presentation/components/PedersenBarsSplash.js`
  - Tokens de animacion/tiempos aislados en dominio:
    - `src/features/auth/domain/introMotion.js`
  - `IntroScreen` eliminado para evitar doble capa; `app/index.js` apunta directo al splash interactivo.
- `home`:
  - Separacion de panel vendedor vs panel admin en componentes independientes.
  - KPI, salud operativa y modales de detalle desacoplados por componentes.
  - Correcciones de datos de pedidos de hoy, ventas y nombres de cliente/vendedor.
- `profile`:
  - Refactor de pantalla con utilidades en `domain` y `application`.
  - Hero compacto y sticky en capa de presentacion, sin mover reglas a UI.
- `shared`:
  - Estandarizacion de tokens visuales de hero:
    - `src/shared/config/heroTokens.js`
  - Infraestructura compartida consolidada en:
    - `src/shared/infrastructure/*`

## Release 1.0.1 (documentado)

- `auth/session`:
  - Manejo defensivo de refresh token invalido en `src/shared/infrastructure/supabaseClient.js`.
  - `RootLayout` mantenido para listeners/sync (notificaciones y flush offline), sin puerta de autenticacion.
  - Validacion de sesion centralizada al arranque en `PedersenBarsSplash`.
  - Mensajes de estado de bootstrap visibles para usuario (sesion, acceso, redireccion).
- `home/admin`:
  - Tarjeta de ventas admin ahora muestra ventas totales (global), no solo del dia.
  - Formato compacto para montos grandes (ej. `$10.1k`).
  - Modal de resumen cambia texto a `Cantidad de pedidos`.
- `profile/vendedor`:
  - Seccion de pedidos limitada a los ultimos 30 dias.
  - Paginacion `CARGAR MAS` preservada dentro del rango de 30 dias.
- `ux/splash`:
  - `expo-splash-screen` alineado visualmente a identidad Pedersen (fondo/logo) para continuidad con splash interactivo.

## Criterio obligatorio para cambios futuros

- Todo cambio nuevo debe ubicarse en la feature correspondiente (`domain`, `application`, `infrastructure`, `presentation`).
- `app/` solo define rutas/layout y wrappers.
- Si una regla se reutiliza entre features, se mueve a `shared` sin acoplarse a una feature concreta.
