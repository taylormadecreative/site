// Shared backend config — same Supabase project as book.taylormadecreative.net
window.TM = {
  SUPABASE_URL: "https://pgqdmnmessbbzyszjfvr.supabase.co",
  SUPABASE_KEY: "sb_publishable_fyYqa9QkEeA5LD_0hYLTTA_F8Gxw1oz",
  FUNCTIONS_BASE: "https://pgqdmnmessbbzyszjfvr.supabase.co/functions/v1",
  PORTAL_BASE: "https://book.taylormadecreative.net",
};

// Minimal RPC helper (PostgREST)
window.TM.rpc = async function rpc(fn, args) {
  const res = await fetch(`${window.TM.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.TM.SUPABASE_KEY,
      Authorization: `Bearer ${window.TM.SUPABASE_KEY}`,
    },
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) {
    let msg = "request_failed";
    try { msg = (await res.json()).message || msg; } catch (_) { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
};
