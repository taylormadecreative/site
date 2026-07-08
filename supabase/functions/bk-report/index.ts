// bk-report — Nelson's weekly money + growth digest, emailed every Monday morning
// by pg_cron. Auth: x-mailer-secret header (same gate as bk-mailer).
import { createClient } from "npm:@supabase/supabase-js@2";

const FROM = "Taylormade Creative <hello@taylormadecreative.net>";
const NELSON = "taylormademd@gmail.com";
const TZ = "America/Chicago";

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const money = (c: number) => "$" + (c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0, minimumFractionDigits: c % 100 ? 2 : 0 });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDT = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const sb = db();
  const { data: cfg } = await sb.from("bk_config").select("value").eq("key", "mailer_secret").maybeSingle();
  if (!cfg?.value || req.headers.get("x-mailer-secret") !== cfg.value) return json({ error: "unauthorized" }, 401);

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: paid }, { data: outstanding }, { data: upcoming }] = await Promise.all([
    sb.from("bk_invoices").select("title, amount_cents, paid_at, bk_projects(client_name)")
      .eq("status", "paid").gte("paid_at", weekAgo).order("paid_at", { ascending: false }),
    sb.from("bk_invoices").select("amount_cents").eq("status", "sent"),
    sb.from("bk_bookings").select("starts_at, bk_projects(client_name), bk_services(name)")
      .eq("status", "confirmed").gte("starts_at", new Date().toISOString())
      .lte("starts_at", new Date(Date.now() + 7 * 86400000).toISOString())
      .order("starts_at"),
  ]);

  const collected = (paid ?? []).reduce((n, i) => n + i.amount_cents, 0);
  const owed = (outstanding ?? []).reduce((n, i) => n + i.amount_cents, 0);

  const [staleUnpaid, unanswered, subsCount] = await Promise.all([
    sb.from("bk_invoices").select("id", { count: "exact", head: true })
      .eq("status", "sent").lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .then((r) => r.count ?? 0),
    sb.from("bk_projects").select("id", { count: "exact", head: true })
      .eq("status", "new").lt("created_at", new Date(Date.now() - 86400000).toISOString())
      .then((r) => r.count ?? 0),
    sb.from("bk_subscribers").select("id", { count: "exact", head: true })
      .is("unsubscribed_at", null).then((r) => r.count ?? 0),
  ]);

  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;font-size:12px;letter-spacing:1px;color:#8a8a92;text-transform:uppercase;width:170px;">${k}</td>
     <td style="padding:7px 0;font-size:15px;color:#0a0a0c;font-weight:bold;">${v}</td></tr>`;

  const paidLines = (paid ?? []).slice(0, 8).map((i) =>
    `<li style="margin:4px 0;">${money(i.amount_cents)} — ${esc(i.title)} (${esc((i.bk_projects as { client_name?: string } | null)?.client_name ?? "")})</li>`).join("");
  const upcomingLines = (upcoming ?? []).map((b) =>
    `<li style="margin:4px 0;">${fmtDT(b.starts_at)} CT — ${esc((b.bk_services as { name?: string } | null)?.name ?? "Session")} · ${esc((b.bk_projects as { client_name?: string } | null)?.client_name ?? "")}</li>`).join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f3ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0a0a0c;padding:26px 32px;"><span style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:17px;letter-spacing:2px;color:#ffffff;">TAYLORMADE<span style="color:#e9b949;">/</span>GROWTH</span></td></tr>
<tr><td style="height:4px;background:#e9b949;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:36px 32px 40px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1e;">
<h1 style="margin:0 0 14px;font-size:24px;color:#0a0a0c;">Your week in numbers</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;border-left:4px solid #e9b949;border-radius:8px;margin:6px 0 20px;"><tr><td style="padding:16px 20px;"><table role="presentation" width="100%">
${row("Collected (7 days)", money(collected))}
${row("Outstanding invoices", `${money(owed)} across ${(outstanding ?? []).length}`)}
${row("Shoots this week", String((upcoming ?? []).length))}
${row("Newsletter list", `${subsCount} subscribers`)}
</table></td></tr></table>
${paidLines ? `<p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;color:#8a8a92;">PAYMENTS THAT CLEARED</p><ul style="margin:0 0 18px;padding-left:20px;font-size:14.5px;color:#3a3a40;">${paidLines}</ul>` : `<p style="font-size:14.5px;color:#3a3a40;">No payments cleared this week.</p>`}
${upcomingLines ? `<p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;color:#8a8a92;">THIS WEEK'S SHOOTS</p><ul style="margin:0 0 18px;padding-left:20px;font-size:14.5px;color:#3a3a40;">${upcomingLines}</ul>` : ""}
${(staleUnpaid + unanswered) > 0 ? `<p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;color:#8a8a92;">MONEY ON THE TABLE</p><ul style="margin:0 0 18px;padding-left:20px;font-size:14.5px;color:#3a3a40;">
${staleUnpaid ? `<li>${staleUnpaid} invoice${staleUnpaid > 1 ? "s" : ""} unpaid for 7+ days — worth a friendly follow-up</li>` : ""}
${unanswered ? `<li>${unanswered} inquir${unanswered > 1 ? "ies" : "y"} past the one-business-day promise</li>` : ""}
</ul>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#0a0a0c;border-radius:10px;"><a href="https://book.taylormadecreative.net/growth.html" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.5px;color:#e9b949;text-decoration:none;">OPEN THE GROWTH DASHBOARD</a></td></tr></table>
</td></tr>
<tr><td style="background:#0a0a0c;padding:22px 32px;"><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#8a8a92;">Automated Monday digest · Taylormade Creative</p></td></tr>
</table></td></tr></table></body></html>`;

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "resend_not_configured" }, 500);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [NELSON], subject: `📈 Week in numbers — ${money(collected)} collected, ${(upcoming ?? []).length} shoots ahead`, html,
    }),
  });
  if (!r.ok) return json({ error: `resend ${r.status}` }, 500);
  return json({ ok: true, collected, outstanding: owed, upcoming: (upcoming ?? []).length });
});
