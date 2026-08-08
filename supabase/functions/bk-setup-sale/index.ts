// bk-setup-sale — ONE-SHOT admin helper (2026-08-07). Creates the Stripe coupon
// + promotion code for the 24h J3 Productions birthday sale ($20 off headshots
// and digitals, code J3PRODUCTIONS, hard-expires 2026-08-08 7:00pm CT).
//
// Exists because STRIPE_SECRET_KEY lives only in Supabase function env (same
// reason bk-setup-webhook existed). Guarded by bk_config.mailer_secret via the
// x-setup-secret header. Idempotent: re-running returns the existing code.
// DELETE THIS DEPLOYMENT after the code is created (supabase functions delete).
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const SALE_CODE = "J3PRODUCTIONS";
const SALE_END_EPOCH = 1786233600; // 2026-08-08 7:00pm CDT

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: cfg } = await sb
    .from("bk_config").select("value").eq("key", "mailer_secret").maybeSingle();
  const guard = (cfg?.value as string | undefined) ?? "";
  if (!guard || req.headers.get("x-setup-secret") !== guard) {
    return new Response("forbidden", { status: 403 });
  }

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return new Response("no stripe key", { status: 503 });
  const stripe = new Stripe(key);

  try {
    const existing = await stripe.promotionCodes.list({ code: SALE_CODE, active: true, limit: 1 });
    if (existing.data.length > 0) {
      const pc = existing.data[0];
      return Response.json({ reused: true, promotion_code: pc.id, coupon: pc.coupon.id, code: pc.code, expires_at: pc.expires_at });
    }

    const coupon = await stripe.coupons.create({
      amount_off: 2000,
      currency: "usd",
      duration: "once",
      name: "J3 Productions Birthday — $20 off",
    });
    const promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: SALE_CODE,
      expires_at: SALE_END_EPOCH,
    });
    return Response.json({ created: true, promotion_code: promo.id, coupon: coupon.id, code: promo.code, expires_at: promo.expires_at });
  } catch (e) {
    console.error(e);
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
});
