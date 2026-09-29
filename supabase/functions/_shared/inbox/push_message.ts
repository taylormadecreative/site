// Builds the phone notification for one inbox event. Pure — tested in push_message_test.ts.
export type PushProject = { client_name: string; title: string | null; service: string; event_date: string | null };
export type PushEvent = {
  source: "alert" | "message" | "test";
  type: string;
  payload: Record<string, unknown>;
  projectId: string | null;
  project: PushProject | null;
};
export type PushMessage = { title: string; body: string; url: string; tag: string };

const SERVICE: Record<string, string> = {
  music_video: "Music Video", brand_content: "Brand Content", photography: "Photography", event: "Event", other: "Project",
};

function money(c: unknown): string {
  if (typeof c !== "number") return "";
  return "$" + (c % 100 ? (c / 100).toFixed(2) : String(c / 100));
}
function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
function dayLabel(d: string | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
    .format(new Date(d + "T12:00:00Z"));
}

export function buildPush(e: PushEvent): PushMessage {
  const p = e.project;
  const name = clip(p?.client_name || String(e.payload.client_name ?? "") || "Someone", 40);
  const titlePart = p?.title?.includes(" — ") ? p.title.split(" — ").slice(1).join(" — ") : "";
  const what = titlePart || SERVICE[p?.service ?? ""] || String(e.payload.service_name ?? "Project");
  const url = e.projectId ? `/inbox/?p=${e.projectId}` : "/inbox/";
  const tag = e.projectId ?? "inbox";
  const out = (title: string, body: string): PushMessage => ({ title, body: clip(body, 140), url, tag });

  if (e.source === "test") return out("✅ Inbox alerts are on", "You'll feel a buzz like this for every booking and inquiry.");
  if (e.source === "message") return out(`💬 ${name}`, String(e.payload.body ?? ""));
  switch (e.type) {
    case "inquiry": {
      const day = dayLabel(p?.event_date ?? null);
      return out(`📥 New inquiry · ${name}`, day ? `${what} · wants ${day}` : what);
    }
    case "payment": {
      const amt = money(e.payload.amount_cents);
      return out(amt ? `💰 Paid ${amt} · ${name}` : `💰 Payment · ${name}`, what);
    }
    case "contract_signed": return out(`✍️ Contract signed · ${name}`, what);
    case "balance_failed":
    case "balance_attention":
      return out(`⚠️ Balance not collected · ${name}`, `${money(e.payload.amount_cents)} · ${String(e.payload.reason ?? "")}`);
    case "payment_unreconciled":
    case "payment_orphan":
      return out(`🚨 Paid but not booked · ${name}`, "Open the admin dashboard and fix this one first.");
    case "payment_stuck": return out(`⚠️ Hold expired unpaid · ${name}`, String(e.payload.service_name ?? what));
    default: return out(`Taylormade · ${name}`, what);
  }
}
