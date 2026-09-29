// bk-push — sends a Web Push to every staff device for one inbox event.
// Called by pg_net from the bk_inbox_notify trigger (x-push-secret), never by browsers.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildPush, type PushEvent } from "../_shared/inbox/push_message.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  const { data: cfg } = await db.from("bk_config").select("value").eq("key", "inbox_push_secret").maybeSingle();
  if (!cfg?.value || req.headers.get("x-push-secret") !== cfg.value) return json({ error: "unauthorized" }, 401);

  let body: { source?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  let ev: Omit<PushEvent, "project">;
  if (body.source === "alert") {
    const { data: q } = await db.from("bk_email_queue").select("payload, project_id").eq("id", body.id).maybeSingle();
    if (!q) return json({ error: "not_found" }, 404);
    const pl = (q.payload ?? {}) as Record<string, unknown>;
    ev = { source: "alert", type: String(pl.type ?? "event"), payload: pl, projectId: q.project_id };
  } else if (body.source === "message") {
    const { data: m } = await db.from("bk_messages").select("body, project_id").eq("id", body.id).maybeSingle();
    if (!m) return json({ error: "not_found" }, 404);
    ev = { source: "message", type: "message", payload: { body: m.body }, projectId: m.project_id };
  } else if (body.source === "test") {
    ev = { source: "test", type: "test", payload: {}, projectId: null };
  } else {
    return json({ error: "bad_source" }, 400);
  }

  let project: PushEvent["project"] = null;
  if (ev.projectId) {
    const { data } = await db.from("bk_projects").select("client_name, title, service, event_date")
      .eq("id", ev.projectId).maybeSingle();
    project = data as PushEvent["project"];
  }
  const msg = buildPush({ ...ev, project });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json({ error: "vapid_not_configured" }, 500);
  webpush.setVapidDetails("mailto:hello@taylormadecreative.net", pub, priv);

  const { data: subs } = await db.from("bk_push_subscriptions").select("id, endpoint, p256dh, auth");
  let sent = 0, removed = 0, failed = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { TTL: 86400, urgency: "high" },
      );
      sent++;
      await db.from("bk_push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.from("bk_push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        failed++;
        console.error("push failed", code, String((e as Error).message ?? e).slice(0, 200));
      }
    }
  }
  return json({ sent, removed, failed });
});
