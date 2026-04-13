// supabase/functions/send-order-to-sap/index.ts
// Webhook/HTTP handler: recibe payload de Supabase Database Webhook (UPDATE en sales_orders)
// Procesa solo cuando record.status === 'pending'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: { id?: string; status?: string };
  old_record?: { id?: string; status?: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeSapComments(value: unknown, maxLen = 254) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, maxLen);
}

function normalizeDimValue(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function resolveCostingCode2ByWarehouse(warehouseCode: unknown) {
  const raw = String(warehouseCode ?? "").trim();
  if (raw === "100") return "CD-01";
  if (raw === "010" || raw === "10") return "CH-01";
  return null;
}

// --- SAP Service Layer helpers ---
async function sapLogin(baseUrl: string, companyDb: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ CompanyDB: companyDb, UserName: username, Password: password }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SAP Login failed: ${res.status} ${text}`);

  const setCookie = res.headers.get("set-cookie") ?? "";
  if (!setCookie) throw new Error("SAP Login failed: missing set-cookie");

  return setCookie;
}

async function sapLogout(baseUrl: string, cookie: string) {
  try {
    await fetch(`${baseUrl}/Logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
    });
  } catch {
    // best-effort
  }
}

async function sapPostOrder(baseUrl: string, cookie: string, payload: unknown) {
  console.log("Payload enviado a SAP:", JSON.stringify(payload, null, 2));
  const res = await fetch(`${baseUrl}/Orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SAP POST Orders failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

async function sapGetDocNum(baseUrl: string, cookie: string, docEntry: number) {
  const res = await fetch(`${baseUrl}/Orders(${docEntry})?$select=DocNum`, {
    method: "GET",
    headers: { "Content-Type": "application/json", Cookie: cookie },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SAP GET DocNum failed: ${res.status} ${text}`);

  const data = JSON.parse(text);
  return data?.DocNum ?? null;
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
  if (expectedSecret) {
    const got = req.headers.get("x-webhook-secret");
    if (got !== expectedSecret) return new Response("Unauthorized", { status: 401 });
  }

  console.log("ENV_HAS_SAP_SL_BASE_URL", Boolean(Deno.env.get("SAP_SL_BASE_URL")));
  console.log("ENV_HAS_SAP_SL_COMPANYDB", Boolean(Deno.env.get("SAP_SL_COMPANYDB")));
  console.log("ENV_HAS_SAP_SL_USERNAME", Boolean(Deno.env.get("SAP_SL_USERNAME")));
  console.log("ENV_HAS_SAP_SL_PASSWORD", Boolean(Deno.env.get("SAP_SL_PASSWORD")));
  console.log("ENV_HAS_SUPABASE_URL", Boolean(Deno.env.get("SUPABASE_URL")));
  console.log("ENV_HAS_SUPABASE_SERVICE_ROLE_KEY", Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")));

  const supabaseUrl = mustEnv("SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const baseUrl = mustEnv("SAP_SL_BASE_URL");
  const companyDb = mustEnv("SAP_SL_COMPANYDB");
  const username = mustEnv("SAP_SL_USERNAME");
  const password = mustEnv("SAP_SL_PASSWORD");

  let orderId: string | null = null;
  let sapCookie: string | null = null;

  try {
    const body = (await req.json()) as WebhookPayload;

    orderId = body?.record?.id ?? null;
    const status = body?.record?.status ?? null;

    if (!orderId) return json({ ok: false, error: "Missing record.id" }, 400);

    if (status !== "pending") {
      return json({ ok: true, skipped: true, reason: `status=${status}` }, 200);
    }

    // 1) Lock lógico (evita doble ejecución)
    const { data: locked, error: lockErr } = await sb
      .from("sales_orders")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (lockErr) throw new Error(`Lock error: ${lockErr.message}`);
    if (!locked) return json({ ok: true, skipped: true, reason: "already locked / not pending" }, 200);

    // 2) Leer cabecera (incluye comments)
    const { data: order, error: orderErr } = await sb
      .from("sales_orders")
      .select("id, card_code, doc_due_date, zona, id_ruta, comments, sync_attempts")
      .eq("id", orderId)
      .single();

    if (orderErr) throw new Error(`Order read error: ${orderErr.message}`);

    // 3) Leer líneas
    const { data: lines, error: linesErr } = await sb
      .from("sales_order_lines")
      .select("item_code, quantity, warehouse_code, costing_code2")
      .eq("order_id", orderId);

    if (linesErr) throw new Error(`Lines read error: ${linesErr.message}`);
    if (!lines || lines.length === 0) throw new Error("Order has no lines");

    // 3.1) Dimensiones de contabilizacion para SAP
    const { data: customer, error: customerErr } = await sb
      .from("customers")
      .select("CardCode, CC_Canal")
      .eq("CardCode", order.card_code)
      .maybeSingle();

    if (customerErr) throw new Error(`Customer read error: ${customerErr.message}`);
    const costingCode3 = normalizeDimValue(customer?.CC_Canal);

    const itemCodes = Array.from(
      new Set(
        lines
          .map((l) => String(l?.item_code ?? "").trim())
          .filter(Boolean)
      )
    );
    const productMarcaByItem = new Map<string, string | null>();

    if (itemCodes.length > 0) {
      const { data: products, error: productsErr } = await sb
        .from("products")
        .select("ItemCode, CC_Marca")
        .in("ItemCode", itemCodes);

      if (productsErr) throw new Error(`Products read error: ${productsErr.message}`);

      for (const product of products || []) {
        const itemCode = String((product as { ItemCode?: unknown })?.ItemCode ?? "").trim();
        if (!itemCode) continue;
        const marca = normalizeDimValue((product as { CC_Marca?: unknown })?.CC_Marca);
        productMarcaByItem.set(itemCode, marca);
      }
    }

    // 4) Payload SAP
    const rutaMaybeNum = Number(order.id_ruta);
    const sapComments = normalizeSapComments(order.comments);

    const sapPayload = {
      CardCode: order.card_code,
      DocDueDate: order.doc_due_date,
      U_HCO_ZONA: order.zona,
      U_HCO_RUTA: Number.isFinite(rutaMaybeNum) ? rutaMaybeNum : order.id_ruta,
      Comments: sapComments || undefined, // <- Comentario a SAP
      DocumentLines: lines.map((l) => ({
        ItemCode: l.item_code,
        Quantity: Number(l.quantity),
        WarehouseCode: l.warehouse_code,
        CostingCode: "A302",
        CostingCode2: resolveCostingCode2ByWarehouse(l.warehouse_code),
        CostingCode3: costingCode3,
        CostingCode4: productMarcaByItem.get(String(l.item_code ?? "").trim()) ?? null,
      })),
    };

    // 5) Login + POST + DocNum
    sapCookie = await sapLogin(baseUrl, companyDb, username, password);
    const sapResp = await sapPostOrder(baseUrl, sapCookie, sapPayload);

    const docEntry: number | null = sapResp?.DocEntry ?? null;

    let docNum: number | null = sapResp?.DocNum ?? null;
    if (docEntry && !docNum) docNum = await sapGetDocNum(baseUrl, sapCookie, docEntry);

    // 6) Guardar éxito
    const { error: updErr } = await sb
      .from("sales_orders")
      .update({
        status: "sent",
        sap_docentry: docEntry,
        sap_docnum: docNum,
        sent_at: new Date().toISOString(),
        last_error: null,
        sap_response: sapResp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updErr) throw new Error(`Update sent error: ${updErr.message}`);

    return json({ ok: true, order_id: orderId, sap_docentry: docEntry, sap_docnum: docNum }, 200);
  } catch (e) {
    const msg = String((e as any)?.message ?? e);

    if (orderId) {
      try {
        const { data: cur } = await sb
          .from("sales_orders")
          .select("sync_attempts")
          .eq("id", orderId)
          .maybeSingle();

        const attempts = (cur?.sync_attempts ?? 0) + 1;

        await sb
          .from("sales_orders")
          .update({
            status: "error",
            last_error: msg,
            sync_attempts: attempts,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
      } catch {
        // ignore
      }
    }

    return json({ ok: false, error: msg, order_id: orderId }, 500);
  } finally {
    if (sapCookie) await sapLogout(baseUrl, sapCookie);
  }
});
