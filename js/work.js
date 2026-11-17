/* Case study pages: the film players and the scrolling website preview. */
(function () {
  "use strict";

  // the gold play buttons, the pause button and the moving preview all wait for this
  document.documentElement.classList.add("wk-ready");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function track(name, params) {
    try { if (window.gtag) window.gtag("event", name, params); } catch (e) {}
  }

  /* ---------- films ----------
     The gold button starts a film. Until then the browser's own controls stay hidden so
     the two never sit on top of each other; once it plays, the browser's controls take over. */
  var films = [].slice.call(document.querySelectorAll(".wk-film"));
  var wide = window.matchMedia("(min-width: 1000px)");

  films.forEach(function (fig) {
    var v = fig.querySelector("video"), btn = fig.querySelector(".wk-play");
    if (!v || !btn) return;
    var sd = v.getAttribute("src"), started = false, fellBack = false;
    v.controls = false;

    function start() {
      if (!started) {
        started = true;
        if (wide.matches && v.dataset.hd) v.src = v.dataset.hd;   // the sharper file on big screens
        track("work_film_play", { film: fig.dataset.film });
      }
      v.controls = true;
      fig.classList.add("is-on");
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
      try { v.focus({ preventScroll: true }); } catch (e) {}
    }

    btn.addEventListener("click", start);
    v.addEventListener("play", function () {
      fig.classList.add("is-on");
      v.controls = true;
      films.forEach(function (o) {
        if (o === fig) return;
        var ov = o.querySelector("video");
        if (ov && !ov.paused) ov.pause();
      });
    });
    // if the sharper file fails, fall back to the standard one once
    v.addEventListener("error", function () {
      if (fellBack || v.getAttribute("src") === sd) return;
      fellBack = true;
      v.src = sd;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    });
  });

  /* ---------- the scrolling preview ---------- */
  [].forEach.call(document.querySelectorAll("[data-preview]"), function (box) {
    var btn = box.querySelector("[data-preview-ctl]");
    var label = box.querySelector("[data-preview-t]");
    var iPause = box.querySelector("[data-i-pause]"), iPlay = box.querySelector("[data-i-play]");
    if (btn && label && iPause && iPlay) {
      btn.addEventListener("click", function () {
        var paused = box.classList.toggle("is-paused");
        label.textContent = paused ? "Play the preview" : "Pause the preview";
        iPause.hidden = paused;
        iPlay.hidden = !paused;
      });
    }
    // while it moves on its own the frames are not scroll areas, so they leave the tab order
    if (!still) [].forEach.call(box.querySelectorAll("[data-preview-view]"), function (v) { v.removeAttribute("tabindex"); v.removeAttribute("role"); v.removeAttribute("aria-label"); });
    // off screen, the preview rests
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { box.classList.toggle("is-off", !en.isIntersecting); });
      }).observe(box);
    }
  });
})();
