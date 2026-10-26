/* iPhone Duo: draws one sprite video [inner 854 | outer 412, 600 tall] into three canvases (inner left half,
   inner right half, outer screen) and folds the phone. Playback, sound and pause belong to feed.js. */
(() => {
  const fig = document.querySelector("[data-duo]");
  if (!fig) return;
  const dev = fig.querySelector(".ipd");
  const v = fig.querySelector(".ipd__src");
  const btn = fig.querySelector("[data-duo-fold]");
  const cv = Object.fromEntries([...fig.querySelectorAll("canvas[data-duo-c]")].map((c) => [c.dataset.duoC, c]));
  const SRC = {il: [0, 427], ir: [427, 427], o: [854, 412]}; // x, width in the sprite
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const poster = new Image();
  let auto = !calm, timer = 0, inView = false, folding = 0;

  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    Object.values(cv).forEach((c) => {
      const r = c.getBoundingClientRect();
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    });
  };

  // cover-fit the sprite slice into each screen (the screens are a hair off the sprite ratio)
  const paint = (img) => {
    for (const k in cv) {
      const c = cv[k], [sx, sw] = SRC[k], ctx = c.getContext("2d");
      const sr = sw / 600, dr = c.width / c.height;
      let x = sx, w = sw, y = 0, h = 600;
      if (dr > sr) { h = sw / dr; y = (600 - h) / 2; } else { w = 600 * dr; x = sx + (sw - w) / 2; }
      try { ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height); } catch (e) { /* not ready yet */ }
    }
  };

  const loop = () => {
    if (v.readyState >= 2) paint(v);
    if (inView && (!v.paused || folding)) requestAnimationFrame(loop);
  };
  v.addEventListener("play", () => requestAnimationFrame(loop));
  v.addEventListener("seeked", () => { if (v.readyState >= 2) paint(v); });

  const set = (closed, byUser) => {
    if (byUser) { auto = false; clearTimeout(timer); }
    if (dev.classList.contains("is-closed") === closed) return;
    dev.classList.toggle("is-closed", closed);
    dev.classList.remove("is-folding"); void dev.offsetWidth; dev.classList.add("is-folding");
    folding++; requestAnimationFrame(loop);
    setTimeout(() => { folding--; dev.classList.remove("is-folding"); }, 1000);
    btn.classList.toggle("is-closed", closed);
    btn.setAttribute("aria-pressed", String(closed));
    btn.setAttribute("aria-label", closed ? "Open the iPhone Duo" : "Fold the iPhone Duo");
    if (window.gtag && byUser) window.gtag("event", "vp_duo_fold", {state: closed ? "folded" : "open"});
  };

  // auto-cycle while it plays on screen: open 7 s, folded 5 s, until the visitor takes over
  const cycle = () => {
    clearTimeout(timer);
    if (!auto || !inView || v.paused) return;
    const closed = dev.classList.contains("is-closed");
    timer = setTimeout(() => { set(!closed, false); cycle(); }, closed ? 5000 : 7000);
  };
  v.addEventListener("play", cycle);
  v.addEventListener("pause", () => clearTimeout(timer));
  btn.addEventListener("click", () => set(!dev.classList.contains("is-closed"), true));

  new IntersectionObserver((es) => es.forEach((e) => {
    inView = e.isIntersecting;
    if (inView) { size(); requestAnimationFrame(loop); cycle(); } else clearTimeout(timer);
  }), {threshold: 0.35}).observe(fig);

  addEventListener("resize", () => { size(); if (v.readyState >= 2) paint(v); else if (poster.complete) paint(poster); });
  poster.onload = () => { size(); if (v.readyState < 2) paint(poster); };
  poster.src = fig.dataset.poster;
})();
