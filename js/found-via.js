/* found-via.js: where a visitor came from, plus the optional
   "How did you find me?" question on the booking forms.

   The first and the latest outside source (referrer host or utm_source) are kept
   for 90 days in this browser only, so a ChatGPT visit today still counts if they
   book next week. Only a host name is stored. The question starts blank, so an
   answer is always the client's own words. Both ride along in the booking's
   notes, where they show up in the Inbox; nothing here can block a booking. */
(function () {
  "use strict";
  var KEY = "tm-first-touch";
  var MAX_AGE = 90 * 24 * 60 * 60 * 1000;
  var OPTIONS = ["ChatGPT", "Claude", "Another AI app", "Google", "Instagram", "TikTok", "Facebook", "A friend or client", "My agency", "Something else"];
  var memory = null;

  function clean(value) {
    return String(value || "").toLowerCase().replace(/^(www|l|lm|m)\./, "").replace(/[^a-z0-9._-]/g, "").slice(0, 80);
  }
  function read() {
    if (memory) return memory;
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.last && Date.now() - saved.at < MAX_AGE) return saved;
    } catch (_) { /* storage blocked or garbage: treat as a new visitor */ }
    return null;
  }
  function capture() {
    var src = "";
    try { src = clean(new URLSearchParams(location.search).get("utm_source")); } catch (_) { /* no URLSearchParams */ }
    if (!src && document.referrer) {
      try {
        var host = new URL(document.referrer).hostname;
        if (!/(^|\.)(taylormadecreative\.net|stripe\.com)$/.test(host)) src = clean(host);
      } catch (_) { /* unreadable referrer */ }
    }
    if (!src) return;
    var seen = read();
    memory = { first: seen ? seen.first : src, last: src, at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (_) { /* memory only */ }
  }
  /* value undefined or "" = no answer yet */
  function field(value) {
    var options = ['<option value="">Pick one</option>'].concat(OPTIONS.map(function (label) {
      return '<option value="' + label + '"' + (label === value ? " selected" : "") + ">" + label + "</option>";
    }));
    return '<div class="bk-field"><label for="fFound">How did you find me? (optional)</label>' +
      '<select id="fFound" name="foundVia">' + options.join("") + "</select></div>";
  }
  function note(value) {
    var seen = read();
    var lines = [];
    if (OPTIONS.indexOf(value) > -1) lines.push("They said they found me through: " + value);
    if (seen) lines.push("Came from: " + seen.last + (seen.first !== seen.last ? " (first visit: " + seen.first + ")" : ""));
    return lines.join("\n");
  }
  /* adds the lines to the booking notes and counts it in Analytics */
  function append(text, value) {
    var lines = note(value);
    try {
      if (lines && window.gtag) window.gtag("event", "found_via", { via: OPTIONS.indexOf(value) > -1 ? value : "not_answered", came_from: (read() || {}).last || "" });
    } catch (_) { /* analytics never blocks booking */ }
    return [text || "", lines].filter(Boolean).join("\n\n");
  }

  capture();
  window.TMFound = { field: field, append: append };
})();
