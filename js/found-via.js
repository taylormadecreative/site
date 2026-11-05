/* found-via.js: where a visitor first came from, plus the optional
   "How did you find me?" question on the booking forms.

   The first outside source (referrer host or utm_source) is kept for 90 days in
   this browser only, so a ChatGPT visit today still counts if they book next
   week. Only a host name is stored. The answer rides along in the booking's
   notes, where it shows up in the Inbox; nothing here can block a booking. */
(function () {
  "use strict";
  var KEY = "tm-first-touch";
  var MAX_AGE = 90 * 24 * 60 * 60 * 1000;
  var OPTIONS = ["ChatGPT", "Claude", "Another AI app", "Google", "Instagram", "TikTok", "A friend or client", "Something else"];
  var GUESS = [
    [/(^|\.)(chatgpt\.com|openai\.com)$|^chatgpt$/, "ChatGPT"],
    [/(^|\.)(claude\.ai|anthropic\.com)$|^claude$/, "Claude"],
    [/(^|\.)(perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|meta\.ai|grok\.com)$|^(perplexity|gemini|copilot)$/, "Another AI app"],
    [/(^|\.)google(\.|$)/, "Google"],
    [/(^|\.)instagram(\.|$)|^ig$/, "Instagram"],
    [/(^|\.)tiktok(\.|$)/, "TikTok"]
  ];
  var memory = null;

  function clean(value) {
    return String(value || "").toLowerCase().replace(/^(www|l|lm|m)\./, "").replace(/[^a-z0-9._-]/g, "").slice(0, 80);
  }
  function read() {
    if (memory) return memory;
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.src && Date.now() - saved.at < MAX_AGE) return saved;
    } catch (_) { /* storage blocked or garbage: treat as a new visitor */ }
    return null;
  }
  function capture() {
    if (read()) return;
    var src = "";
    try { src = clean(new URLSearchParams(location.search).get("utm_source")); } catch (_) { /* no URLSearchParams */ }
    if (!src && document.referrer) {
      try {
        var host = new URL(document.referrer).hostname;
        if (!/(^|\.)(taylormadecreative\.net|stripe\.com)$/.test(host)) src = clean(host);
      } catch (_) { /* unreadable referrer */ }
    }
    if (!src) return;
    memory = { src: src, at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (_) { /* memory only */ }
  }
  function guess() {
    var seen = read();
    if (!seen) return "";
    for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(seen.src)) return GUESS[i][1];
    return "";
  }
  /* value undefined = they haven't touched it yet, so offer the best guess */
  function field(value) {
    var current = value === undefined ? guess() : value;
    var options = ['<option value="">Pick one</option>'].concat(OPTIONS.map(function (label) {
      return '<option value="' + label + '"' + (label === current ? " selected" : "") + ">" + label + "</option>";
    }));
    return '<div class="bk-field"><label for="fFound">How did you find me? (optional)</label>' +
      '<select id="fFound" name="foundVia">' + options.join("") + "</select></div>";
  }
  function note(value) {
    var seen = read();
    var picked = OPTIONS.indexOf(value) > -1 ? value : "";
    if (picked) return "Found me through: " + picked + (seen ? " (came from " + seen.src + ")" : "");
    return seen ? "Came from: " + seen.src : "";
  }
  /* adds the line to the booking notes and counts it in Analytics */
  function append(text, value) {
    var line = note(value);
    try {
      if (line && window.gtag) window.gtag("event", "found_via", { via: OPTIONS.indexOf(value) > -1 ? value : "not_answered", came_from: (read() || {}).src || "" });
    } catch (_) { /* analytics never blocks booking */ }
    return [text || "", line].filter(Boolean).join("\n\n");
  }

  capture();
  window.TMFound = { field: field, append: append, guess: guess };
})();
