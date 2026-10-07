// Builds the phone notification for one inbox event. Pure — tested in push_message_test.ts.
export type PushProject = { client_name: string; title: string | null; service: string; event_date: string | null };
export type PushEvent = {
  source: "alert" | "message" | "test" | "outreach";
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

function outreachPush(e: PushEvent): PushMessage {
  const org = clip(String(e.payload.org ?? "") || "A prospect", 40);
  const id = typeof e.payload.pitch_id === "string" ? e.payload.pitch_id : "";
  const url = id ? `/inbox/?pitch=${id}` : "/inbox/?view=pitches";
  const tag = id ? `pitch-${id}` : "outreach";
  const o = (title: string, body: string, u = url, t = tag): PushMessage => ({ title, body: clip(body, 140), url: u, tag: t });
  // the start of their own words (the Mac strips quotes and our footer); older events have none
  const snippet = typeof e.payload.snippet === "string" ? e.payload.snippet.trim() : "";
  switch (e.type) {
    case "batch_ready": {
      const n = Number(e.payload.count ?? 0);
      return o(`🎯 ${n} pitch${n === 1 ? "" : "es"} ready`, "Read and approve when you have ten minutes.", "/inbox/?view=pitches", "outreach-batch");
    }
    case "edited_ready": return o(`✏️ Edited pitch ready · ${org}`, "Read it again, then approve.");
    case "dm_ready": return o(`📲 Page is live · DM ${org}`, "Copy the DM and send it from Instagram.");
    case "reply": return o(`💬 ${org} replied`, snippet || "Follow-ups stopped. Open it to read their reply in Gmail.");
    case "opt_out": return o(`🚫 ${org} said no thanks`, snippet || "Added to do-not-contact. Follow-ups stopped.");
    case "bounce": return o(`↩️ Email bounced · ${org}`, "Follow-ups stopped. That address doesn't work.");
    case "held": return o(`⚠️ Pitch held · ${org}`, String(e.payload.reason ?? "") || "Open it to see why.");
    case "error": {
      // one tag per failure type, so a publish alert never replaces a Gmail alert on the lock screen
      const kind = String(e.payload.type ?? "").replace(/[^a-z0-9_-]/gi, "") || "other";
      return o("⚠️ Pitch sending paused", String(e.payload.message ?? "") || "Open Pitches to see why.", "/inbox/?view=pitches", `outreach-error-${kind}`);
    }
    default: return o(`Taylormade · ${org}`, "Pitch update");
  }
}

export function buildPush(e: PushEvent): PushMessage {
  if (e.source === "outreach") return outreachPush(e);
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
