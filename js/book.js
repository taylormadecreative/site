/* TAYLORMADE/CREATIVE — booking engine
   Two lanes from one wizard:
   - session services: pick a live slot → pay online → instantly confirmed
   - project services: pick a preferred slot (optional) → inquiry → quote
   Backend: Supabase RPCs bk_public_services / bk_open_slots / bk_create_booking /
   bk_submit_inquiry, then the bk-create-checkout edge function → Stripe. */
(() => {
  const TM = window.TM;
  const TZ = "America/Chicago";
  const host = document.getElementById("stepHost");
  const stepsBar = document.getElementById("bookSteps");

  const state = {
    services: [],
    svc: null,        // selected service object
    month: null,      // Date of displayed month (1st)
    slotsByDay: {},   // 'YYYY-MM-DD' (CT) -> [iso,...]
    day: null,        // selected CT day string
    slot: null,       // selected ISO start
    flexible: false,  // project lane skipped the calendar
    details: {},
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
  const fmtDur = (min) => min < 60 ? `${min} min`
    : min % 60 === 0 ? `${min / 60} ${min === 60 ? "hr" : "hrs"}`
    : `${Math.floor(min / 60)}h ${min % 60}m`;
  const isWeekendCT = (iso) => ["Sat", "Sun"].includes(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date(iso)));
  // weekend-priced services (studio rental) charge by the day the slot lands on;
  // the server recomputes this authoritatively in bk_create_booking
  const amountFor = (svc, slotIso) => svc.deposit_cents ??
    ((slotIso && svc.weekend_price_cents != null && isWeekendCT(slotIso))
      ? svc.weekend_price_cents : svc.price_cents);
  const isStudio = (svc) => (svc?.slug ?? "").startsWith("studio-");
  const isMobile = () => matchMedia("(max-width: 820px)").matches;
  const track = (name, params) => { try { window.gtag?.("event", name, params); } catch (_) { /* analytics never blocks booking */ } };

  // the phone/browser Back button should step back through the wizard,
  // not eject a half-finished booking to the homepage
  let suppressPush = false;
  history.replaceState({ step: 1 }, "");
  addEventListener("popstate", (e) => {
    const s = e.state?.step ?? 1;
    suppressPush = true;
    if (s <= 1 || !state.svc) renderServices();
    else if (s === 3 && (state.slot || state.flexible)) renderDetails();
    else if (s === 4 && state.details.name) renderConfirm();
    else renderCalendar();
  });

  function setStep(n) {
    stepsBar.querySelectorAll("span").forEach((el) => {
      const s = +el.dataset.step;
      el.classList.toggle("on", s === n);
      el.classList.toggle("done", s < n);
    });
    if (suppressPush) suppressPush = false;
    else if (n > 1) history.pushState({ step: n }, "");
    track("book_step", { step: n, service: state.svc?.slug ?? "none" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================================================================
     STEP 1 — pick a service
     ================================================================ */
  function renderServices() {
    setStep(1);
    const sessions = state.services.filter((s) => s.kind === "session");
    const projects = state.services.filter((s) => s.kind === "project");
    const card = (s) => `
      <button class="svc-card" data-slug="${esc(s.slug)}">
        <span class="k">${s.kind === "session" ? "INSTANT BOOK" : "CUSTOM QUOTE"}</span>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.tagline || "")}</p>
        <span class="price">${
          s.kind !== "session"
            ? `<b>Quoted per project</b> · reply within 1 business day`
            : s.weekend_price_cents != null && !s.deposit_cents
              ? `<b>${money(s.price_cents)}</b> weekday · ${money(s.weekend_price_cents)} weekend · ${fmtDur(s.duration_min)}`
              : `<b>${money(s.deposit_cents ?? s.price_cents)}</b> · ${s.deposit_cents ? "deposit locks your date" : "flat, paid at booking"} · ${fmtDur(s.duration_min)}`
        }</span>
      </button>`;
    host.innerHTML = `
      <section aria-label="Choose a service">
        ${sessions.length ? `<p class="slate" style="margin-bottom:16px;">BOOK A SESSION — PAY &amp; CONFIRM INSTANTLY</p>
        <div class="svc-grid" style="margin-bottom:42px;">${sessions.map(card).join("")}</div>` : ""}
        <p class="slate" id="project" style="margin-bottom:16px;">START A PROJECT — TELL ME WHAT YOU'RE MAKING</p>
        <div class="svc-grid">${projects.map(card).join("")}</div>
      </section>`;
    host.querySelectorAll(".svc-card").forEach((el) =>
      el.addEventListener("click", () => selectService(el.dataset.slug)));
  }

  function selectService(slug) {
    state.svc = state.services.find((s) => s.slug === slug);
    if (!state.svc) return;
    state.day = null; state.slot = null; state.flexible = false;
    state.month = null; state.slotsByDay = {};
    renderCalendar();
  }

  /* ================================================================
     STEP 2 — pick a date & time (live availability)
     ================================================================ */
  async function fetchMonth(monthDate) {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const last = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const from = first < todayCT() ? todayCT() : first;
    if (from > last) { state.slotsByDay = {}; return; }
    const res = await TM.rpc("bk_open_slots", { p_service: state.svc.slug, p_from: from, p_to: last });
    const map = {};
    (res.slots || []).forEach((iso) => { (map[ctDate(iso)] ||= []).push(iso); });
    state.slotsByDay = map;
  }

  async function renderCalendar() {
    setStep(2);
    if (!state.month) {
      const t = todayCT().split("-").map(Number);
      state.month = new Date(t[0], t[1] - 1, 1);
    }
    host.innerHTML = `
      <section aria-label="Pick a date and time">
        <p class="slate" style="margin-bottom:10px;">${esc(state.svc.name).toUpperCase()} · ${fmtDur(state.svc.duration_min).toUpperCase()}${state.svc.kind === "project" ? " · PREFERRED DATE (OPTIONAL)" : ""}</p>
        <div class="cal-wrap">
          <div class="cal" id="cal"><div class="spin" style="margin: 40px auto;"></div></div>
          <div class="slots" id="slots">
            <span class="slots-title">Pick a day to see times</span>
            <p class="empty">All times shown in Central Time (Dallas–Fort Worth).</p>
            ${state.svc.kind === "project" ? `<button class="btn btn-ghost" id="skipCal" style="align-self:flex-start;">I'm flexible — skip this</button>` : ""}
            <button class="btn btn-ghost" id="backSvc" style="align-self:flex-start;">← Change service</button>
          </div>
        </div>
      </section>`;
    document.getElementById("backSvc").addEventListener("click", renderServices);
    const skip = document.getElementById("skipCal");
    if (skip) skip.addEventListener("click", () => { state.flexible = true; state.day = null; state.slot = null; renderDetails(); });

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
      cells += `<span class="cal-day${open ? " open" : ""}${state.day === key ? " sel" : ""}" ${open ? `role="button" tabindex="0" data-day="${key}" aria-label="See open times for ${spoken}"` : ""}>${d}</span>`;
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
        <button class="btn btn-gold" id="emptyNext" style="align-self:flex-start;">Check next month →</button>
        ${state.svc.kind === "project" ? `<button class="btn btn-ghost" id="skipCal" style="align-self:flex-start;">I'm flexible — skip the calendar</button>` : ""}
        <button class="btn btn-ghost" id="backSvc" style="align-self:flex-start;">← Change service</button>`;
      document.getElementById("emptyNext").addEventListener("click", () => goMonth(1));
    } else if (!state.day) {
      box.innerHTML = `<span class="slots-title">Pick a day to see times</span>
        <p class="empty">Days with a gold dot have open times. All times Central.</p>
        ${state.svc.kind === "project" ? `<button class="btn btn-ghost" id="skipCal" style="align-self:flex-start;">I'm flexible — skip this</button>` : ""}
        <button class="btn btn-ghost" id="backSvc" style="align-self:flex-start;">← Change service</button>`;
    } else {
      const times = state.slotsByDay[state.day] || [];
      box.innerHTML = `
        <span class="slots-title">${fmtLong(times[0] || new Date().toISOString())} — open times</span>
        <div class="slot-grid">${times.map((iso) =>
          `<button class="slot${state.slot === iso ? " sel" : ""}" data-iso="${iso}">${fmtTime(iso)}</button>`).join("")}</div>
        <button class="btn btn-gold" id="toDetails" ${state.slot ? "" : "disabled style='opacity:.45'"}>Continue →</button>
        <button class="btn btn-ghost" id="backSvc" style="align-self:flex-start;">← Change service</button>`;
      box.querySelectorAll(".slot").forEach((el) =>
        el.addEventListener("click", () => {
          state.slot = el.dataset.iso;
          drawSlots();
          if (isMobile()) document.getElementById("toDetails")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }));
      const go = document.getElementById("toDetails");
      if (state.slot) go.addEventListener("click", renderDetails);
    }
    const back = document.getElementById("backSvc");
    if (back) back.addEventListener("click", renderServices);
    const skip = document.getElementById("skipCal");
    if (skip) skip.addEventListener("click", () => { state.flexible = true; state.day = null; state.slot = null; renderDetails(); });
  }

  /* ================================================================
     STEP 3 — details
     ================================================================ */
  function renderDetails() {
    setStep(3);
    const isSession = state.svc.kind === "session";
    const d = state.details;
    host.innerHTML = `
      <section aria-label="Your details">
        <p class="slate" style="margin-bottom:18px;">${esc(state.svc.name).toUpperCase()}${state.slot ? ` · ${fmtLong(state.slot).toUpperCase()} · ${fmtTime(state.slot)} CT` : " · DATE TBD"}</p>
        <form class="bk-form" id="bkForm" novalidate>
          <div class="bk-field"><label for="fName">Your name *</label>
            <input id="fName" name="name" required maxlength="120" autocomplete="name" value="${esc(d.name)}"></div>
          <div class="bk-field"><label for="fEmail">Email *</label>
            <input id="fEmail" name="email" type="email" required maxlength="200" autocomplete="email" value="${esc(d.email)}"></div>
          <div class="bk-field"><label for="fPhone">Phone (optional)</label>
            <input id="fPhone" name="phone" type="tel" maxlength="40" autocomplete="tel" value="${esc(d.phone)}"></div>
          ${isSession ? `
          <div class="bk-field"><label for="fLoc">Location preference (optional)</label>
            <input id="fLoc" name="location" maxlength="240" placeholder="Studio, your location, or not sure yet" value="${esc(d.location)}"></div>` : `
          <div class="bk-field"><label for="fCompany">Company / brand (optional)</label>
            <input id="fCompany" name="company" maxlength="160" value="${esc(d.company)}"></div>
          <div class="bk-field"><label for="fBudget">Budget range</label>
            <select id="fBudget" name="budget">
              <option${d.budget === "Not sure yet" ? " selected" : ""}>Not sure yet</option>
              ${state.svc.slug === "web-design" ? "" : `<option${d.budget === "Under $1,000" ? " selected" : ""}>Under $1,000</option>`}
              <option${d.budget === "$1,000–$2,500" ? " selected" : ""}>$1,000–$2,500</option>
              <option${d.budget === "$2,500–$5,000" ? " selected" : ""}>$2,500–$5,000</option>
              <option${d.budget === "$5,000+" ? " selected" : ""}>$5,000+</option>
            </select></div>`}
          <div class="bk-field"><label for="fNotes">${isSession ? "Anything I should know? (optional)" : "Tell me about the project *"}</label>
            <textarea id="fNotes" name="notes" rows="4" maxlength="3000" ${isSession ? "" : "required"} placeholder="${isSession ? "Looks you want, references, questions…" : "What are we making? Goals, timeline, references…"}">${esc(d.notes)}</textarea></div>
          ${isStudio(state.svc) ? `
          <div class="bk-field"><label>Add-ons (no charge now — confirmed with you before your booking)</label>
            <label style="display:flex;gap:10px;align-items:flex-start;font-size:14.5px;color:var(--paper);cursor:pointer;margin-bottom:8px;">
              <input type="checkbox" name="addonLight" ${d.addonLight ? "checked" : ""} style="margin-top:3px;accent-color:var(--gold);">
              <span>Lighting kit rental</span>
            </label>
            <label style="display:flex;gap:10px;align-items:flex-start;font-size:14.5px;color:var(--paper);cursor:pointer;">
              <input type="checkbox" name="addonSmoke" ${d.addonSmoke ? "checked" : ""} style="margin-top:3px;accent-color:var(--gold);">
              <span>Smoke machine</span>
            </label>
            <p class="bk-note" style="margin-top:8px;">Bring your own cameras and gear — there are none on site.</p>
          </div>` : ""}
          <label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--smoke);cursor:pointer;">
            <input type="checkbox" name="subscribe" ${d.subscribe ? "checked" : ""} style="margin-top:3px;accent-color:var(--gold);">
            <span>Keep me in the loop — occasional studio news, new work, and open dates. No spam, unsubscribe anytime.</span>
          </label>
          <p class="bk-err" id="formErr" hidden></p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-gold">Review ${isSession ? "&amp; pay" : "&amp; send"} →</button>
            <button type="button" class="btn btn-ghost" id="backCal">← Back</button>
          </div>
        </form>
      </section>`;
    document.getElementById("backCal").addEventListener("click", renderCalendar);
    const f = document.getElementById("bkForm");
    // keep typed values even if the user steps back to re-check the calendar
    f.addEventListener("input", () => {
      state.details = {
        ...state.details,
        name: f.name.value, email: f.email.value, phone: f.phone.value,
        location: isSession ? f.location.value : state.details.location,
        company: isSession ? state.details.company : f.company.value,
        budget: isSession ? state.details.budget : f.budget.value,
        notes: f.notes.value,
        subscribe: f.subscribe.checked,
        addonLight: f.addonLight ? f.addonLight.checked : state.details.addonLight,
        addonSmoke: f.addonSmoke ? f.addonSmoke.checked : state.details.addonSmoke,
      };
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const err = document.getElementById("formErr");
      const email = f.email.value.trim();
      if (!f.name.value.trim()) return showErr(err, "Your name is required.", f.name);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr(err, "Enter a valid email — your confirmation goes there.", f.email);
      if (!isSession && !f.notes.value.trim()) return showErr(err, "Tell me a little about the project.", f.notes);
      state.details = {
        name: f.name.value.trim(), email, phone: f.phone.value.trim(),
        location: isSession ? f.location.value.trim() : "",
        company: isSession ? "" : f.company.value.trim(),
        budget: isSession ? "" : f.budget.value,
        notes: f.notes.value.trim(),
        subscribe: f.subscribe.checked,
        addonLight: f.addonLight ? f.addonLight.checked : false,
        addonSmoke: f.addonSmoke ? f.addonSmoke.checked : false,
      };
      renderConfirm();
    });
  }
  state.details = { name: "", email: "", phone: "", location: "", company: "", budget: "", notes: "" };
  function showErr(el, msg, field) {
    el.textContent = msg; el.hidden = false;
    if (field) {
      field.style.borderColor = "#ffb3a0";
      field.focus();
      field.addEventListener("input", () => { field.style.borderColor = ""; }, { once: true });
    }
  }

  /* ================================================================
     STEP 4 — confirm: pay (session) or send (project)
     ================================================================ */
  function renderConfirm() {
    setStep(4);
    const isSession = state.svc.kind === "session";
    const amount = amountFor(state.svc, state.slot);
    const addons = [state.details.addonLight && "Lighting kit", state.details.addonSmoke && "Smoke machine"].filter(Boolean);
    host.innerHTML = `
      <section aria-label="Confirm">
        <div class="bk-summary" style="max-width:560px;">
          <div class="row"><span>Service</span><b>${esc(state.svc.name)}</b></div>
          ${state.slot ? `<div class="row"><span>Date</span><b>${fmtLong(state.slot)}</b></div>
          <div class="row"><span>Time</span><b>${fmtTime(state.slot)} CT · ${fmtDur(state.svc.duration_min)}</b></div>` :
          `<div class="row"><span>Date</span><b>Flexible — we'll schedule together</b></div>`}
          <div class="row"><span>Name</span><b>${esc(state.details.name)}</b></div>
          <div class="row"><span>Email</span><b>${esc(state.details.email)}</b></div>
          ${addons.length ? `<div class="row"><span>Add-ons</span><b>${addons.join(" + ")} (confirmed with you)</b></div>` : ""}
          ${isSession ? `<div class="row" style="border-top:1px solid var(--line-d); padding-top:10px; margin-top:6px;"><span>${state.svc.deposit_cents ? "Deposit due now" : "Total due now"}${state.svc.weekend_price_cents != null && state.slot ? (isWeekendCT(state.slot) ? " (weekend rate)" : " (weekday rate)") : ""}</span><b>${money(amount)}</b></div>` :
          state.details.budget ? `<div class="row"><span>Budget</span><b>${esc(state.details.budget)}</b></div>` : ""}
        </div>
        <p class="bk-note" style="margin:16px 0 22px; max-width:56ch;">${isSession
          ? "Secure payment by Stripe. The moment it clears you'll get a confirmation email, a prep email before the shoot, and a reminder the day before."
          : "No payment now. Your inquiry goes straight to my pipeline — you'll get an acknowledgment email immediately and a personal reply with a quote within one business day."}</p>
        <p class="bk-err" id="payErr" hidden></p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-gold" id="goBtn">${isSession ? `Pay ${money(amount)} &amp; lock it in` : "Send my inquiry"}</button>
          <button class="btn btn-ghost" id="backDet">← Edit details</button>
        </div>
      </section>`;
    document.getElementById("backDet").addEventListener("click", renderDetails);
    document.getElementById("goBtn").addEventListener("click", isSession ? paySession : sendInquiry);
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
      const bkKey = `${state.svc.slug}|${state.slot}|${state.details.email}`;
      let bk = state.bkCache?.key === bkKey ? state.bkCache.bk : null;
      if (!bk) {
        const addons = [state.details.addonLight && "Lighting kit", state.details.addonSmoke && "Smoke machine"].filter(Boolean);
        const details = (addons.length ? `Add-ons requested: ${addons.join(", ")}\n\n` : "") + (state.details.notes || "");
        bk = await TM.rpc("bk_create_booking", {
          p_service: state.svc.slug,
          p_starts_at: state.slot,
          p_name: state.details.name,
          p_email: state.details.email,
          p_phone: state.details.phone || null,
          p_location: state.details.location || null,
          p_details: details.trim() || null,
        });
        state.bkCache = { key: bkKey, bk };
      }
      track("begin_checkout", { currency: "USD", value: bk.amount_cents / 100, service: state.svc.slug });
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

  async function sendInquiry() {
    if (state.submitting) return;
    state.submitting = true;
    const btn = document.getElementById("goBtn");
    const err = document.getElementById("payErr");
    btn.innerHTML = `<span class="spin"></span> Sending…`;
    try {
      const notes = `Service requested: ${state.svc.name}\n\n${state.details.notes}`;
      const res = await TM.rpc("bk_submit_inquiry", {
        p_name: state.details.name,
        p_email: state.details.email,
        p_service: state.svc.legacy_service,
        p_phone: state.details.phone || null,
        p_company: state.details.company || null,
        p_event_date: state.day || null,
        p_event_time: state.slot ? `${fmtTime(state.slot)} CT` : null,
        p_budget: state.details.budget || null,
        p_details: notes,
        p_source: "website",
      });
      track("generate_lead", { service: state.svc.slug });
      if (state.details.subscribe) {
        TM.rpc("bk_subscribe", { p_email: state.details.email, p_name: state.details.name, p_source: "inquiry" }).catch(() => {});
      }
      const portal = `${TM.PORTAL_BASE}/portal.html?p=${res.id}&t=${res.token}`;
      host.innerHTML = `
        <section aria-label="Inquiry sent" style="max-width:640px;">
          <p class="slate">INQUIRY RECEIVED</p>
          <h2 class="display" style="margin:14px 0 18px;">It's in my <span class="gold">pipeline.</span></h2>
          <p class="lede" style="color:var(--smoke);">Check your inbox — an acknowledgment email with your private portal link is on the way. I personally reply with next steps and a quote within one business day.</p>
          <div class="hero-ctas" style="margin-top:28px;">
            <a class="btn btn-gold" href="${portal}">Open your client portal</a>
            <a class="btn btn-ghost" href="../">← Back to the studio</a>
          </div>
        </section>`;
      setStep(4);
    } catch (e) {
      state.submitting = false;
      btn.innerHTML = "Try again";
      showErr(err, `Couldn't send (${e.message}). Try again, or DM @taylormade_creative.`);
    }
  }

  /* ================================================================
     boot
     ================================================================ */
  (async () => {
    try {
      state.services = await TM.rpc("bk_public_services", {});
      const params = new URLSearchParams(location.search);
      const want = params.get("service");
      // web-design tier deep links carry the buyer's choice through the funnel
      const TIERS = {
        landing: ["Tier interest: Ad Landing Page — $1,200", "$1,000–$2,500"],
        starter: ["Tier interest: Starter Business Website — $2,000", "$1,000–$2,500"],
        premium: ["Tier interest: Premium Business Website — $3,500", "$2,500–$5,000"],
        custom: ["Tier interest: Custom / Multi-Site — from $6,000", "$5,000+"],
      };
      const tier = TIERS[params.get("tier")];
      if (tier && want === "web-design") {
        state.details.notes = tier[0];
        state.details.budget = tier[1];
      }
      renderServices();
      if (want && state.services.some((s) => s.slug === want)) selectService(want);
      else if (location.hash === "#project") document.getElementById("project")?.scrollIntoView();
    } catch (e) {
      host.innerHTML = `<p class="bk-err">The booking system couldn't load (${esc(e.message)}). Refresh, or DM <a href="https://www.instagram.com/taylormade_creative/" style="color:var(--gold);text-decoration:underline;">@taylormade_creative</a>.</p>`;
    }
  })();
})();
