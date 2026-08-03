// bk-stripe-webhook — marks booking invoices paid when Stripe Checkout settles.
// Authenticated by Stripe webhook signature, not JWT. The signing secret is
// read from STRIPE_WEBHOOK_SECRET (env) when set, otherwise from bk_config
// (key='stripe_webhook_secret_bk'), which bk-setup-webhook provisions when it
// creates the endpoint. Also pings bk-mailer after a successful payment so the
// booking confirmation email goes out immediately instead of on the next cron.
// DB triggers (bk_invoice_paid → bk_booking_confirmed_*) do the state changes
// and queue the client emails; this function only marks the invoice paid.
//
// v8 (2026-07-27) — no more silent money. Two paths used to return HTTP 200
// while quietly dropping a real payment on the floor:
//   1. a paid session carrying no metadata.invoice_id was acked and forgotten;
//   2. the "mark paid" update was guarded on status='sent' with no row-count
//      check, so a payment against a void/draft invoice matched zero rows,
//      reported no error, and disappeared.
// Both now queue a nelson_alert through bk_email_queue. Stripe still gets a 200
// (retrying cannot fix either condition) but a human is told within one cron
// tick. Note this hardens the CONSEQUENCES of a missed payment; it does not fix
// webhook DELIVERY, which is a Stripe-dashboard-side configuration question.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getConfig(db: ReturnType<typeof sb>, key: string): Promise<string> {
  const { data } = await db.from("bk_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? "";
}

/* Money arrived but we could not attach it to a booking. This is the failure
   class that cost us Jashawn's session on 2026-07-16: silent, invisible, and
   only discovered because the client sent a DM. Never swallow it again —
   queue a Nelson alert so a human finds out within the cron tick. */
async function alertUnreconciled(
  db: ReturnType<typeof sb>,
  subject: string,
  session: Stripe.Checkout.Session,
  detail: string,
) {
  console.error(`UNRECONCILED PAYMENT — ${subject}: ${detail} (session ${session.id})`);
  try {
    const { error: qErr } = await db.from("bk_email_queue").insert({
      kind: "nelson_alert",
      payload: {
        type: "payment_unreconciled",
        subject,
        detail,
        session_id: session.id,
        payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null,
        amount_cents: session.amount_total,
        customer_email: session.customer_details?.email ?? session.customer_email ?? null,
        invoice_id: session.metadata?.invoice_id ?? null,
      },
    });
    // supabase-js RESOLVES on a failed insert — it returns { error }, it does not
    // throw. Without this check the try/catch would let the alert vanish silently
    // in exactly the crisis it exists to report.
    if (qErr) console.error(`ALERT QUEUE INSERT FAILED (${qErr.code ?? "?"}): ${qErr.message}`);
  } catch (e) {
    // the alert is best-effort; the console.error above is the backstop
    console.error("failed to queue unreconciled-payment alert", e);
  }
}

