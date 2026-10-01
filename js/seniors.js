/* TAYLORMADE/CREATIVE — senior photos booking widget
   Two packages (mini / full) × two places (studio / on location in DFW):
   pick package + place → live slot → pay in full → instantly confirmed.
   Same backend as /book/ (bk_open_slots_where / bk_create_booking →
   bk-create-checkout → Stripe), so this calendar and the main booking engine
   can never double-book. On-location times come from bk_open_slots_where(…, true),
   which keeps an hour of travel clear on each side of the shoot. */
(() => {
  const TM = window.TM;
  // package slug -> the bk_services row it books. Price and duration always come
  // from the DB; the page copy just has to agree with it.
  const PKGS = ["senior-mini", "senior-full"];
  const pkgFromUrl = () => {
    const q = new URLSearchParams(location.search).get("package");
    return q === "full" ? "senior-full" : q === "mini" ? "senior-mini" : null;
  };
  // ?where=location opens the widget on the on-location calendar
  const whereFromUrl = () => new URLSearchParams(location.search).get("where") === "location" ? "location" : "studio";
  const TZ = "America/Chicago";

  const host = document.getElementById("bkHost");
  const stepsBar = document.getElementById("bkSteps");

  // Optional "what are they for" — shapes how Nelson plans the session.
  // Rides along in p_details (the booking's notes field); "" is the placeholder.
  const USES = ["", "High school senior photos", "College graduation photos", "Graduation announcements", "Something else"];
  const detailsBlob = () => {
    const { use, senior, notes } = state.details;
    return [
      use ? `For: ${use}` : "",
      senior ? `Senior: ${senior}` : "",
      notes || "",
    ].filter(Boolean).join("\n");
  };
  const onLoc = () => state.where === "location";

  const state = {
    services: {},     // slug -> live service row (price/duration come from the DB, not this file)
    pkg: null,        // selected package slug
    svc: null,        // live row for the selected package
    where: "studio",  // "studio" | "location" (on location in DFW)
    month: null,      // Date of displayed month (1st)
    slotsByDay: {},   // 'YYYY-MM-DD' (CT) -> [iso,...]
    day: null,        // selected CT day string
    slot: null,       // selected ISO start
    details: { name: "", email: "", phone: "", place: "", senior: "", use: "", notes: "", subscribe: false },
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
  // honour prefers-reduced-motion on every programmatic scroll
  const scrollBehavior = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
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
    // the steps bar is aria-hidden (decorative); announce the change separately
    const live = document.getElementById("bkLive");
    if (live) live.textContent = ["", "Step 1 of 3: pick a package, a place, and a time", "Step 2 of 3: your details", "Step 3 of 3: confirm and pay"][n] || "";
    track("book_step", { step: n, service: state.pkg, where: state.where, lp: "seniors" });
    if (n > 1) document.getElementById("book")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
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
    const res = await TM.rpc("bk_open_slots_where", { p_service: state.pkg, p_from: from, p_to: last, p_on_location: onLoc() });
    const map = {};
    (res.slots || []).forEach((iso) => { (map[ctDate(iso)] ||= []).push(iso); });
    state.slotsByDay = map;
    showNextOpening(res.slots || []);
  }

  /* Hero "next opening" — a real time beats any promise about how fast booking is.
     Only ever fills from the first month load; later months would show a worse
     (further out) time than the one already on screen. */
  let nextOpeningShown = false;
  function showNextOpening(slots) {
    if (nextOpeningShown) return;
    const el = document.getElementById("nextOpen");
    if (!el) return;
    const iso = slots.find((s) => new Date(s) > new Date());
    if (!iso) return;               // nothing bookable this month — leave the static copy alone
    nextOpeningShown = true;
    // label + value share one flex item so narrow screens wrap it as a sentence
    // instead of splitting "Next / opening" away from the date
    el.innerHTML = `<span class="no-dot" aria-hidden="true"></span><span class="no-txt">Next opening <b>${fmtLong(iso)} · ${fmtTime(iso)} CT</b></span>`;
    el.hidden = false;
  }

  /* a booking whose Stripe hop was abandoned holds its slot (pending_payment)
     for ~30 min — offer to finish that checkout instead of letting the user
     collide with their own hold */
  const RESUME_KEY = "tm-seniors-resume";
  const readResume = () => {
    try {
      const r = JSON.parse(sessionStorage.getItem(RESUME_KEY));
      if (r && r.bk && Date.now() - r.ts < 25 * 60 * 1000) return r;
    } catch (_) { /* storage blocked or garbage — no resume offer */ }
    return null;
  };
  const clearResume = () => { try { sessionStorage.removeItem(RESUME_KEY); } catch (_) {} };

  let resuming = false;
  async function resumeCheckout(bk, btn) {
    if (resuming) return;              // a double-tap must not open two checkouts
    resuming = true;
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span> Reopening secure payment…`;
    const err = document.getElementById("resumeErr");
    const show = (msg) => {
      if (err) { err.textContent = msg; err.hidden = false; }
      btn.disabled = false; btn.innerHTML = label; resuming = false;
    };
    try {
      const successUrl = new URL(`../success/?p=${bk.project_id}&t=${bk.token}`, location.href).href;
      const res = await fetch(`${TM.FUNCTIONS_BASE}/bk-create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: bk.invoice_id, token: bk.token, return_url: successUrl, promo_code: "" }),
      });
      // .catch so an HTML error page doesn't throw before we can read the status
      const data = await res.json().catch(() => ({}));

      // 409 already_paid is good news, not a failure — say so and stop.
      if (data.error === "already_paid" || res.status === 409) {
        clearResume();
        const box = document.getElementById("resumeBox");
        if (box) drawAlreadyPaid(box, bk);
        resuming = false;
        return;
      }
      if (!res.ok || !data.url) throw new Error(data.error || "checkout_failed");
      location.href = data.url;
    } catch (e) {
      // never silently wipe the panel — the user just tried to pay
      show(`Couldn't reopen the payment page (${esc(e.message)}). Try again, or DM @taylormade_creative and I'll send you a payment link.`);
    }
  }

  // Shown instead of the "finish paying" offer once we believe money changed hands.
  function drawAlreadyPaid(box, bk) {
    box.innerHTML = `
      <div class="bk-summary" style="max-width:560px; margin-bottom:26px;">
        <div class="row"><span>You're booked</span><b>${fmtLong(bk.starts_at)} · ${fmtTime(bk.starts_at)} CT</b></div>
        <p class="bk-note" style="margin-top:4px;">That payment already went through — nothing else to do. I'll email your confirmation and what to bring. If it hasn't landed, check spam, then DM <a href="https://www.instagram.com/taylormade_creative/" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline;">@taylormade_creative</a> and I'll resend it.</p>
      </div>`;
  }

  async function drawResume() {
    const r = readResume();
    const box = document.getElementById("resumeBox");
    if (!box) return;
    if (!r) { box.innerHTML = ""; return; }

    // Check BEFORE rendering, not after. Rendering "finish paying" optimistically
    // and retracting it later means anyone whose payment did land — which, while
    // webhook reconciliation is manual, is everyone — is told to pay twice.
    // Treat a confirmed booking as paid too: the invoice flag is the one the
    // known-broken webhook fails to set, so it cannot be the only signal.
    try {
      const s = await TM.rpc("bk_booking_status", { p_project: r.bk.project_id, p_token: r.bk.token });
      if (s?.invoice?.status === "paid" || s?.booking?.status === "confirmed") {
        clearResume();
        drawAlreadyPaid(box, r.bk);
        return;
      }
    } catch (_) { /* status unreachable — fall through and offer the resume */ }

    box.innerHTML = `
      <div class="bk-summary" style="max-width:560px; margin-bottom:26px;">
        <div class="row"><span>You started booking</span><b>${fmtLong(r.bk.starts_at)} · ${fmtTime(r.bk.starts_at)} CT</b></div>
        <p class="bk-note" style="margin-top:4px;">Your slot is still on hold — finish paying and it's yours.</p>
        <p class="bk-err" id="resumeErr" role="alert" hidden></p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
          <button class="btn btn-gold" id="resumeGo" style="padding:12px 22px;">Finish payment →</button>
          <button class="btn btn-ghost" id="resumeDrop" style="padding:12px 22px;">Start over</button>
        </div>
      </div>`;
    document.getElementById("resumeGo").addEventListener("click", (e) => resumeCheckout(r.bk, e.currentTarget));
    document.getElementById("resumeDrop").addEventListener("click", () => { clearResume(); drawResume(); });
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
        <div class="pick-row">
          <div>
            <span class="pick-label" id="pickPkgLbl">Package</span>
            <div class="pkg-pick" role="radiogroup" aria-labelledby="pickPkgLbl">
              ${PKGS.filter((p) => state.services[p]).map((p) => pkgBtn(state.services[p])).join("")}
            </div>
          </div>
          <div>
            <span class="pick-label" id="pickWhereLbl">Where</span>
            <div class="pkg-pick" role="radiogroup" aria-labelledby="pickWhereLbl">
              ${whereBtn("studio")}${whereBtn("location")}
            </div>
          </div>
        </div>
        <div class="cal-wrap">
          <div class="cal" id="cal"><div class="spin" style="margin: 40px auto;"></div></div>
          <div class="slots" id="slots">
            <span class="slots-title">Pick a day to see times</span>
            <p class="empty">${hoursNote()}</p>
          </div>
        </div>
      </section>`;
    drawResume();
    host.querySelectorAll("[data-pick-pkg]").forEach((b) =>
      b.addEventListener("click", () => choosePkg(b.dataset.pickPkg)));
    host.querySelectorAll("[data-pick-where]").forEach((b) =>
      b.addEventListener("click", () => chooseWhere(b.dataset.pickWhere)));
    radioKeys(host);
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

  const hoursNote = () => onLoc()
    ? "On-location sessions run 9am–9pm, every day, anywhere in DFW. I keep an hour clear on each side for the drive, so you'll see fewer times than in the studio. Booking closes 24 hours ahead — all times Central."
    : "Studio sessions run 9am–9pm, every day, in Downtown Dallas. Online booking closes 24 hours before each session — all times Central (Dallas–Fort Worth).";

  const PKG_LABEL = { "senior-mini": "Mini", "senior-full": "Full" };
  function pkgBtn(svc) {
    const on = state.pkg === svc.slug;
    return `<button type="button" class="pkg-opt${on ? " sel" : ""}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-pick-pkg="${svc.slug}">
      <span class="pkg-opt-name">${PKG_LABEL[svc.slug] || esc(svc.name)}</span>
      <span class="pkg-opt-meta">${money(svc.price_cents)} · ${svc.duration_min} min${svc.deposit_cents != null ? ` · ${money(svc.deposit_cents)} deposit` : ""}</span>
    </button>`;
  }
  const WHERE = {
    studio: { name: "Studio", meta: "Downtown Dallas" },
    location: { name: "On location", meta: "Anywhere in DFW" },
  };
  function whereBtn(w) {
    const on = state.where === w;
    return `<button type="button" class="pkg-opt${on ? " sel" : ""}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-pick-where="${w}">
      <span class="pkg-opt-name">${WHERE[w].name}</span>
      <span class="pkg-opt-meta">${WHERE[w].meta}</span>
    </button>`;
  }
  // radio groups: arrow keys move + select within a group (one tab stop each)
  function radioKeys(root) {
    root.querySelectorAll('[role="radiogroup"]').forEach((g) => {
      g.addEventListener("keydown", (e) => {
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!(e.key in keys)) return;
        const opts = [...g.querySelectorAll('[role="radio"]')];
        const i = opts.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const next = opts[(i + keys[e.key] + opts.length) % opts.length];
        next.focus();
        next.click();
      });
    });
  }
  function syncRadios(attr, value) {
    document.querySelectorAll(`[${attr}]`).forEach((b) => {
      const on = b.getAttribute(attr) === value;
      b.classList.toggle("sel", on);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  /* switching package re-reads availability: a 60-minute session fits in
     fewer gaps than a 30-minute one, so the open days genuinely differ */
  function choosePkg(slug) {
    if (!state.services[slug]) return;
    if (slug === state.pkg && document.querySelector(".pkg-pick")) return;
    state.pkg = slug;
    state.svc = state.services[slug];
    state.slot = null; state.day = null;
    syncRadios("data-pick-pkg", slug);
    document.dispatchEvent(new CustomEvent("seniors:pkg", { detail: slug }));
    track("select_package", { service: slug, lp: "seniors" });
    if (document.getElementById("cal")) goMonth(0);
    else renderCalendar();
  }

  /* switching studio ↔ on location re-reads availability too: on-location
     times keep an hour of travel clear on each side, so they fit fewer gaps */
  function chooseWhere(w) {
    if (!WHERE[w] || (w === state.where && document.querySelector("[data-pick-where]"))) return;
    state.where = w;
    state.slot = null; state.day = null;
    syncRadios("data-pick-where", w);
    track("select_location", { where: w, service: state.pkg, lp: "seniors" });
    if (document.getElementById("cal")) goMonth(0);
    else renderCalendar();
  }
  // package cards / "shoot on location" links elsewhere on the page pick the
  // package and/or place and bring the calendar into view
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-pkg], [data-where]");
    if (!el || !state.svc) return;
    const pkg = state.services[el.dataset.pkg] ? el.dataset.pkg : state.pkg;
    const where = WHERE[el.dataset.where] ? el.dataset.where : state.where;
    if (pkg === state.pkg && where === state.where && document.getElementById("cal")) return;
    if (pkg !== state.pkg) track("select_package", { service: pkg, lp: "seniors" });
    if (where !== state.where) track("select_location", { where, service: pkg, lp: "seniors" });
    state.pkg = pkg; state.svc = state.services[pkg]; state.where = where;
    state.slot = null; state.day = null;
    syncRadios("data-pick-pkg", pkg);
    syncRadios("data-pick-where", where);
    document.dispatchEvent(new CustomEvent("seniors:pkg", { detail: pkg }));
    if (document.getElementById("cal")) goMonth(0);
    else renderCalendar();
  });

  function calError(e) {
    const cal = document.getElementById("cal");
    if (!cal) return;
    cal.innerHTML = `<p class="bk-err" style="padding:26px 8px 14px;">Couldn't load the calendar (${esc(e.message)}).</p>
      <button class="btn btn-ghost" id="calRetry" style="margin:0 0 14px;">Try again</button>`;
    document.getElementById("calRetry").addEventListener("click", () => goMonth(0));
  }

  let fetchSeq = 0;
  async function goMonth(delta) {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    state.month = new Date(y, m + delta, 1);
    state.day = null; state.slot = null;
    const cal = document.getElementById("cal");
    cal.innerHTML = `<div class="spin" style="margin:40px auto;"></div>`;
    // Blank the times panel in the SAME tick as the calendar. Leaving it live
    // during the fetch keeps the old month's "Continue →" in the DOM with its
    // listener attached, so a tap mid-spinner enters checkout with state.slot
    // null and renders the Unix epoch as the session date.
    const slots = document.getElementById("slots");
    if (slots) slots.innerHTML = `<span class="slots-title">Loading times…</span>`;
    const seq = ++fetchSeq;
    try {
      await fetchMonth(state.month);
      if (seq !== fetchSeq) return;   // a newer month click already superseded this one
      drawGrid();
      drawSlots();
    } catch (e) {
      if (seq !== fetchSeq) return;
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
        if (isMobile()) slots?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
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
        <p class="empty">Days with a gold dot have open times. ${hoursNote()}</p>`;
    } else {
      const times = state.slotsByDay[state.day] || [];
      box.innerHTML = `
        <span class="slots-title">${fmtLong(times[0] || new Date().toISOString())} — open times</span>
        <div class="slot-grid">${times.map((iso) =>
          `<button class="slot${state.slot === iso ? " sel" : ""}" data-iso="${iso}" aria-pressed="${state.slot === iso}">${fmtTime(iso)}</button>`).join("")}</div>
        <button class="btn btn-gold" id="toDetails" ${state.slot ? "" : "disabled style='opacity:.45'"}>Continue →</button>`;
      const go = document.getElementById("toDetails");
      // attached unconditionally — the button gets enabled below, and a handler
      // bound only when a slot pre-exists would leave a live-looking dead button
      go.addEventListener("click", () => { if (state.slot) renderDetails(); });
      const slotEls = [...box.querySelectorAll(".slot")];
      slotEls.forEach((el) =>
        el.addEventListener("click", () => {
          state.slot = el.dataset.iso;
          // update selection IN PLACE. Re-rendering the panel here would destroy
          // the button the user just activated and drop keyboard focus to <body>,
          // stranding keyboard and screen-reader users on the money path.
          slotEls.forEach((s) => {
            const on = s.dataset.iso === state.slot;
            s.classList.toggle("sel", on);
            s.setAttribute("aria-pressed", String(on));
          });
          go.disabled = false;
          go.style.opacity = "";
          if (isMobile()) go.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
        }));
    }
  }

  /* ================================================================
     STEP 2 — details
     ================================================================ */
  function renderDetails() {
    // belt and braces: never render a step-2 header off a null slot (epoch date)
    if (!state.slot) return renderCalendar();
    setStep(2);
    const d = state.details;
    host.innerHTML = `
      <section aria-label="Your details">
        <p class="slate" data-lead style="margin-bottom:18px;">${esc(state.svc.name).toUpperCase()} · ${onLoc() ? "ON LOCATION" : "STUDIO"} · ${fmtLong(state.slot).toUpperCase()} · ${fmtTime(state.slot)} CT</p>
        <form class="bk-form" id="bkForm" novalidate>
          ${onLoc() ? `<div class="bk-field"><label for="fPlace">Where should we shoot? *</label>
            <input id="fPlace" name="place" required maxlength="200" autocomplete="street-address" placeholder="A park, a street, an address…" value="${esc(d.place)}" aria-describedby="fPlaceHint">
            <p class="bk-note" id="fPlaceHint" style="margin:8px 0 0;">An address or the name of the place, anywhere in Dallas–Fort Worth.</p></div>` : ""}
          <div class="bk-field"><label for="fName">Your name *</label>
            <input id="fName" name="name" required maxlength="120" autocomplete="name" value="${esc(d.name)}"></div>
          <div class="bk-field"><label for="fEmail">Email *</label>
            <input id="fEmail" name="email" type="email" required maxlength="200" autocomplete="email" value="${esc(d.email)}"></div>
          <div class="bk-field"><label for="fPhone">Phone (optional)</label>
            <input id="fPhone" name="phone" type="tel" maxlength="40" autocomplete="tel" value="${esc(d.phone)}"></div>
          <div class="bk-field"><label for="fSenior">Booking for your senior? Their name (optional)</label>
            <input id="fSenior" name="senior" maxlength="120" autocomplete="off" value="${esc(d.senior)}"></div>
          <div class="bk-field"><label for="fUse">What are the photos for? (optional)</label>
            <select id="fUse" name="use">
              ${USES.map((u) => `<option value="${esc(u)}"${d.use === u ? " selected" : ""}>${esc(u || "Pick one — helps me plan the shoot")}</option>`).join("")}
            </select></div>
          <div class="bk-field"><label for="fNotes">Anything I should know? (optional)</label>
            <textarea id="fNotes" name="notes" rows="4" maxlength="3000" placeholder="School and colors, what you're bringing (cap and gown, letterman jacket, jersey), outfit ideas, Pinterest links, questions…">${esc(d.notes)}</textarea></div>
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
        place: f.place ? f.place.value : state.details.place,
        senior: f.senior.value, use: f.use.value, notes: f.notes.value,
        subscribe: f.subscribe.checked,
      };
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("formErr");
      const email = f.email.value.trim();
      if (f.place && !/[\p{L}\p{N}]/u.test(f.place.value)) return showErr(err, "Tell me where we're shooting — an address or the name of the place.", f.place);
      if (!f.name.value.trim()) return showErr(err, "Your name is required.", f.name);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr(err, "Enter a valid email — your confirmation goes there.", f.email);
      state.details = {
        name: f.name.value.trim(), email, phone: f.phone.value.trim(),
        place: f.place ? f.place.value.trim() : state.details.place,
        senior: f.senior.value.trim(), use: f.use.value, notes: f.notes.value.trim(),
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
      // keep any existing hint (e.g. the place field's) alongside the error
      const ids = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      ids.add(el.id);
      field.setAttribute("aria-describedby", [...ids].join(" "));
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
    const balance = state.svc.deposit_cents != null ? state.svc.price_cents - state.svc.deposit_cents : 0;
    // the balance comes off the same card 24h before the shoot (bk-charge-balances)
    // booked less than ~a day ahead, the "day before" moment has already
    // passed, so the hourly job charges it right away — say so plainly
    const chargeAt = new Date(state.slot).getTime() - 24 * 3600 * 1000;
    const soon = chargeAt < Date.now() + 2 * 3600 * 1000;
    const balanceDay = soon ? "within the hour" : "on " + dtf({ weekday: "long", month: "long", day: "numeric" }).format(new Date(chargeAt));
    host.innerHTML = `
      <section aria-label="Confirm and pay">
        <div class="bk-summary" data-lead role="group" aria-label="Booking summary" style="max-width:560px;">
          <div class="row"><span>Service</span><b>${esc(state.svc.name)}</b></div>
          <div class="row"><span>Date</span><b>${fmtLong(state.slot)}</b></div>
          <div class="row"><span>Time</span><b>${fmtTime(state.slot)} CT · ${state.svc.duration_min} min</b></div>
          <div class="row"><span>Where</span><b>${onLoc() ? esc(state.details.place) : "My studio · Downtown Dallas"}</b></div>
          <div class="row"><span>Name</span><b>${esc(state.details.name)}</b></div>
          <div class="row"><span>Email</span><b>${esc(state.details.email)}</b></div>
          ${balance > 0 ? `<div class="row" style="border-top:1px solid var(--line-d); padding-top:10px; margin-top:6px;"><span>Session total</span><b>${money(state.svc.price_cents)}</b></div>` : ""}
          <div class="row"${balance > 0 ? "" : ` style="border-top:1px solid var(--line-d); padding-top:10px; margin-top:6px;"`}><span>${balance > 0 ? "Deposit due now" : "Total due now"}</span><b>${money(amount)}</b></div>
          ${balance > 0 ? `<div class="row"><span>Balance</span><b>${money(balance)} ${balanceDay}</b></div>` : ""}
        </div>
        ${balance > 0 ? `<p class="bk-note" style="margin:16px 0 0; max-width:56ch;">Your deposit holds the date. The remaining <b style="color:var(--paper);">${money(balance)}</b> is charged automatically to the same card <b style="color:var(--paper);">${balanceDay}</b>${soon ? ", since your shoot is less than a day away" : ", the day before your shoot"}. Nothing else to remember.</p>` : ""}
        <p class="bk-note" style="margin:16px 0 22px; max-width:56ch;">Secure payment by Stripe. Once it clears I'll email your confirmation${onLoc() ? "" : ", the studio address,"} and what to bring — well before shoot day. Nothing in your inbox? Check spam, then DM <a href="https://www.instagram.com/taylormade_creative/" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline;">@taylormade_creative</a> and I'll resend it.</p>
        <p class="bk-err" id="payErr" role="alert" hidden></p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-gold" id="goBtn">Pay ${money(amount)}${balance > 0 ? " deposit" : ""} &amp; lock it in</button>
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
      const bkKey = `${state.pkg}|${state.where}|${state.details.place}|${state.slot}|${state.details.email}`;
      let bk = state.bkCache?.key === bkKey ? state.bkCache.bk : null;
      if (!bk) {
        bk = await TM.rpc("bk_create_booking", {
          p_service: state.pkg,
          p_starts_at: state.slot,
          p_name: state.details.name,
          p_email: state.details.email,
          p_phone: state.details.phone || null,
          p_location: onLoc() ? state.details.place : null,
          p_details: detailsBlob() || null,
          p_addons: null,
        });
        state.bkCache = { key: bkKey, bk };
        try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ bk, ts: Date.now() })); } catch (_) {}
      }
      track("begin_checkout", { currency: "USD", value: bk.amount_cents / 100, service: state.pkg, where: state.where, lp: "seniors" });
      if (state.details.subscribe) {
        TM.rpc("bk_subscribe", { p_email: state.details.email, p_name: state.details.name, p_source: "booking" }).catch(() => {});
      }
      const successUrl = new URL(`../success/?p=${bk.project_id}&t=${bk.token}`, location.href).href;
      const res = await fetch(`${TM.FUNCTIONS_BASE}/bk-create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: bk.invoice_id, token: bk.token, return_url: successUrl, promo_code: "" }),
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
      services.forEach((s) => { if (PKGS.includes(s.slug) && s.kind === "session") state.services[s.slug] = s; });
      if (!Object.keys(state.services).length) throw new Error("senior sessions are not bookable right now");
      state.pkg = [pkgFromUrl(), ...PKGS].find((p) => p && state.services[p]);
      state.svc = state.services[state.pkg];
      state.where = whereFromUrl();
      document.dispatchEvent(new CustomEvent("seniors:pkg", { detail: state.pkg }));
      renderCalendar();
    } catch (e) {
      host.innerHTML = `<p class="bk-err">The booking calendar couldn't load (${esc(e.message)}). Refresh the page, or DM <a href="https://www.instagram.com/taylormade_creative/" style="color:var(--gold);text-decoration:underline;">@taylormade_creative</a>.</p>`;
    }
  })();
})();
