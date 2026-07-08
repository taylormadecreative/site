// bk-setup-webhook — DISABLED.
// One-time webhook provisioning completed on 2026-07-08 (endpoint
// we_1Tr3wQA2eIGiS0WsfxXjPGwa, signing secret in bk_config). Retired as a 410
// tombstone because the MCP has no delete-function tool (same convention as
// ea-setup-webhook).
Deno.serve(() =>
  new Response(
    JSON.stringify({ error: "gone", detail: "bk-setup-webhook is permanently disabled" }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
