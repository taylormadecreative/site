/* TAYLORMADE/CREATIVE — headshots page behaviour (presentation only).
   Booking lives in js/headshots.js; nothing here touches the money path.

   Three jobs:
     1. build the proof band (the moving wall of real faces)
     2. run the "pick your three" demo of the deliverable
     3. reveal sections on scroll

   All motion is transform/opacity only, and every piece checks
   prefers-reduced-motion before it moves anything. */
(() => {
  const BASE = "../assets/img/headshots/";
  const N = 12;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pad = (n) => String(n).padStart(2, "0");
  const all = Array.from({ length: N }, (_, i) => pad(i + 1));

  /* ================================================================
     1. THE PROOF BAND
     Each row holds its image set TWICE and animates to translateX(-50%),
     so the halfway point lands exactly on the seam and the loop is
     invisible. One set therefore has to be at least as wide as the
     viewport, or a bald patch appears at the seam. Both rows draw from
     the same 12 files in different orders, so the browser downloads 12
     images and reuses them 48 times from cache.
     ================================================================ */
  function buildWall() {
    const rows = document.querySelectorAll("[data-wall]");
    if (!rows.length) return;

    // Two different orders so the rows never read as the same strip.
    // Both rows carry all twelve: one set at ~166px each is ~2000px, which
    // clears a 1920px viewport so the seam never shows a bald patch.
    // Two subjects appear twice in the set (hs-01/hs-05 and hs-07/hs-11).
    // Each order places its pair six slots apart, measured around the loop,
    // so the same face never turns up twice in one eyeful.
    const orders = {
      a: [0, 7, 2, 6, 11, 1, 4, 9, 3, 10, 5, 8],
      b: [6, 3, 9, 0, 5, 11, 10, 2, 7, 4, 1, 8],
    };

    rows.forEach((track) => {
      const order = orders[track.dataset.wall] || orders.a;
      const set = order.map((i) => all[i]);
      const html = set
        .map((id) => `<img src="${BASE}hs-${id}-xs.jpg" alt="" decoding="async" loading="lazy" draggable="false">`)
        .join("");
      // the set, twice
      track.innerHTML = html + html;
      if (reduced) track.style.animation = "none";
    });
  }

  /* ================================================================
     2. PICK YOUR THREE
     The deliverable is the confusing part of any photography offer, so
     the page lets people perform it instead of describing it. Selection
     is capped at three: attempting a fourth nudges rather than silently
     ignoring, because a control that does nothing reads as broken.
     ================================================================ */
  function buildPicker() {
    const grid = document.getElementById("pickGrid");
    const counter = document.getElementById("pickCounter");
    if (!grid || !counter) return;

    // the full set, reordered so the demo doesn't mirror the band above
    const ids = [2, 6, 9, 1, 11, 4, 7, 12, 3, 10, 5, 8].map((i) => pad(i));
    const chosen = [];

    grid.innerHTML = ids
      .map(
        (id, i) => `
      <button type="button" class="pick" data-id="${id}" aria-pressed="false">
        <img src="${BASE}hs-${id}-sm.jpg" alt="Headshot ${i + 1} of ${ids.length}" loading="lazy" decoding="async">
        <span class="pick-num" aria-hidden="true"></span>
      </button>`,
      )
      .join("");

    const buttons = [...grid.querySelectorAll(".pick")];

    function paint(msg) {
      buttons.forEach((b) => {
        const at = chosen.indexOf(b.dataset.id);
        b.setAttribute("aria-pressed", at > -1 ? "true" : "false");
        b.querySelector(".pick-num").textContent = at > -1 ? at + 1 : "";
      });
      if (msg) { counter.innerHTML = msg; return; }
      if (chosen.length === 0) {
        counter.innerHTML = `Tap any three <b>&rarr;</b>`;
      } else if (chosen.length < 3) {
        counter.innerHTML = `<b>${chosen.length}</b> of 3 chosen`;
      } else {
        counter.innerHTML = `<span class="done">That's your three.</span> On a real session these come back retouched within 48 hours.`;
      }
    }

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".pick");
      if (!btn) return;
      const id = btn.dataset.id;
      const at = chosen.indexOf(id);
      if (at > -1) {
        chosen.splice(at, 1);
        paint();
      } else if (chosen.length >= 3) {
        // say why nothing happened, then fall back to the real state
        paint(`<span class="done">Three is the deal.</span> Tap one to swap it out.`);
        setTimeout(paint, 2400);
      } else {
        chosen.push(id);
        paint();
      }
    });

    paint();
  }

  /* ================================================================
     3. SCROLL REVEAL
     Once each, then the observer lets go of the element.
     ================================================================ */
  function reveal() {
    const items = document.querySelectorAll(".hs-rise");
    if (!items.length) return;
    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    items.forEach((el) => io.observe(el));
  }

  buildWall();
  buildPicker();
  reveal();
})();
