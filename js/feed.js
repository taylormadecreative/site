/* "In the feed": two muted loops that play while on screen. A speaker (or a tap on the video) gives one ad the sound,
   and only one ad has sound at a time. Each ad also has a pause, which the scroll observer respects. */
(() => {
  const root = document.querySelector("[data-feed]");
  if (!root) return;
  const conn = navigator.connection || {};
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || conn.saveData;
  const units = [...root.querySelectorAll("[data-feed-unit]")].map((el) => ({
    el,
    v: el.querySelector("video"),
    btn: el.querySelector("[data-feed-sound]"),
    tap: el.querySelector(".ig-tap"),
    hold: el.querySelector("[data-feed-pause]"),
    name: el.dataset.feedUnit,
    title: el.dataset.title,
    held: calm, // reduced motion / Save-Data: nothing moves until asked
    inView: false,
  }));

  const load = (u) => { if (!u.v.getAttribute("src") && u.v.dataset.src) u.v.src = u.v.dataset.src; };
  const play = (u) => { load(u); const p = u.v.play(); if (p && p.catch) p.catch(() => {}); };

  const paint = (u) => {
    const on = !u.v.muted;
    const label = `${on ? "Mute" : "Play with sound:"} ${u.title}`;
    u.btn.classList.toggle("is-on", on);
    u.btn.setAttribute("aria-pressed", String(on));
    u.btn.setAttribute("aria-label", label);
    if (u.tap && !u.tap.hasAttribute("aria-hidden")) { u.tap.setAttribute("aria-pressed", String(on)); u.tap.setAttribute("aria-label", label); }
    if (u.hold) {
      u.hold.classList.toggle("is-paused", u.held);
      u.hold.setAttribute("aria-label", `${u.held ? "Play" : "Pause"} the ${u.title}`);
    }
  };

  const sound = (u) => {
    const turnOn = u.v.muted;
    units.forEach((o) => { if (o !== u && !o.v.muted) { o.v.muted = true; paint(o); } });
    u.v.muted = !turnOn;
    if (turnOn) {
      u.held = false;
      u.v.currentTime = 0;
      play(u);
      root.classList.add("is-heard");
      if (window.gtag) window.gtag("event", "vp_feed_sound", {ad: u.name});
    }
    paint(u);
    const reel = u.el.querySelector(".ig-reel");
    if (reel) { reel.classList.add("is-flash"); clearTimeout(u.flash); u.flash = setTimeout(() => reel.classList.remove("is-flash"), 900); }
  };

  const pause = (u) => {
    u.held = !u.held;
    if (u.held) u.v.pause();
    else if (u.inView) play(u);
    paint(u);
  };

  units.forEach((u) => {
    u.btn.addEventListener("click", () => sound(u));
    if (u.tap) u.tap.addEventListener("click", () => sound(u));
    if (u.hold) u.hold.addEventListener("click", () => pause(u));
    // the "Tap for sound" hint steps away after a few seconds of play, so it never sits on the end card
    u.v.addEventListener("timeupdate", () => { if (u.v.currentTime > 6) u.el.classList.add("is-hinted"); });
    paint(u);
  });

  // Play while at least a third is on screen (unless paused by the visitor); pause when it leaves.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const u = units.find((x) => x.el === e.target);
      if (!u) return;
      u.inView = e.isIntersecting;
      if (u.inView && !u.held) play(u);
      else if (!u.inView) u.v.pause();
    });
  }, {threshold: 0.35});
  units.forEach((u) => io.observe(u.el));
})();
