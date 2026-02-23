# Push Fase 1

Esta fase deja la app lista para notificaciones push nativas:

- solicita permisos del usuario
- crea canal Android `default`
- obtiene `ExpoPushToken`
- guarda token en `public.user_push_tokens`

## 1) SQL base (opcional)

No existe `mobile-app/docs/push_phase1.sql` en este repositorio.

La app intenta guardar tokens en `public.user_push_tokens` y, si esa tabla no existe,
hace fallback a `profiles.expo_push_token` (ver `src/shared/infrastructure/notificationsService.js`).

Si ya tienes `user_push_tokens` en tu esquema, no necesitas cambios adicionales aqui.

## 2) Instalar dependencias (app)

```bash
npm install expo-notifications
```

## 3) Enviar notificaciones desde backend

La app solo registra tokens. Para push cuando la app esta cerrada, debes enviar desde backend.

Payload Expo:

```json
{
  "to": "ExponentPushToken[xxxx]",
  "sound": "default",
  "title": "Cliente desbloqueado",
  "body": "Cliente ABC (C0001) ya esta habilitado",
  "data": {
    "type": "customer_unlock",
    "card_code": "C0001"
  }
}
```

Endpoint Expo:

`POST https://exp.host/--/api/v2/push/send`

Headers:

`Content-Type: application/json`

## 4) Flujo recomendado

1. Trigger/worker detecta evento (ej. `customers.Bloqueado` cambia `Y -> N`).
2. Consulta `user_push_tokens` (y fallback `profiles.expo_push_token`).
3. Envia notificacion a cada token.
4. Registra respuesta para limpiar tokens invalidos.

## Implementacion en este repo

Para el flujo actual (clientes desbloqueados), revisa:

- `mobile-app/scripts/supabase-push-customer-unlock.sql`
- `supabase/functions/push-customer-unlock/index.ts`
- `docs/push-setup.md`
