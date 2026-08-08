/* sale.js — 24-hour J3 Productions birthday sale (2026-08-07).
   Static-site time gate: the sale bar + booking hint ship in the page markup
   as [hidden] and this script reveals them only inside the sale window, so no
   deploy has to happen at 7pm and the promo disappears by itself.
   Window: 2026-08-07 7:00pm CT → 2026-08-08 7:00pm CT
   (CDT is UTC-5, so 2026-08-08T00:00:00Z → 2026-08-09T00:00:00Z). */
(function () {
  "use strict";
  var START = 1786147200000;
  var END = 1786233600000;

  function reveal(on) {
    ["saleBar", "saleHint"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = !on;
    });
    // the site nav is position:fixed at top — pin the bar directly beneath it
    // so the sale (and its countdown) stays on screen while scrolling
    var bar = document.getElementById("saleBar");
    if (bar && on) {
      var place = function () {
        var nav = document.querySelector(".nav");
        bar.style.top = (nav ? nav.getBoundingClientRect().height : 0) + "px";
      };
      place();
      addEventListener("resize", place);
    }
  }

  var now = Date.now();
  if (now < START || now >= END) return; // dormant — nothing shows

  reveal(true);

  var slots = document.querySelectorAll("[data-sale-countdown]");
  if (!slots.length) return;
  var timer = null;

  function tick() {
    var left = END - Date.now();
    if (left <= 0) {
      reveal(false); // sale just ended mid-visit — take it down live
      if (timer) clearInterval(timer);
      return;
    }
    var h = Math.floor(left / 3600000);
    var m = Math.floor((left % 3600000) / 60000);
    var s = Math.floor((left % 60000) / 1000);
    var txt = "ends in " + h + "h " +
      (m < 10 ? "0" : "") + m + "m " +
      (s < 10 ? "0" : "") + s + "s";
    slots.forEach(function (el) { el.textContent = txt; });
  }

  tick();
  timer = setInterval(tick, 1000);
})();