async function markPaid(session: Stripe.Checkout.Session): Promise<boolean> {
  const invoiceId = session.metadata?.invoice_id;
  const projectId = session.metadata?.project_id;
  const db = sb();

  if (!invoiceId) {
    // A paid session with no invoice_id cannot be matched to anything. Returning
    // 200 silently (the old behaviour) means the money vanishes with no record.
    // Ack so Stripe stops retrying an event we can never satisfy, but shout.
    await alertUnreconciled(db, "Stripe session has no invoice_id", session,
      "A payment completed with no invoice_id in its metadata, so it could not be matched to a booking. If this came from a Payment Link or a dashboard invoice, reconcile it by hand.");
    return true;
  }

  const { data: inv, error: readErr } = await db
    .from("bk_invoices")
    .select("id, kind, status, amount_cents")
    .eq("id", invoiceId)
    .single();

  if (readErr) {
    // PGRST116 = "no rows". A genuinely missing invoice will never appear, so
    // retrying just burns Stripe's retry budget and can auto-disable the whole
    // endpoint after repeated failures. Anything else may be transient — retry.
    const missing = readErr.code === "PGRST116";
    console.error(`invoice read failed (${readErr.code ?? "?"}): ${readErr.message ?? readErr}`);
    if (!missing) return false;
    await alertUnreconciled(db, "Paid invoice does not exist", session,
      `Stripe collected money against invoice ${invoiceId}, but no such row exists in bk_invoices. Reconcile by hand.`);
    return true;
  }
  if (!inv) {
    await alertUnreconciled(db, "Paid invoice does not exist", session,
      `Stripe collected money against invoice ${invoiceId}, but no such row exists in bk_invoices. Reconcile by hand.`);
    return true;
  }
  if (inv.status === "paid") return true; // idempotent

  if (session.amount_total != null && session.amount_total !== inv.amount_cents) {
    // Retrying can never reconcile a figure that will not change. The old
    // `return false` meant Stripe retried for ~3 days, nobody was told, and
    // repeated failures can get the endpoint auto-disabled — taking down
    // reconciliation for every OTHER booking too.
    await alertUnreconciled(db, "Amount mismatch — payment NOT applied", session,
      `Stripe collected ${(session.amount_total / 100).toFixed(2)} but invoice ${invoiceId} is for ${(inv.amount_cents / 100).toFixed(2)}. The invoice was left unpaid on purpose. Check for a price change mid-checkout, then reconcile by hand.`);
    return true;
  }

  // .select() so we can tell "updated" from "matched nothing". Without it a
  // payment against a void/draft/cancelled invoice updates zero rows, reports
  // no error, and is lost forever.
  const { data: updated, error: updErr } = await db
    .from("bk_invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_note: "Paid via Stripe Checkout" })
    .eq("id", invoiceId)
    .eq("status", "sent")
    .select("id");
  if (updErr) return false;

  if (!updated || updated.length === 0) {
    // The invoice exists but was not in 'sent' state (it was read as
    // '${inv.status}' a moment ago). Retrying will never fix that, so ack and alert.
    await alertUnreconciled(db, `Paid invoice was '${inv.status}', not 'sent'`, session,
      `Stripe collected ${session.amount_total != null ? "$" + (session.amount_total / 100).toFixed(2) : "a payment"} for invoice ${invoiceId}, but that invoice is '${inv.status}' so it was not marked paid. Reconcile it by hand.`);
    return true;
  }

  // a settled deposit (or digitals full payment) moves the project into "booked"
  if ((inv.kind === "deposit" || inv.kind === "full") && projectId) {
    await db
      .from("bk_projects")
      .update({ status: "booked" })
      .eq("id", projectId)
      .in("status", ["new", "quoted"]);
  }

  // fire-and-forget: drain the queue now so the confirmation lands immediately
  try {
    const secret = await getConfig(db, "mailer_secret");
    if (secret) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bk-mailer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-mailer-secret": secret },
        body: "{}",
      }).catch(() => {});
    }
  } catch (_) { /* cron will pick it up */ }

  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return new Response("not configured", { status: 503 });

  const db = sb();
  // ROOT CAUSE OF THE 2026-07-08..19 OUTAGE, kept documented so it cannot repeat:
  // a STRIPE_WEBHOOK_SECRET env var set 2026-07-02 — six days BEFORE bk-setup-webhook
  // created the current endpoint — silently shadowed the correct value in bk_config,
  // so every single delivery failed signature verification with a 400 and no payment
  // was ever reconciled. Nothing surfaced it because the env var is invisible from
  // the database side. Deleting the env var fixed it (2026-07-30).
  // env still wins (deploy-time override is a legitimate escape hatch), but a
  // DISAGREEMENT between the two is now loud instead of silent.
  const envSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const cfgSecret = await getConfig(db, "stripe_webhook_secret_bk");
  if (envSecret && cfgSecret && envSecret !== cfgSecret) {
    console.error(
      "WEBHOOK SECRET CONFLICT — STRIPE_WEBHOOK_SECRET (env) does not match " +
      "bk_config.stripe_webhook_secret_bk. env is winning. If deliveries are failing " +
      "with 'invalid signature', the env var is almost certainly stale: delete it and " +
      "let bk_config (which bk-setup-webhook keeps in sync) be the source of truth.",
    );
  }
  const whSecret = envSecret || cfgSecret;
  if (!whSecret) return new Response("not configured", { status: 503 });

  const stripe = new Stripe(key);
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      whSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    // A signing-secret mismatch is the prime suspect for "the webhook has never
    // reconciled once" — and it is invisible from the database side, because a
    // rejected event never reaches any table. Log it loudly so it shows up in
    // the edge-function logs the moment someone looks.
    console.error("SIGNATURE VERIFICATION FAILED — every payment is being rejected at the door. " +
      "Check that the signing secret in Stripe matches STRIPE_WEBHOOK_SECRET / bk_config.stripe_webhook_secret_bk.", e);
    return new Response("invalid signature", { status: 400 });
  }

  let ok = true;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // async methods (ACH etc.) complete the session before funds settle —
    // only mark paid when Stripe says the payment itself is settled
    if (session.payment_status === "paid") ok = await markPaid(session);
  } else if (event.type === "checkout.session.async_payment_succeeded") {
    ok = await markPaid(event.data.object as Stripe.Checkout.Session);
  } else if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;
    if (invoiceId) {
      await db
        .from("bk_invoices")
        .update({ payment_note: "Payment attempt failed (async method) — ask client to retry" })
        .eq("id", invoiceId)
        .eq("status", "sent");
    }
  }

  if (!ok) return new Response("retry", { status: 500 }); // Stripe retries
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
