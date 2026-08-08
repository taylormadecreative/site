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
    // debug mode: report what Stripe actually has for this code, no writes
    const body = await req.json().catch(() => ({}));
    if (body?.variants) {
      const cA = await stripe.coupons.create({ percent_off: 20, duration: "forever", name: "probe A" });
      const pA = await stripe.promotionCodes.create({ coupon: cA.id, code: "J3TRYA" });
      const cB = await stripe.coupons.create({ amount_off: 2000, currency: "usd", duration: "forever", name: "probe B" });
      const pB = await stripe.promotionCodes.create({ coupon: cB.id, code: "J3TRYB" });
      const s2 = await stripe.checkout.sessions.create({
        mode: "payment",
        allow_promotion_codes: true,
        payment_method_types: ["card"],
        line_items: [{ price_data: { currency: "usd", product_data: { name: "Digitals Session · probe2" }, unit_amount: 10000 }, quantity: 1 }],
        success_url: "https://www.taylormadecreative.net/success/",
        cancel_url: "https://www.taylormadecreative.net/digitals/",
      });
      return Response.json({ a: pA.id, b: pB.id, card_only_url: s2.url });
    }
    if (body?.try_entry) {
      // minimal session WITH the entry field, to isolate entry-time validation
      const s = await stripe.checkout.sessions.create({
        mode: "payment",
        allow_promotion_codes: true,
        customer_email: "taylormademd+j3probe@gmail.com",
        line_items: [{ price_data: { currency: "usd", product_data: { name: "Digitals Session · probe" }, unit_amount: 10000 }, quantity: 1 }],
        success_url: "https://www.taylormadecreative.net/success/",
        cancel_url: "https://www.taylormadecreative.net/digitals/",
      });
      return Response.json({ url: s.url, id: s.id });
    }
    if (body?.make_code) {
      const p = await stripe.promotionCodes.create({ coupon: "LQ62Ywk8", code: body.make_code });
      return Response.json({ id: p.id, code: p.code, active: p.active });
    }
    if (body?.deactivate) {
      const p = await stripe.promotionCodes.update(body.deactivate, { active: false });
      return Response.json({ id: p.id, active: p.active });
    }
    if (body?.try_discount) {
      // definitive applicability test: ask Stripe to mint a session with the
      // promotion code pre-applied — its error message names the real blocker
      try {
        const s = await stripe.checkout.sessions.create({
          mode: "payment",
          discounts: [{ promotion_code: body.try_discount }],
          line_items: [{ price_data: { currency: "usd", product_data: { name: "Digitals Session · probe" }, unit_amount: 10000 }, quantity: 1 }],
          success_url: "https://www.taylormadecreative.net/success/",
          cancel_url: "https://www.taylormadecreative.net/digitals/",
        });
        await stripe.checkout.sessions.expire(s.id);
        return Response.json({ ok: true, amount_total: s.amount_total, discount: s.total_details?.amount_discount });
      } catch (e) {
        return Response.json({ ok: false, stripe_error: String((e as Error)?.message ?? e) });
      }
    }
    if (body?.inspect) {
      const all = await stripe.promotionCodes.list({ code: SALE_CODE, limit: 10 });
      return Response.json({
        now_epoch: Math.floor(Date.now() / 1000),
        codes: all.data.map((p) => ({
          id: p.id, code: p.code, active: p.active, livemode: p.livemode,
          expires_at: p.expires_at, max_redemptions: p.max_redemptions,
          times_redeemed: p.times_redeemed, restrictions: p.restrictions,
          coupon: { id: p.coupon.id, valid: p.coupon.valid, amount_off: p.coupon.amount_off,
            currency: p.coupon.currency, duration: p.coupon.duration, livemode: p.coupon.livemode },
        })),
      });
    }

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
