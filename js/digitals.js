/* TAYLORMADE/CREATIVE — digitals landing page booking widget
   One service, one job: pick a live slot → pay → instantly confirmed.
   Same backend as /book/ (bk_open_slots / bk_create_booking → bk-create-checkout
   → Stripe), so this calendar and the main booking engine can never double-book. */
(() => {
  const TM = window.TM;
  const SERVICE = "digitals";
  const TZ = "America/Chicago";
  const host = document.getElementById("bkHost");
  const stepsBar = document.getElementById("bkSteps");

  const state = {
    svc: null,        // live service row (price/duration come from the DB, not this file)
    month: null,      // Date of displayed month (1st)
    slotsByDay: {},   // 'YYYY-MM-DD' (CT) -> [iso,...]
    day: null,        // selected CT day string
    slot: null,       // selected ISO start
    details: { name: "", email: "", phone: "", location: "", notes: "", subscribe: false },
    submitting: false,
  };

  /* ---------- time helpers (all display in Central) ---------- */
  const dtf = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });
  const ctDate = (iso) => {
    const p = dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const fmtTime = (iso) => dtf({ hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const fmtLong = (iso) => dtf({ weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
  const todayCT = () => ctDate(new Date().toISOString());
  const money = (c) => "$" + (c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0, minimumFractionDigits: c % 100 ? 2 : 0 });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const isMobile = () => matchMedia("(max-width: 820px)").matches;
  const track = (name, params) => { try { window.gtag?.("event", name, params); } catch (_) { /* analytics never blocks booking */ } };

  // Back button steps back through the widget instead of ejecting a
  // half-finished booking off the page
  let suppressPush = false;
  history.replaceState({ step: 1 }, "");
  addEventListener("popstate", (e) => {
    if (!state.svc) return;
    const s = e.state?.step ?? 1;
    suppressPush = true;
    if (s >= 3 && state.details.name) renderConfirm();
    else if (s === 2 && state.slot) renderDetails();
    else renderCalendar();
  });

  function setStep(n) {
    stepsBar.querySelectorAll("span").forEach((el) => {
      const s = +el.dataset.step;
      el.classList.toggle("on", s === n);
      el.classList.toggle("done", s < n);
    });
    // only going DEEPER earns a history entry; in-widget back buttons replace,
    // so the browser Back button always moves away from payment, never toward it
    const cur = history.state?.step ?? 1;
    if (suppressPush) suppressPush = false;
    else if (n > cur) history.pushState({ step: n }, "");
    else if (n !== cur) history.replaceState({ step: n }, "");
    track("book_step", { step: n, service: SERVICE, source: "digitals_lp" });
    if (n > 1) document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // steps 2/3 replace the whole widget DOM — hand focus to the new step's
  // lead element so keyboard and screen-reader users don't drop to <body>
  function focusLead() {
    const lead = host.querySelector("[data-lead]");
    if (lead) { lead.setAttribute("tabindex", "-1"); lead.focus({ preventScroll: true }); }
  }

  /* ================================================================
     STEP 1 — pick a date & time (live availability)
     ================================================================ */
  async function fetchMonth(monthDate) {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const last = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const from = first < todayCT() ? todayCT() : first;
    if (from > last) { state.slotsByDay = {}; return; }
    const res = await TM.rpc("bk_open_slots", { p_service: SERVICE, p_from: from, p_to: last });
    const map = {};
    (res.slots || []).forEach((iso) => { (map[ctDate(iso)] ||= []).push(iso); });
    state.slotsByDay = map;
  }

  /* a booking whose Stripe hop was abandoned holds its slot (pending_payment)
     for ~30 min — offer to finish that checkout instead of letting the user
     collide with their own hold */
  const RESUME_KEY = "tm-digitals-resume";
  const readResume = () => {
    try {
      const r = JSON.parse(sessionStorage.getItem(RESUME_KEY));
      if (r && r.bk && Date.now() - r.ts < 25 * 60 * 1000) return r;
    } catch (_) { /* storage blocked or garbage — no resume offer */ }
    return null;
  };
  const clearResume = () => { try { sessionStorage.removeItem(RESUME_KEY); } catch (_) {} };

  async function resumeCheckout(bk, btn) {
    btn.innerHTML = `<span class="spin"></span> Reopening secure payment…`;
    try {
      const successUrl = new URL(`../success/?p=${bk.project_id}&t=${bk.token}`, location.href).href;
      const res = await fetch(`${TM.FUNCTIONS_BASE}/bk-create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: bk.invoice_id, token: bk.token, return_url: successUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "checkout_failed");
      location.href = data.url;
    } catch (_) {
      clearResume();
      btn.closest(".bk-summary")?.remove();
      renderCalendar();
    }
  }

  function drawResume() {
    const r = readResume();
    const box = document.getElementById("resumeBox");
    if (!box) return;
    if (!r) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="bk-summary" style="max-width:560px; margin-bottom:26px;">
        <div class="row"><span>You started booking</span><b>${fmtLong(r.bk.starts_at)} · ${fmtTime(r.bk.starts_at)} CT</b></div>
        <p class="bk-note" style="margin-top:4px;">Your slot is still on hold — finish paying and it's yours.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
          <button class="btn btn-gold" id="resumeGo" style="padding:12px 22px;">Finish payment →</button>
          <button class="btn btn-ghost" id="resumeDrop" style="padding:12px 22px;">Start over</button>
        </div>
      </div>`;
    document.getElementById("resumeGo").addEventListener("click", (e) => resumeCheckout(r.bk, e.currentTarget));
    document.getElementById("resumeDrop").addEventListener("click", () => { clearResume(); drawResume(); });
    // if the payment actually went through, drop the offer quietly
    TM.rpc("bk_booking_status", { p_project: r.bk.project_id, p_token: r.bk.token })
      .then((s) => { if (s?.invoice?.status === "paid") { clearResume(); drawResume(); } })
      .catch(() => {});
  }

  async function renderCalendar() {
    setStep(1);
    if (!state.month) {
      const t = todayCT().split("-").map(Number);
      state.month = new Date(t[0], t[1] - 1, 1);
    }
    host.innerHTML = `
      <section aria-label="Pick a date and time">
        <div id="resumeBox"></div>
        <div class="cal-wrap">
          <div class="cal" id="cal"><div class="spin" style="margin: 40px auto;"></div></div>
          <div class="slots" id="slots">
            <span class="slots-title">Pick a day to see times</span>
            <p class="empty">Sessions run 9am–9pm, every day. Online booking closes 24 hours before each session — all times Central (Dallas–Fort Worth).</p>
          </div>
        </div>
      </section>`;
    drawResume();
    try {
      await fetchMonth(state.month);
      // nothing this month? quietly hop forward to the first month with open time
      let hops = 0;
      while (Object.keys(state.slotsByDay).length === 0 && hops < 2) {
        const y = state.month.getFullYear(), m = state.month.getMonth();
        state.month = new Date(y, m + 1, 1);
        await fetchMonth(state.month);
        hops++;
      }
      drawGrid();
      drawSlots();
    } catch (e) {
      calError(e);
    }
  }

  function calError(e) {
    const cal = document.getElementById("cal");
    if (!cal) return;
    cal.innerHTML = `<p class="bk-err" style="padding:26px 8px 14px;">Couldn't load the calendar (${esc(e.message)}).</p>
      <button class="btn btn-ghost" id="calRetry" style="margin:0 0 14px;">Try again</button>`;
    document.getElementById("calRetry").addEventListener("click", () => goMonth(0));
  }

  async function goMonth(delta) {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    state.month = new Date(y, m + delta, 1);
    state.day = null; state.slot = null;
    const cal = document.getElementById("cal");
    cal.innerHTML = `<div class="spin" style="margin:40px auto;"></div>`;
    try {
      await fetchMonth(state.month);
      drawGrid();
      drawSlots();
    } catch (e) {
      calError(e);
    }
  }

  function drawGrid() {
    const cal = document.getElementById("cal");
    const y = state.month.getFullYear(), m = state.month.getMonth();
    const monthName = state.month.toLocaleString("en-US", { month: "long", year: "numeric" });
    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const now = new Date();
    const curMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevDisabled = state.month <= curMonth;

    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<span class="cal-day dim"></span>`;
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const open = !!state.slotsByDay[key];
      const spoken = new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      cells += `<span class="cal-day${open ? " open" : ""}${state.day === key ? " sel" : ""}" ${open ? `role="button" tabindex="0" data-day="${key}" aria-pressed="${state.day === key}" aria-label="See open times for ${spoken}"` : ""}>${d}</span>`;
    }
    cal.innerHTML = `
      <div class="cal-head">
        <span class="m">${monthName}</span>
        <div class="cal-nav">
          <button id="calPrev" aria-label="Previous month" ${prevDisabled ? "disabled" : ""}>←</button>
          <button id="calNext" aria-label="Next month">→</button>
        </div>
      </div>
      <div class="cal-dow"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="cal-grid">${cells}</div>`;
    cal.querySelectorAll(".cal-day.open").forEach((el) => {
      const pick = () => {
        state.day = el.dataset.day; state.slot = null;
        drawGrid(); drawSlots();
        const slots = document.getElementById("slots");
        if (isMobile()) slots?.scrollIntoView({ behavior: "smooth", block: "start" });
        const t = slots?.querySelector(".slots-title");
        if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
      };
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
    document.getElementById("calNext").addEventListener("click", () => goMonth(1));
    const prev = document.getElementById("calPrev");
    if (!prevDisabled) prev.addEventListener("click", () => goMonth(-1));
  }

  function drawSlots() {
    const box = document.getElementById("slots");
    const monthEmpty = Object.keys(state.slotsByDay).length === 0;
    if (!state.day && monthEmpty) {
      const monthName = state.month.toLocaleString("en-US", { month: "long" });
      box.innerHTML = `<span class="slots-title">No open times in ${monthName}</span>
        <p class="empty">My calendar is booked out (or not open yet) for ${monthName}. The next month usually has room.</p>
        <button class="btn btn-gold" id="emptyNext" style="align-self:flex-start;">Check next month →</button>`;
      document.getElementById("emptyNext").addEventListener("click", () => goMonth(1));
    } else if (!state.day) {
      box.innerHTML = `<span class="slots-title">Pick a day to see times</span>
        <p class="empty">Days with a gold dot have open times. Sessions run 9am–9pm, every day, and online booking closes 24 hours before each session — all times Central.</p>`;
    } else {
      const times = state.slotsByDay[state.day] || [];
      box.innerHTML = `
        <span class="slots-title">${fmtLong(times[0] || new Date().toISOString())} — open times</span>
        <div class="slot-grid">${times.map((iso) =>
          `<button class="slot${state.slot === iso ? " sel" : ""}" data-iso="${iso}" aria-pressed="${state.slot === iso}">${fmtTime(iso)}</button>`).join("")}</div>
        <button class="btn btn-gold" id="toDetails" ${state.slot ? "" : "disabled style='opacity:.45'"}>Continue →</button>`;
      box.querySelectorAll(".slot").forEach((el) =>
        el.addEventListener("click", () => {
          state.slot = el.dataset.iso;
          drawSlots();
          if (isMobile()) document.getElementById("toDetails")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }));
      const go = document.getElementById("toDetails");
      if (state.slot) go.addEventListener("click", renderDetails);
    }
  }

  /* ================================================================
     STEP 2 — details
     ================================================================ */
  function renderDetails() {
    setStep(2);
    const d = state.details;
    host.innerHTML = `
      <section aria-label="Your details">
        <p class="slate" data-lead style="margin-bottom:18px;">${esc(state.svc.name).toUpperCase()} · ${fmtLong(state.slot).toUpperCase()} · ${fmtTime(state.slot)} CT</p>
        <form class="bk-form" id="bkForm" novalidate>
          <div class="bk-field"><label for="fName">Your name *</label>
            <input id="fName" name="name" required maxlength="120" autocomplete="name" value="${esc(d.name)}"></div>
          <div class="bk-field"><label for="fEmail">Email *</label>
            <input id="fEmail" name="email" type="email" required maxlength="200" autocomplete="email" value="${esc(d.email)}"></div>
          <div class="bk-field"><label for="fPhone">Phone (optional)</label>
            <input id="fPhone" name="phone" type="tel" maxlength="40" autocomplete="tel" value="${esc(d.phone)}"></div>
          <div class="bk-field"><label for="fLoc">Location preference (optional)</label>
            <input id="fLoc" name="location" maxlength="240" placeholder="Studio, your location, or not sure yet" value="${esc(d.location)}"></div>
          <div class="bk-field"><label for="fNotes">Anything I should know? (optional)</label>
            <textarea id="fNotes" name="notes" rows="4" maxlength="3000" placeholder="Agency requirements, looks you need, questions…">${esc(d.notes)}</textarea></div>
          <label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--smoke);cursor:pointer;">
            <input type="checkbox" name="subscribe" ${d.subscribe ? "checked" : ""} style="margin-top:3px;accent-color:var(--gold);">
            <span>Keep me in the loop — occasional studio news, new work, and open dates. No spam, unsubscribe anytime.</span>
          </label>
          <p class="bk-err" id="formErr" role="alert" hidden></p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-gold">Review &amp; pay →</button>
            <button type="button" class="btn btn-ghost" id="backCal">← Back to the calendar</button>
          </div>
        </form>
      </section>`;
    focusLead();
    document.getElementById("backCal").addEventListener("click", renderCalendar);
    const f = document.getElementById("bkForm");
    // keep typed values even if the user steps back to re-check the calendar
    f.addEventListener("input", () => {
      state.details = {
        name: f.name.value, email: f.email.value, phone: f.phone.value,
        location: f.location.value, notes: f.notes.value,
        subscribe: f.subscribe.checked,
      };
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("formErr");
      const email = f.email.value.trim();
      if (!f.name.value.trim()) return showErr(err, "Your name is required.", f.name);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr(err, "Enter a valid email — your confirmation goes there.", f.email);
      state.details = {
        name: f.name.value.trim(), email, phone: f.phone.value.trim(),
        location: f.location.value.trim(), notes: f.notes.value.trim(),
        subscribe: f.subscribe.checked,
      };
      renderConfirm();
    });
  }
  function showErr(el, msg, field) {
    el.textContent = msg; el.hidden = false;
    if (field) {
      field.style.borderColor = "#ffb3a0";
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", el.id);
      field.focus();
      field.addEventListener("input", () => {
        field.style.borderColor = "";
        field.removeAttribute("aria-invalid");
      }, { once: true });
    }
  }

  /* ================================================================
     STEP 3 — confirm & pay
     ================================================================ */
  function renderConfirm() {
    setStep(3);
    const amount = state.svc.deposit_cents ?? state.svc.price_cents;
    host.innerHTML = `
      <section aria-label="Confirm and pay">
        <div class="bk-summary" data-lead role="group" aria-label="Booking summary" style="max-width:560px;">
          <div class="row"><span>Service</span><b>${esc(state.svc.name)}</b></div>
          <div class="row"><span>Date</span><b>${fmtLong(state.slot)}</b></div>
          <div class="row"><span>Time</span><b>${fmtTime(state.slot)} CT · ${state.svc.duration_min} min</b></div>
          <div class="row"><span>Name</span><b>${esc(state.details.name)}</b></div>
          <div class="row"><span>Email</span><b>${esc(state.details.email)}</b></div>
          <div class="row" style="border-top:1px solid var(--line-d); padding-top:10px; margin-top:6px;"><span>Total due now</span><b>${money(amount)}</b></div>
        </div>
        <p class="bk-note" style="margin:16px 0 22px; max-width:56ch;">Secure payment by Stripe. The moment it clears you'll get a confirmation email — then a prep email with what to bring, and a reminder before your session.</p>
        <p class="bk-err" id="payErr" role="alert" hidden></p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-gold" id="goBtn">Pay ${money(amount)} &amp; lock it in</button>
          <button class="btn btn-ghost" id="backDet">← Edit details</button>
        </div>
      </section>`;
    focusLead();
    document.getElementById("backDet").addEventListener("click", renderDetails);
    document.getElementById("goBtn").addEventListener("click", paySession);
  }

  async function paySession() {
    if (state.submitting) return;
    state.submitting = true;
    const btn = document.getElementById("goBtn");
    const err = document.getElementById("payErr");
    btn.innerHTML = `<span class="spin"></span> Locking your slot…`;
    try {
      // if the booking was already created and only the checkout hop failed,
      // retry must NOT create a second booking (our own hold would block us)
      const bkKey = `${SERVICE}|${state.slot}|${state.details.email}`;
      let bk = state.bkCache?.key === bkKey ? state.bkCache.bk : null;
      if (!bk) {
        bk = await TM.rpc("bk_create_booking", {
          p_service: SERVICE,
          p_starts_at: state.slot,
          p_name: state.details.name,
          p_email: state.details.email,
          p_phone: state.details.phone || null,
          p_location: state.details.location || null,
          p_details: state.details.notes || null,
          p_addons: null,
        });
        state.bkCache = { key: bkKey, bk };
        try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ bk, ts: Date.now() })); } catch (_) {}
      }
      track("begin_checkout", { currency: "USD", value: bk.amount_cents / 100, service: SERVICE, source: "digitals_lp" });
      if (state.details.subscribe) {
        TM.rpc("bk_subscribe", { p_email: state.details.email, p_name: state.details.name, p_source: "booking" }).catch(() => {});
      }
      const successUrl = new URL(`../success/?p=${bk.project_id}&t=${bk.token}`, location.href).href;
      const res = await fetch(`${TM.FUNCTIONS_BASE}/bk-create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: bk.invoice_id, token: bk.token, return_url: successUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "checkout_failed");
      btn.innerHTML = `<span class="spin"></span> Sending you to secure payment…`;
      location.href = data.url;
    } catch (e) {
      state.submitting = false;
      btn.innerHTML = "Try again";
      const msg = /slot no longer available/i.test(e.message)
        ? "That time was just taken — head back and pick another slot."
        : /payments_not_configured/.test(e.message)
          ? "Online payment is briefly offline. DM me @taylormade_creative and I'll lock your date manually."
          : `Something went wrong (${e.message}). Try again in a moment.`;
      showErr(err, msg);
    }
  }

  /* ================================================================
     sticky mobile CTA — shows past the hero, hides over the calendar
     ================================================================ */
  const stick = document.getElementById("stickCta");
  const bookAct = document.getElementById("book");
  if (stick && bookAct && "IntersectionObserver" in window) {
    let overBook = false;
    const setStick = () => {
      const show = !overBook && scrollY > 500;
      stick.classList.toggle("show", show);
      // keep the hidden bar out of the tab order and accessibility tree
      if (show) stick.removeAttribute("inert");
      else stick.setAttribute("inert", "");
    };
    new IntersectionObserver((es) => {
      es.forEach((e) => { overBook = e.isIntersecting; });
      setStick();
    }, { rootMargin: "0px 0px -20% 0px" }).observe(bookAct);
    addEventListener("scroll", setStick, { passive: true });
  }

  /* ================================================================
     boot — service data (price, duration) always comes from the DB
     ================================================================ */
  (async () => {
    try {
      const services = await TM.rpc("bk_public_services", {});
      state.svc = services.find((s) => s.slug === SERVICE && s.kind === "session");
      if (!state.svc) throw new Error("digitals is not bookable right now");
      renderCalendar();
    } catch (e) {
      host.innerHTML = `<p class="bk-err">The booking calendar couldn't load (${esc(e.message)}). Refresh, book at <a href="../book/?service=digitals" style="color:var(--gold);text-decoration:underline;">the booking page</a>, or DM <a href="https://www.instagram.com/taylormade_creative/" style="color:var(--gold);text-decoration:underline;">@taylormade_creative</a>.</p>`;
    }
  })();
})();
