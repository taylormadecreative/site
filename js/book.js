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

  function setStep(n) {
    stepsBar.querySelectorAll("span").forEach((el) => {
      const s = +el.dataset.step;
      el.classList.toggle("on", s === n);
      el.classList.toggle("done", s < n);
    });
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
          s.kind === "session"
            ? `<b>${money(s.deposit_cents ?? s.price_cents)}</b> · ${s.deposit_cents ? "deposit locks your date" : "flat, paid at booking"} · ${s.duration_min} min`
            : `<b>Quoted per project</b> · reply within 1 business day`
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
        <p class="slate" style="margin-bottom:10px;">${esc(state.svc.name).toUpperCase()} · ${state.svc.duration_min} MIN${state.svc.kind === "project" ? " · PREFERRED DATE (OPTIONAL)" : ""}</p>
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
      drawGrid();
    } catch (e) {
      document.getElementById("cal").innerHTML = `<p class="bk-err">Couldn't load the calendar (${esc(e.message)}). Refresh to try again.</p>`;
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
      cells += `<span class="cal-day${open ? " open" : ""}${state.day === key ? " sel" : ""}" ${open ? `role="button" tabindex="0" data-day="${key}" aria-label="See times for ${key}"` : ""}>${d}</span>`;
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
      const pick = () => { state.day = el.dataset.day; state.slot = null; drawGrid(); drawSlots(); };
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
    document.getElementById("calNext").addEventListener("click", async () => {
      state.month = new Date(y, m + 1, 1); state.day = null; state.slot = null;
      cal.innerHTML = `<div class="spin" style="margin:40px auto;"></div>`;
      await fetchMonth(state.month); drawGrid(); drawSlots();
    });
    const prev = document.getElementById("calPrev");
    if (!prevDisabled) prev.addEventListener("click", async () => {
      state.month = new Date(y, m - 1, 1); state.day = null; state.slot = null;
      cal.innerHTML = `<div class="spin" style="margin:40px auto;"></div>`;
      await fetchMonth(state.month); drawGrid(); drawSlots();
    });
  }

  function drawSlots() {
    const box = document.getElementById("slots");
    if (!state.day) {
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
        el.addEventListener("click", () => { state.slot = el.dataset.iso; drawSlots(); }));
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
              <option${d.budget === "Under $1,000" ? " selected" : ""}>Under $1,000</option>
              <option${d.budget === "$1,000–$2,500" ? " selected" : ""}>$1,000–$2,500</option>
              <option${d.budget === "$2,500–$5,000" ? " selected" : ""}>$2,500–$5,000</option>
              <option${d.budget === "$5,000+" ? " selected" : ""}>$5,000+</option>
            </select></div>`}
          <div class="bk-field"><label for="fNotes">${isSession ? "Anything I should know? (optional)" : "Tell me about the project *"}</label>
            <textarea id="fNotes" name="notes" rows="4" maxlength="3000" ${isSession ? "" : "required"} placeholder="${isSession ? "Looks you want, references, questions…" : "What are we making? Goals, timeline, references…"}">${esc(d.notes)}</textarea></div>
          <p class="bk-err" id="formErr" hidden></p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button type="submit" class="btn btn-gold">Review ${isSession ? "&amp; pay" : "&amp; send"} →</button>
            <button type="button" class="btn btn-ghost" id="backCal">← Back</button>
          </div>
        </form>
      </section>`;
    document.getElementById("backCal").addEventListener("click", renderCalendar);
    document.getElementById("bkForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const err = document.getElementById("formErr");
      const email = f.email.value.trim();
      if (!f.name.value.trim()) return showErr(err, "Your name is required.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr(err, "Enter a valid email — your confirmation goes there.");
      if (!isSession && !f.notes.value.trim()) return showErr(err, "Tell me a little about the project.");
      state.details = {
        name: f.name.value.trim(), email, phone: f.phone.value.trim(),
        location: isSession ? f.location.value.trim() : "",
        company: isSession ? "" : f.company.value.trim(),
        budget: isSession ? "" : f.budget.value,
        notes: f.notes.value.trim(),
      };
      renderConfirm();
    });
  }
  state.details = { name: "", email: "", phone: "", location: "", company: "", budget: "", notes: "" };
  function showErr(el, msg) { el.textContent = msg; el.hidden = false; }

  /* ================================================================
     STEP 4 — confirm: pay (session) or send (project)
     ================================================================ */
  function renderConfirm() {
    setStep(4);
    const isSession = state.svc.kind === "session";
    const amount = state.svc.deposit_cents ?? state.svc.price_cents;
    host.innerHTML = `
      <section aria-label="Confirm">
        <div class="bk-summary" style="max-width:560px;">
          <div class="row"><span>Service</span><b>${esc(state.svc.name)}</b></div>
          ${state.slot ? `<div class="row"><span>Date</span><b>${fmtLong(state.slot)}</b></div>
          <div class="row"><span>Time</span><b>${fmtTime(state.slot)} CT · ${state.svc.duration_min} min</b></div>` :
          `<div class="row"><span>Date</span><b>Flexible — we'll schedule together</b></div>`}
          <div class="row"><span>Name</span><b>${esc(state.details.name)}</b></div>
          <div class="row"><span>Email</span><b>${esc(state.details.email)}</b></div>
          ${isSession ? `<div class="row" style="border-top:1px solid var(--line-d); padding-top:10px; margin-top:6px;"><span>${state.svc.deposit_cents ? "Deposit due now" : "Total due now"}</span><b>${money(amount)}</b></div>` :
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
      const bk = await TM.rpc("bk_create_booking", {
        p_service: state.svc.slug,
        p_starts_at: state.slot,
        p_name: state.details.name,
        p_email: state.details.email,
        p_phone: state.details.phone || null,
        p_location: state.details.location || null,
        p_details: state.details.notes || null,
      });
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
      const want = new URLSearchParams(location.search).get("service");
      renderServices();
      if (want && state.services.some((s) => s.slug === want)) selectService(want);
      else if (location.hash === "#project") document.getElementById("project")?.scrollIntoView();
    } catch (e) {
      host.innerHTML = `<p class="bk-err">The booking system couldn't load (${esc(e.message)}). Refresh, or DM <a href="https://www.instagram.com/taylormade_creative/" style="color:var(--gold);text-decoration:underline;">@taylormade_creative</a>.</p>`;
    }
  })();
})();
