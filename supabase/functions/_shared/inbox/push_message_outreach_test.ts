import { assertEquals, assertStringIncludes, assert } from "jsr:@std/assert@1";
import { buildPush } from "./push_message.ts";

const ev = (type: string, payload: Record<string, unknown>) =>
  buildPush({ source: "outreach", type, payload, projectId: null, project: null });

Deno.test("batch_ready opens the Pitches list and counts", () => {
  const m = ev("batch_ready", { count: 6 });
  assertEquals(m.title, "🎯 6 pitches ready");
  assertEquals(m.url, "/inbox/?view=pitches");
  assertEquals(m.tag, "outreach-batch");
  assertEquals(ev("batch_ready", { count: 1 }).title, "🎯 1 pitch ready");
});

Deno.test("a reply opens that pitch", () => {
  const m = ev("reply", { org: "Layer & Loaf Bakery", pitch_id: "abc" });
  assertEquals(m.title, "💬 Layer & Loaf Bakery replied");
  assertEquals(m.url, "/inbox/?pitch=abc");
  assertEquals(m.tag, "pitch-abc");
});

Deno.test("held shows the reason, error opens the list", () => {
  assertStringIncludes(ev("held", { org: "X", pitch_id: "p", reason: "changed after you approved it" }).body, "changed after");
  const e = ev("error", { message: "Gmail rejected the app password." });
  assertEquals(e.url, "/inbox/?view=pitches");
  assertStringIncludes(e.body, "app password");
});

Deno.test("long org names are clipped and nothing is undefined", () => {
  const m = ev("dm_ready", { org: "A".repeat(80), pitch_id: "p" });
  assert(m.title.length < 70);
  for (const k of ["batch_ready", "edited_ready", "dm_ready", "reply", "opt_out", "bounce", "held", "error", "weird"]) {
    const x = ev(k, { pitch_id: "p" });
    assert(!/undefined|null/.test(x.title + x.body), k);
  }
});

Deno.test("a reply or opt-out shows the start of their words when the Mac sent a snippet", () => {
  assertEquals(ev("reply", { org: "X", pitch_id: "p", snippet: "Love this, can we talk Thursday?" }).body, "Love this, can we talk Thursday?");
  assertEquals(ev("opt_out", { org: "X", pitch_id: "p", snippet: "No thanks." }).body, "No thanks.");
  assertStringIncludes(ev("reply", { org: "X", pitch_id: "p" }).body, "Follow-ups stopped");
  assertStringIncludes(ev("opt_out", { org: "X", pitch_id: "p", snippet: "  " }).body, "do-not-contact");
  assert(ev("reply", { org: "X", pitch_id: "p", snippet: "word ".repeat(60) }).body.length <= 140);
});

Deno.test("each failure type gets its own error tag, so one alert never replaces another", () => {
  assertEquals(ev("error", { type: "gmail_auth", message: "m" }).tag, "outreach-error-gmail_auth");
  assertEquals(ev("error", { type: "publish", message: "m" }).tag, "outreach-error-publish");
  assertEquals(ev("error", { message: "m" }).tag, "outreach-error-other");
});
