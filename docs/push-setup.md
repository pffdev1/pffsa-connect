# Push Setup (Clientes Desbloqueados)

Este proyecto ya registra `ExpoPushToken` en login. Este documento completa el envio push cuando el celular esta bloqueado para el evento:

- cliente desbloqueado (`customers.Bloqueado: Y -> N`)

## 1) SQL en Supabase

Ejecuta primero:

- `mobile-app/scripts/supabase-push-customer-unlock.sql`

Esto crea:

- `public.customer_unlock_push_events` (cola/outbox)
- trigger en `public.customers` para encolar cuando `Bloqueado` cambia de `Y` a `N`
- RPCs para que el worker procese la cola:
  - `claim_customer_unlock_push_events`
  - `mark_customer_unlock_push_event_sent`
  - `mark_customer_unlock_push_event_failed`

## 2) Deploy Edge Function

Desde la raiz del repo:

```bash
supabase functions deploy push-customer-unlock
```

Configura secrets (en dashboard o CLI):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUSH_DISPATCH_SECRET` (recomendado)
- `PUSH_DISPATCH_BATCH_SIZE` (opcional, default `40`)
- `PUSH_MAX_RETRY_SECONDS` (opcional, default `1800`)
- `PUSH_INCLUDE_ADMINS` (opcional, default `true`)
  - `true`: envia a vendedores asignados + admins
  - `false`: envia solo a vendedores asignados

## 3) Programar ejecucion automatica

La funcion debe ejecutarse periodicamente (ej. cada 1 minuto).

Opciones:

1. Dashboard de Supabase (recomendado): Scheduler -> HTTP Request a la Edge Function.
2. Servicio externo (GitHub Actions, cron serverless, etc.) haciendo `POST` al endpoint.

Endpoint:

`https://<PROJECT-REF>.functions.supabase.co/push-customer-unlock`

Header recomendado:

- `x-push-secret: <PUSH_DISPATCH_SECRET>`

## 4) Prueba rapida

1. Inicia sesion en la app y acepta permisos de notificaciones.
2. Verifica que exista token en `public.user_push_tokens` o `profiles.expo_push_token`.
3. Actualiza un cliente con `Bloqueado='Y'` a `Bloqueado='N'`.
4. Ejecuta la function manualmente con `POST`.
5. Revisa:
   - `public.customer_unlock_push_events.sent_at`
   - notificacion recibida en el dispositivo.

## 4.1 Regla de destinatarios

La function `push-customer-unlock` resuelve destinatarios por `customers.Vendedor`:

- Busca usuarios `profiles.role='vendedor'` cuyo `profiles.full_name` coincide con `customers.Vendedor` (normalizado).
- Si `PUSH_INCLUDE_ADMINS=true`, agrega usuarios `profiles.role='admin'`.

## 5) Observabilidad minima

Consultas utiles:

```sql
select id, card_code, customer_name, vendedor, attempt_count, sent_at, next_attempt_at, last_attempt_error, created_at
from public.customer_unlock_push_events
order by created_at desc
limit 100;
```

```sql
select count(*) filter (where sent_at is null) as pending,
       count(*) filter (where sent_at is not null) as sent
from public.customer_unlock_push_events;
```
