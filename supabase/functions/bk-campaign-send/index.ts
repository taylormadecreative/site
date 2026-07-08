// bk-campaign-send — sends a Taylormade Creative newsletter campaign via Resend.
// Auth: verify_jwt=true PLUS an internal staff check (profiles.role admin|employee).
// Modes: {campaign_id, mode:"test"} → one email to the caller;
//        {campaign_id, mode:"send"} → up to BATCH_CAP active subscribers per call,
//        logged per-recipient in bk_campaign_sends so re-runs resume, never duplicate.
// Every campaign email carries a per-subscriber unsubscribe link.
import { createClient } from "npm:@supabase/supabase-js@2";

const FROM = "Taylormade Creative <hello@taylormadecreative.net>";
const NELSON = "taylormademd@gmail.com";
const BATCH_CAP = 90; // stay under the Resend daily ceiling per run
const FN_BASE = "https://pgqdmnmessbbzyszjfvr.supabase.co/functions/v1";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// simple campaign markup: blank-line paragraphs, "## " headings, [label](url) links
function renderBody(md: string): string {
  return md.trim().split(/\n\s*\n/).map((block) => {
    const b = esc(block.trim());
    const linked = b.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      `<a href="$2" style="color:#b8871b;font-weight:bold;">$1</a>`);
    if (linked.startsWith("## ")) {
      return `<h2 style="margin:26px 0 10px;font-size:19px;color:#0a0a0c;">${linked.slice(3)}</h2>`;
    }
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#3a3a40;">${linked.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function shell(preheader: string, inner: string, unsubUrl: string | null): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f3ee;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
  <tr><td style="background:#0a0a0c;padding:26px 32px;">
    <span style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:17px;letter-spacing:2px;color:#ffffff;">TAYLORMADE<span style="color:#e9b949;">/</span>CREATIVE</span>
  </td></tr>
  <tr><td style="height:4px;background:#e9b949;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:36px 32px 40px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1e;">${inner}</td></tr>
  <tr><td style="background:#0a0a0c;padding:22px 32px;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0;font-size:12px;line-height:1.7;color:#8a8a92;">Taylormade Creative · Dallas–Fort Worth, TX<br>
    Photo · Video · AI Content · Web · Social · Workshops<br>
    ${unsubUrl ? `<a href="${unsubUrl}" style="color:#8a8a92;">Unsubscribe</a> · ` : ""}<a href="https://www.taylormadecreative.net/" style="color:#8a8a92;">taylormadecreative.net</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function sendResend(to: string, subject: string, html: string): Promise<string | null> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "RESEND_API_KEY not set";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: NELSON, subject, html }),
  });
  if (!r.ok) return `resend ${r.status}: ${(await r.text()).slice(0, 200)}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const db = admin();

  // staff gate: valid JWT (enforced by platform) + admin/employee role
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: prof } = await db.from("profiles")
    .select("role").eq("id", userData.user.id).maybeSingle();
  if (!prof || !["admin", "employee"].includes(prof.role)) {
    return json({ error: "staff_only" }, 403);
  }

  const { campaign_id, mode } = await req.json().catch(() => ({}));
  if (!campaign_id || !["test", "send"].includes(mode)) return json({ error: "bad_request" }, 400);

  const { data: camp } = await db.from("bk_campaigns").select("*").eq("id", campaign_id).maybeSingle();
  if (!camp) return json({ error: "not_found" }, 404);

  const inner = renderBody(camp.body);
  const pre = camp.preheader || camp.subject;

  if (mode === "test") {
    const to = userData.user.email ?? NELSON;
    const err = await sendResend(to, `[TEST] ${camp.subject}`, shell(pre, inner, null));
    return err ? json({ error: err }, 500) : json({ ok: true, test_sent_to: to });
  }

  if (camp.status === "sent") return json({ ok: true, status: "sent", remaining: 0 });

  // recipients = active subscribers who haven't received this campaign yet
  const { data: doneRows } = await db.from("bk_campaign_sends")
    .select("subscriber_id").eq("campaign_id", campaign_id);
  const done = new Set((doneRows ?? []).map((r) => r.subscriber_id));

  const { data: subs } = await db.from("bk_subscribers")
    .select("id, email, name, token")
    .is("unsubscribed_at", null)
    .order("created_at");
  const pending = (subs ?? []).filter((s) => !done.has(s.id));
  const total = (subs ?? []).length;

  await db.from("bk_campaigns").update({ status: "sending", total_count: total }).eq("id", campaign_id);

  let sent = 0;
  const errors: string[] = [];
  for (const s of pending.slice(0, BATCH_CAP)) {
    const unsub = `${FN_BASE}/bk-unsubscribe?tk=${s.token}`;
    const err = await sendResend(s.email, camp.subject, shell(pre, inner, unsub));
    if (err) { errors.push(`${s.email}: ${err}`); if (errors.length >= 3) break; continue; }
    await db.from("bk_campaign_sends").insert({ campaign_id, subscriber_id: s.id });
    sent++;
    await new Promise((r) => setTimeout(r, 600)); // respect Resend rate limits
  }

  const remaining = pending.length - sent;
  const finished = remaining <= 0 && errors.length === 0;
  await db.from("bk_campaigns").update({
    sent_count: done.size + sent,
    ...(finished ? { status: "sent", sent_at: new Date().toISOString() } : {}),
  }).eq("id", campaign_id);

  return json({ ok: true, sent_now: sent, remaining, finished, errors });
});
