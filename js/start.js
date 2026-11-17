/* start.js: the Start a project page.
   One form, two ways in. "Send a brief" and "Talk first" both end in the same place:
   bk_submit_inquiry, the RPC behind every project inquiry on the site, so the request
   lands in the studio pipeline and both the confirmation and the alert emails go out.
   The call picker reads real open times from bk_open_slots. A call is a REQUEST for
   that time (Nelson confirms by email, then phones); nothing is held on the calendar. */
(function () {
  "use strict";
  var TM = window.TM;
  var form = document.getElementById("stForm");
  if (!form || !TM) return;

  var TZ = "America/Chicago";
  // A one-hour quoted service: any start it returns has room for a 20-minute call.
  // If the "web-design" service is ever renamed or switched off in the studio admin,
  // point this at another quoted service or the picker will say the calendar didn't load.
  var CALL_PROBE = "web-design";
  var LEAD_DAYS = 2;               // first day offered: the day after tomorrow, so there is time to confirm
  var LEAD_MS = 36 * 3600000;      // and never less than a day and a half out
  var WINDOW_DAYS = 16;
  var MAX_DAYS = 8;
  var DRAFT = "tm-start-draft";
  var EMAIL = "taylormademd@gmail.com";
  var PHONE = "(817) 707-1291";
  var NEEDS = {
    video: "Commercial or brand film", corporate: "Corporate video or training series", photo: "Photography campaign",
    headshots: "Team headshots", web: "Website or app", ai: "AI video", training: "Workshop or team training",
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    name: $("stName"), email: $("stEmail"), company: $("stCompany"), role: $("stRole"), phone: $("stPhone"),
    phoneLabel: $("stPhoneLabel"), phoneOpt: $("stPhoneOpt"),
    timing: $("stTiming"), budget: $("stBudget"), notes: $("stNotes"), topic: $("stTopic"), site: $("stSite"),
    submit: $("stSubmit"), fail: $("stFail"), note: $("stSendNote"), picked: $("stPicked"),
    cal: $("stCal"), days: $("stDays"), times: $("stTimes"), calMsg: $("stCalMsg"), calNote: $("stCalNote"), slotErr: $("stSlotErr"),
    done: $("stDone"), doneH: $("stDoneH"), doneP: $("stDoneP"), doneWhen: $("stDoneWhen"), portal: $("stPortal"),
    step1: $("stStep1"), step1d: $("stStep1d"),
  };
  var label = els.submit.querySelector("[data-label]");
  var state = { mode: "brief", slots: null, byDay: {}, day: "", slot: "", sending: false, loading: false, cal: "idle" };
  var calm = function () { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };

  var track = function (name, params) { try { if (window.gtag) window.gtag("event", name, params); } catch (_) { /* analytics never blocks an inquiry */ } };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- dates, always in studio time ---------- */
  var fmt = function (opts) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, opts)); };
  var dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  var dayKey = function (d) { return dayKeyFmt.format(d); };                       // 2026-11-19
  var timeFmt = fmt({ hour: "numeric", minute: "2-digit" });
  var wdFmt = fmt({ weekday: "short" });
  var mdFmt = fmt({ month: "short", day: "numeric" });
  var longFmt = fmt({ weekday: "long", month: "long", day: "numeric" });
  var plusDays = function (n) { return dayKey(new Date(Date.now() + n * 86400000)); };
  var whenText = function (iso) { var d = new Date(iso); return longFmt.format(d) + " at " + timeFmt.format(d) + " Central"; };
  var onTheHour = function (iso) { return new Date(iso).getUTCMinutes() === 0; };  // Central sits a whole number of hours from UTC
  var bookable = function (iso) { var t = new Date(iso).getTime(); return !isNaN(t) && t > Date.now() + LEAD_MS; };
  /* the same moment on the visitor's own clock, when it differs from Dallas */
  function localText(iso) {
    try {
      var d = new Date(iso);
      var mineTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
      var mineDay = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      var sameDay = mineDay === dayKey(d);
      if (mineTime === timeFmt.format(d) && sameDay) return "";
      var opts = { hour: "numeric", minute: "2-digit", timeZoneName: "short" };
      if (!sameDay) opts.weekday = "long";
      return " That is " + new Intl.DateTimeFormat("en-US", opts).format(d) + " for you.";
    } catch (_) { return ""; }
  }

  /* ---------- errors ---------- */
  function setErr(input, errEl, msg) {
    if (!errEl) return;
    if (msg) { errEl.textContent = msg; errEl.hidden = false; if (input) input.setAttribute("aria-invalid", "true"); }
    else { errEl.textContent = ""; errEl.hidden = true; if (input) input.removeAttribute("aria-invalid"); }
  }
  var RULES = [
    { el: els.name, err: $("stNameErr"), test: function (v) { return v.length > 1 ? "" : "Add your name."; } },
    { el: els.email, err: $("stEmailErr"), test: function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v) ? "" : "Add an email like name@company.com."; } },
    { el: els.company, err: $("stCompanyErr"), test: function (v) { return v.length > 1 ? "" : "Add your company or brand."; } },
    { el: els.phone, err: $("stPhoneErr"), only: "call", test: function (v) { return v.replace(/\D/g, "").length >= 10 ? "" : "Add a phone number so I can call you."; } },
    { el: els.notes, err: $("stNotesErr"), only: "brief", test: function (v) { return v.length >= 12 ? "" : "Add a sentence or two about the project."; } },
  ];
  RULES.forEach(function (r) {
    // once a field has been flagged, clear the flag the moment it is fixed
    r.el.addEventListener("input", function () { if (r.el.getAttribute("aria-invalid")) setErr(r.el, r.err, r.test(r.el.value.trim())); });
  });
  function validate() {
    var first = null;
    RULES.forEach(function (r) {
      if (r.only && r.only !== state.mode) { setErr(r.el, r.err, ""); return; }
      var msg = r.test(r.el.value.trim());
      setErr(r.el, r.err, msg);
      if (msg && !first) first = r.el;
    });
    var slotMsg = "";
    if (state.mode === "call") {
      if (state.loading) slotMsg = "The open times are still loading.";
      else if (state.cal !== "ready") slotMsg = "There is no time to request yet.";
      else if (!state.slot) slotMsg = "Pick a time.";
      else if (!bookable(state.slot)) { slotMsg = "That time is now too close. Pick a later one."; state.slot = ""; showPicked(); }
      if (slotMsg && !first) first = els.times.querySelector("input:checked") || els.times.querySelector("input") || els.days.querySelector("input") || els.cal;
    }
    setErr(null, els.slotErr, slotMsg);
    if (first) {
      if (first.focus) first.focus({ preventScroll: true });
      first.scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" });
    }
    return !first;
  }

  /* ---------- the two ways in ---------- */
  function syncSend() {
    var call = state.mode === "call";
    // with no calendar there is nothing to request, so the button steps aside for the way out
    var stuck = call && (state.cal === "error" || state.cal === "empty");
    els.submit.hidden = stuck; els.note.hidden = stuck; els.calNote.hidden = stuck;
    if (!state.sending) label.textContent = call ? "Request this time" : "Send the brief";
    els.note.textContent = call
      ? "This is a request. I confirm by email, then call you at that time."
      : "Goes straight to me. No newsletter, no sales team.";
    els.phoneLabel.textContent = call ? "Phone, so I can call you" : "Phone";
    els.phoneOpt.hidden = call;
    els.phone.required = call;
    if (!call) setErr(els.phone, $("stPhoneErr"), "");
    showPicked();
  }
  function setMode(mode, opts) {
    state.mode = mode === "call" ? "call" : "brief";
    var radio = form.querySelector('input[name="mode"][value="' + state.mode + '"]');
    if (radio && !radio.checked) radio.checked = true;
    [].forEach.call(form.querySelectorAll("[data-only]"), function (box) {
      var on = box.getAttribute("data-only") === state.mode;
      box.hidden = !on;
      if (on && !(opts && opts.quiet)) { box.classList.remove("is-swap"); void box.offsetWidth; box.classList.add("is-swap"); }
    });
    els.fail.hidden = true;
    setErr(null, els.slotErr, "");
    syncSend();
    if (state.mode === "call" && !state.slots && !state.loading) loadSlots();
    if (!(opts && opts.quiet)) saveDraft();   // the first paint saves nothing: a box ticked by a link is not the visitor's choice yet
  }
  function toSwitch() {
    var box = form.querySelector(".st-mode");
    if (box) box.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
  }
  [].forEach.call(form.querySelectorAll('input[name="mode"]'), function (r) {
    r.addEventListener("change", function () { if (r.checked) setMode(r.value); });
  });
  [].forEach.call(document.querySelectorAll("[data-go-call]"), function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); setMode("call"); toSwitch(); });
  });

  /* ---------- the call picker ---------- */
  function calState(s, html) {
    state.cal = s;
    els.cal.setAttribute("data-state", s);
    els.calMsg.innerHTML = html || "";
    var out = els.calMsg.querySelector("[data-to-brief]");
    if (out) out.addEventListener("click", function () { setMode("brief"); var n = els.notes; if (n) n.focus({ preventScroll: true }); toSwitch(); });
    var retry = els.calMsg.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", loadSlots);
    syncSend();
  }
  function directLine() {
    return '<a href="mailto:' + EMAIL + '">' + EMAIL + '</a> or <a href="tel:+18177071291">' + PHONE + "</a>";
  }
  function showPicked() {
    var on = state.mode === "call" && state.cal === "ready" && state.slot;
    els.picked.hidden = !on;
    els.picked.textContent = on ? "Requesting " + whenText(state.slot) + "." + localText(state.slot) : "";
  }
  function noCalendar(kind) {
    state.loading = false; state.slots = null; state.byDay = {}; state.day = ""; state.slot = "";
    els.days.innerHTML = ""; els.times.innerHTML = "";
    var way = ' <button type="button" class="st-out" data-to-brief>Send a brief instead</button>';
    if (kind === "empty") calState("empty", "There are no open call times in the next two weeks. Send a brief and I’ll reply with a time, or reach me at " + directLine() + "." + way);
    else calState("error", "The calendar didn’t load. " + '<button type="button" class="st-out st-out--quiet" data-retry>Try again</button>' + " or reach me at " + directLine() + "." + way);
  }
  function loadSlots() {
    state.loading = true;
    els.days.innerHTML = ""; els.times.innerHTML = "";
    calState("loading", '<span class="sr-only">Loading open times</span>');
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; noCalendar("error"); } }, 15000);
    TM.rpc("bk_open_slots", { p_service: CALL_PROBE, p_from: plusDays(LEAD_DAYS), p_to: plusDays(WINDOW_DAYS) })
      .then(function (res) {
        if (done) return; done = true; clearTimeout(timer);
        state.loading = false;
        state.slots = ((res && res.slots) || []).filter(function (iso) { return bookable(iso) && onTheHour(iso); });
        state.byDay = {};
        state.slots.forEach(function (iso) { var k = dayKey(new Date(iso)); (state.byDay[k] = state.byDay[k] || []).push(iso); });
        var keys = Object.keys(state.byDay).sort().slice(0, MAX_DAYS);
        if (!keys.length) { noCalendar("empty"); return; }
        calState("ready");
        renderDays(keys);
        pickDay(state.day && state.byDay[state.day] ? state.day : keys[0], true);
      })
      .catch(function () { if (done) return; done = true; clearTimeout(timer); noCalendar("error"); });
  }
  function renderDays(keys) {
    els.days.innerHTML = keys.map(function (k) {
      var d = new Date(state.byDay[k][0]);
      return '<label class="st-pick st-pick--day"><input type="radio" name="callDay" value="' + k + '"><span><small>' + esc(wdFmt.format(d)) + "</small>" + esc(mdFmt.format(d)) + "</span></label>";
    }).join("");
  }
  function pickDay(k, quiet) {
    state.day = k;
    var r = els.days.querySelector('input[value="' + k + '"]');
    if (r) r.checked = true;
    var keep = state.slot && state.byDay[k].indexOf(state.slot) > -1 ? state.slot : "";
    state.slot = keep;
    els.times.innerHTML = state.byDay[k].map(function (iso) {
      return '<label class="st-pick"><input type="radio" name="callSlot" value="' + iso + '"' + (iso === keep ? " checked" : "") + "><span>" + esc(timeFmt.format(new Date(iso))) + "</span></label>";
    }).join("");
    showPicked();
    if (!quiet) saveDraft();
  }
  els.days.addEventListener("change", function (e) { if (e.target.name === "callDay") { pickDay(e.target.value); setErr(null, els.slotErr, ""); } });
  els.times.addEventListener("change", function (e) {
    if (e.target.name !== "callSlot") return;
    state.slot = e.target.value;
    setErr(null, els.slotErr, "");
    showPicked();
    saveDraft();
  });

  /* ---------- keep a half-written brief through a reload ---------- */
  function needs() { return [].map.call(form.querySelectorAll('input[name="need"]:checked'), function (c) { return c.value; }); }
  function tick(value) {
    var c = [].filter.call(form.querySelectorAll('input[name="need"]'), function (i) { return i.value === value; })[0];
    if (c) c.checked = true;
  }
  function saveDraft() {
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({
        mode: state.mode, name: els.name.value, email: els.email.value, company: els.company.value, role: els.role.value, phone: els.phone.value,
        timing: els.timing.value, budget: els.budget.value, notes: els.notes.value, topic: els.topic.value, needs: needs(), day: state.day, slot: state.slot,
      }));
    } catch (_) { /* private mode: the form still works */ }
  }
  function loadDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem(DRAFT));
      if (!d) return null;
      ["name", "email", "company", "role", "phone", "notes", "topic"].forEach(function (k) { if (d[k]) els[k].value = d[k]; });
      if (d.timing) els.timing.value = d.timing;
      if (d.budget) els.budget.value = d.budget;
      (d.needs || []).forEach(tick);
      state.day = d.day || ""; state.slot = d.slot && bookable(d.slot) ? d.slot : "";
      return d;
    } catch (_) { return null; }
  }
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);

  /* ---------- send ---------- */
  function serviceFor(list) {
    var has = function (re) { return list.some(function (n) { return re.test(n); }); };
    if (has(/film|video/i)) return "brand_content";
    if (has(/photo|headshot/i)) return "photography";
    return "other";
  }
  function budgetValue() { var b = els.budget.value; return b && b !== "Not sure yet" ? b : ""; }
  function details(flagged) {
    var role = els.role.value.trim(), list = needs(), notes = els.notes.value.trim(), lines = [];
    if (flagged) lines.push("[The hidden anti-spam field was filled in: this may be a bot.]", "");
    if (state.mode === "call") {
      lines.push("CALL REQUEST (20 minutes): " + whenText(state.slot));
      lines.push("Call them at: " + els.phone.value.trim());
      lines.push("From the Start a project page. Not on the calendar yet: confirm by email.");
      if (role) lines.push("Role: " + role);
      var topic = els.topic.value.trim();
      if (topic) lines.push("", "They want to cover:", topic);
      // anything they had already filled in on the brief side rides along
      var extra = [];
      if (list.length) extra.push("Needs: " + list.join(", "));
      if (els.timing.value) extra.push("Timing: " + els.timing.value);
      if (budgetValue()) extra.push("Budget: " + budgetValue());
      if (notes) extra.push("", notes);
      if (extra.length) lines = lines.concat(["", "Also on their brief:"], extra);
    } else {
      lines.push("PROJECT BRIEF from the Start a project page");
      if (list.length) lines.push("Needs: " + list.join(", "));
      if (els.timing.value) lines.push("Timing: " + els.timing.value);
      if (role) lines.push("Role: " + role);
      lines.push("", notes);
    }
    var text = lines.join("\n");
    return window.TMFound ? window.TMFound.append(text, "") : text;
  }
  function busy(on) {
    state.sending = on;
    els.submit.setAttribute("aria-busy", on ? "true" : "false");
    label.textContent = on ? "Sending…" : (state.mode === "call" ? "Request this time" : "Send the brief");
  }
  function showFail(msg) {
    els.fail.innerHTML = esc(msg) + " You can also reach me at " + directLine() + ".";
    els.fail.hidden = false;
  }
  function showDone(res, wasCall, slot) {
    var first = els.name.value.trim().split(/\s+/)[0] || "";
    var email = els.email.value.trim();
    var thanks = "Thanks" + (first ? ", " + first : "") + ". ";
    els.doneH.textContent = wasCall ? "Time requested." : "It’s in.";
    if (wasCall) {
      els.doneWhen.textContent = whenText(slot);
      els.doneWhen.hidden = false;
      els.doneP.textContent = thanks + "I’ll confirm this time by email, then call you at " + els.phone.value.trim() + ". A receipt of your request is on its way to " + email + ".";
      if (els.step1) els.step1.textContent = "I confirm the time by email.";
      if (els.step1d) els.step1d.textContent = "Then I call you at the time you picked.";
    } else {
      els.doneWhen.hidden = true;
      els.doneP.textContent = thanks + "A confirmation is on its way to " + email + ", and I’ll reply within one business day.";
    }
    if (res && res.id && res.token) {
      els.portal.href = TM.PORTAL_BASE + "/portal.html?p=" + encodeURIComponent(res.id) + "&t=" + encodeURIComponent(res.token);
      els.portal.firstChild.nodeValue = (wasCall ? "See your request" : "Open your client portal") + " ";
      els.portal.hidden = false;
    }
    form.hidden = true;
    var sec = document.getElementById("brief");
    if (sec) sec.classList.add("is-done");
    els.done.hidden = false;
    els.done.classList.add("is-in");
    els.done.focus({ preventScroll: true });
    if (sec) sec.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
    try { sessionStorage.removeItem(DRAFT); } catch (_) { /* nothing saved */ }
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.sending) return;
    els.fail.hidden = true;
    if (!validate()) return;
    var wasCall = state.mode === "call", slot = state.slot;
    if (wasCall && !slot) return;
    var list = needs();
    var args = {
      p_name: els.name.value.trim(),
      p_email: els.email.value.trim(),
      p_service: serviceFor(list),
      p_phone: els.phone.value.trim() || null,
      p_company: els.company.value.trim() || null,
      p_event_date: wasCall ? dayKey(new Date(slot)) : null,
      p_event_time: wasCall ? timeFmt.format(new Date(slot)) + " CT, 20-minute call request" : null,
      p_budget: (wasCall ? budgetValue() : els.budget.value) || null,
      p_details: details(!!els.site.value),
      p_source: "website",
    };
    busy(true);
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return; settled = true; busy(false);
      showFail("This is taking a while. Check your inbox for a confirmation before sending again.");
    }, 45000);
    TM.rpc("bk_submit_inquiry", args).then(function (res) {
      if (settled) return; settled = true; clearTimeout(timer);
      track("generate_lead", { service: "start", lead_mode: state.mode, project_type: (list.join("|") || "none").slice(0, 90), lead_budget: wasCall ? "call" : (els.budget.value || "none") });
      busy(false);
      showDone(res, wasCall, slot);
    }).catch(function (err) {
      if (settled) return; settled = true; clearTimeout(timer);
      busy(false);
      var m = String((err && err.message) || "");
      if (/valid email/i.test(m)) { setErr(els.email, $("stEmailErr"), "Add an email like name@company.com."); els.email.focus(); return; }
      showFail(/fetch|network|load failed/i.test(m) ? "That didn’t send. Check your connection and try again." : "That didn’t send. Try again in a moment.");
    });
  });

  /* ---------- first paint ---------- */
  var draft = loadDraft();
  var q = null;
  try { q = new URLSearchParams(location.search); } catch (_) { /* old browser */ }
  var need = q && NEEDS[q.get("need") || ""];
  if (need) tick(need);
  var asked = (q && q.get("mode") === "call") || location.hash === "#call";
  setMode(asked ? "call" : (draft && draft.mode) || "brief", { quiet: true });
  if (asked) {
    var jump = function () { var box = form.querySelector(".st-mode"); if (box) box.scrollIntoView({ block: "start" }); };
    if (document.readyState === "complete") jump(); else window.addEventListener("load", jump);
  }
})();
