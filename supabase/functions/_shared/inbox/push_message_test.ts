import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildPush } from "./push_message.ts";

const proj = { client_name: "Jasmine Reed", title: "Jasmine Reed — Brand Content", service: "brand_content", event_date: "2026-10-12" };

Deno.test("inquiry names the person, the service and the date they want", () => {
  const m = buildPush({ source: "alert", type: "inquiry", payload: { service: "brand_content" }, projectId: "p1", project: proj });
  assertEquals(m.title, "📥 New inquiry · Jasmine Reed");
  assertEquals(m.body, "Brand Content · wants Oct 12");
  assertEquals(m.url, "/inbox/?p=p1");
  assertEquals(m.tag, "p1");
});

Deno.test("payment shows the amount", () => {
  const m = buildPush({ source: "alert", type: "payment", payload: { amount_cents: 17500 }, projectId: "p2",
    project: { ...proj, title: "Marcus T — Headshots", client_name: "Marcus T", event_date: null } });
  assertEquals(m.title, "💰 Paid $175 · Marcus T");
  assertEquals(m.body, "Headshots");
});

Deno.test("client message is clipped to 140 chars", () => {
  const long = "a".repeat(300);
  const m = buildPush({ source: "message", type: "message", payload: { body: long }, projectId: "p3", project: proj });
  assertEquals(m.title, "💬 Jasmine Reed");
  assertEquals(m.body.length, 140);
  assert(m.body.endsWith("…"));
});

Deno.test("no project falls back to payload name and the inbox root", () => {
  const m = buildPush({ source: "alert", type: "payment_orphan", payload: { client_name: "Dee" }, projectId: null, project: null });
  assertEquals(m.title, "🚨 Paid but not booked · Dee");
  assertEquals(m.url, "/inbox/");
  assertEquals(m.tag, "inbox");
});

Deno.test("test ping", () => {
  const m = buildPush({ source: "test", type: "test", payload: {}, projectId: null, project: null });
  assertEquals(m.title, "✅ Inbox alerts are on");
});

Deno.test("markup in a name stays plain text (notifications do not render HTML)", () => {
  const m = buildPush({ source: "alert", type: "inquiry", payload: {}, projectId: "p4",
    project: { client_name: "<img src=x onerror=1>", title: null, service: "other", event_date: null } });
  assertEquals(m.title, "📥 New inquiry · <img src=x onerror=1>");
  assertEquals(m.body, "Project");
});
