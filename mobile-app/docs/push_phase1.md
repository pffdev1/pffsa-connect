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
  "title": "Pedido actualizado",
  "body": "Tu pedido SAP #12345 fue enviado",
  "data": {
    "type": "order_status",
    "order_id": "..."
  }
}
```

Endpoint Expo:

`POST https://exp.host/--/api/v2/push/send`

Headers:

`Content-Type: application/json`

## 4) Flujo recomendado

1. Trigger/worker detecta evento (ej. `sales_orders.status` cambia).
2. Consulta `user_push_tokens` del usuario destino.
3. Envia notificacion a cada token.
4. Registra respuesta para limpiar tokens invalidos.
