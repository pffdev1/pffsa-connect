import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type UnlockEvent = {
  id: number;
  card_code: string;
  customer_name: string | null;
  vendedor: string | null;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUSH_DISPATCH_SECRET = Deno.env.get("PUSH_DISPATCH_SECRET") ?? "";
const DISPATCH_BATCH_SIZE = Number(Deno.env.get("PUSH_DISPATCH_BATCH_SIZE") ?? "40");
const MAX_RETRY_SECONDS = Number(Deno.env.get("PUSH_MAX_RETRY_SECONDS") ?? "1800");
const PUSH_INCLUDE_ADMINS = (Deno.env.get("PUSH_INCLUDE_ADMINS") ?? "true").toLowerCase() !== "false";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jsonHeaders = { "Content-Type": "application/json" };

const sanitize = (value: unknown) => String(value ?? "").trim();

const normalizeExpoToken = (token: unknown) => {
  const value = sanitize(token);
  return value.startsWith("ExponentPushToken[") || value.startsWith("ExpoPushToken[") ? value : "";
};

const normalizeName = (value: unknown) =>
  sanitize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const buildUnlockMessage = (event: UnlockEvent) => {
  const cardCode = sanitize(event.card_code);
  const customerName = sanitize(event.customer_name) || cardCode || "Cliente";
  return {
    title: "Cliente desbloqueado",
    body: cardCode ? `${customerName} (${cardCode}) ya esta habilitado.` : `${customerName} ya esta habilitado.`,
    data: {
      type: "customer_unlock",
      card_code: cardCode,
      customer_name: customerName,
      vendedor: sanitize(event.vendedor),
    },
  };
};

const getTargetUserIdsForEvent = async (event: UnlockEvent): Promise<string[]> => {
  const sellerName = normalizeName(event.vendedor);
  const profileResult = await supabase.from("profiles").select("id, full_name, role");
  if (profileResult.error || !Array.isArray(profileResult.data)) {
    return [];
  }

  const ids = new Set<string>();

  for (const row of profileResult.data as Array<{ id?: string; full_name?: string; role?: string }>) {
    const userId = sanitize(row?.id);
    if (!userId) continue;
    const role = normalizeName(row?.role);

    if (PUSH_INCLUDE_ADMINS && role === "admin") {
      ids.add(userId);
      continue;
    }

    if (role !== "vendedor") continue;
    const fullName = normalizeName(row?.full_name);
    if (!sellerName || !fullName) continue;
    if (fullName === sellerName) {
      ids.add(userId);
    }
  }

  return Array.from(ids);
};

const getTargetTokensForUserIds = async (userIds: string[]): Promise<string[]> => {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const tokenSet = new Set<string>();

  const byTable = await supabase.from("user_push_tokens").select("push_token").in("user_id", userIds);
  if (!byTable.error && Array.isArray(byTable.data)) {
    byTable.data.forEach((row) => {
      const token = normalizeExpoToken((row as { push_token?: unknown })?.push_token);
      if (token) tokenSet.add(token);
    });
  }

  const byProfiles = await supabase
    .from("profiles")
    .select("expo_push_token")
    .in("id", userIds)
    .not("expo_push_token", "is", null);
  if (!byProfiles.error && Array.isArray(byProfiles.data)) {
    byProfiles.data.forEach((row) => {
      const token = normalizeExpoToken((row as { expo_push_token?: unknown })?.expo_push_token);
      if (token) tokenSet.add(token);
    });
  }

  return Array.from(tokenSet);
};

const removeInvalidToken = async (token: string) => {
  await supabase.from("user_push_tokens").delete().eq("push_token", token);
  await supabase
    .from("profiles")
    .update({ expo_push_token: null })
    .eq("expo_push_token", token);
};

const sendExpoPush = async (token: string, event: UnlockEvent) => {
  const message = buildUnlockMessage(event);
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      to: token,
      sound: "default",
      title: message.title,
      body: message.body,
      data: message.data,
      channelId: "default",
      priority: "high",
    }),
  });

  if (!response.ok) {
    throw new Error(`Expo HTTP ${response.status}`);
  }

  const payload = await response.json();
  const item = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  const status = sanitize(item?.status).toLowerCase();
  const details = item?.details ?? {};
  const errorCode = sanitize(details?.error).toLowerCase();
  if (status === "error") {
    if (errorCode === "devicenotregistered") {
      await removeInvalidToken(token);
    }
    throw new Error(
      `Expo error ${errorCode || "unknown"}: ${sanitize(item?.message || payload?.errors?.[0]?.message)}`
    );
  }
};

const computeRetryInSeconds = (attemptCount: number) => {
  const safeAttempt = Number.isFinite(attemptCount) ? Math.max(1, attemptCount) : 1;
  const next = Math.min(MAX_RETRY_SECONDS, 30 * 2 ** Math.min(safeAttempt, 6));
  return Math.max(30, next);
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (PUSH_DISPATCH_SECRET) {
    const secret = sanitize(req.headers.get("x-push-secret"));
    if (!secret || secret !== PUSH_DISPATCH_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
  }

  const lockOwner = crypto.randomUUID();
  const claimed = await supabase.rpc("claim_customer_unlock_push_events", {
    p_max_rows: Math.max(1, DISPATCH_BATCH_SIZE),
    p_lock_owner: lockOwner,
  });

  if (claimed.error) {
    return new Response(
      JSON.stringify({ ok: false, error: `claim_customer_unlock_push_events failed: ${claimed.error.message}` }),
      { status: 500, headers: jsonHeaders },
    );
  }

  const rows = (claimed.data ?? []) as UnlockEvent[];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, sent: 0, failed: 0 }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  let targetTokensTotal = 0;
  let sent = 0;
  let failed = 0;
  let skippedNoTargetUsers = 0;
  let skippedNoTargetTokens = 0;

  for (const row of rows) {
    try {
      const userIds = await getTargetUserIdsForEvent(row);
      if (userIds.length === 0) {
        failed += 1;
        skippedNoTargetUsers += 1;
        const retryIn = computeRetryInSeconds(row.attempt_count);
        await supabase.rpc("mark_customer_unlock_push_event_failed", {
          p_event_id: row.id,
          p_error: "NO_TARGET_USERS: no sellers/admins resolved for this event",
          p_retry_in_seconds: retryIn,
        });
        continue;
      }

      const tokens = await getTargetTokensForUserIds(userIds);
      if (tokens.length === 0) {
        failed += 1;
        skippedNoTargetTokens += 1;
        const retryIn = computeRetryInSeconds(row.attempt_count);
        await supabase.rpc("mark_customer_unlock_push_event_failed", {
          p_event_id: row.id,
          p_error: "NO_TARGET_TOKENS: recipients found but without valid push tokens",
          p_retry_in_seconds: retryIn,
        });
        continue;
      }

      targetTokensTotal += tokens.length;

      for (const token of tokens) {
        await sendExpoPush(token, row);
      }
      await supabase.rpc("mark_customer_unlock_push_event_sent", { p_event_id: row.id });
      sent += 1;
    } catch (error) {
      failed += 1;
      const retryIn = computeRetryInSeconds(row.attempt_count);
      await supabase.rpc("mark_customer_unlock_push_event_failed", {
        p_event_id: row.id,
        p_error: sanitize((error as Error)?.message || error),
        p_retry_in_seconds: retryIn,
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: rows.length,
      sent,
      failed,
      skipped_no_target_users: skippedNoTargetUsers,
      skipped_no_target_tokens: skippedNoTargetTokens,
      target_tokens: targetTokensTotal,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
