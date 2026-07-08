// bk-unsubscribe — one-click unsubscribe for Taylormade Creative newsletters.
// GET/POST ?tk=<subscriber token>. verify_jwt=false: the token IS the auth.
import { createClient } from "npm:@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, msg: string): Response {
  return new Response(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#08080a;color:#f5f2ea;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px;">
<div><p style="font-weight:800;letter-spacing:2px;font-size:15px;">TAYLORMADE<span style="color:#e9b949;">/</span>CREATIVE</p>
<h1 style="font-size:26px;margin:18px 0 10px;">${title}</h1>
<p style="color:#99948a;max-width:44ch;line-height:1.7;">${msg}</p>
<p style="margin-top:26px;"><a href="https://www.taylormadecreative.net/" style="color:#e9b949;">taylormadecreative.net</a></p></div>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  const tk = new URL(req.url).searchParams.get("tk") ?? "";
  if (!UUID.test(tk)) return page("Hmm, that link looks off", "This unsubscribe link is incomplete. Use the link at the bottom of any newsletter, or just reply to one and I'll take care of it.");

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data } = await db.from("bk_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("token", tk).select("email").maybeSingle();

  if (!data) return page("Already taken care of", "That link doesn't match an active subscription — you won't get any more newsletters.");
  return page("You're unsubscribed", "No more newsletters — no hard feelings. If you ever need photo, video, or creative work, the studio door is always open.");
});
