/* TAYLORMADE PODCAST · the Mac app's page
   The live examples come from two real takes recorded with the app: Nelson's solo promo
   ("Tonight at 7") and Auntie PB's first episode (two people, two cameras). For Auntie PB:
   the app's video with a cut strip that follows it, the two cameras lit by the app's real
   cuts, and moments from the episode as we finished it. For "Tonight at 7":
   clips that play only while on screen, the podcast audio with its waveform, the
   transcript lighting up word by word, the voice steps, the prompter, the 16:9 to 9:16
   turn and the camera switch. Plus the download counter, the beta's version from
   latest.json, and "send this page to my Mac". Shared motion lives in home.js. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = !!navigator.connection?.saveData;
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  /* runs `tick` every `ms` only while `el` is on screen (and never with reduced motion) */
  const whileSeen = (el, ms, tick) => {
    if (!el || reduced) return;
    let id = 0;
    new IntersectionObserver(([e]) => {
      clearInterval(id);
      if (e.isIntersecting) id = setInterval(tick, ms);
    }, { threshold: 0.35 }).observe(el);
  };

  /* big screens with sharp displays get the 1080p cut of the episode video */
  if (matchMedia("(min-width: 1000px) and (min-resolution: 1.5dppx)").matches) {
    $$("video[data-src-hd]").forEach((v) => { v.dataset.src = v.dataset.srcHd; });
  }

  /* ---------- clips: muted loops that load and play only while on screen ---------- */
  $$("[data-play]").forEach((box) => {
    const v = $("video", box);
    if (!v || reduced || saveData) return;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (box.dataset.held) return;
        if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); }
        v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    }, { threshold: 0.25 }).observe(box);
  });

  /* ---------- 09 prompter: the lines move up as you read, then Keep / Retake / Next ---------- */
  const pr = $("[data-prompt]");
  if (pr) {
    const rl = $("[data-roll]", pr), ps = $$("p", rl), acts = $$(".pa-pill", pr);
    let i = 0;
    const show = () => {
      const reading = i < ps.length;
      ps.forEach((p, k) => p.classList.toggle("on", reading && k === i));
      const at = ps[Math.min(i, ps.length - 1)];
      rl.style.transform = `translateY(${-(at.offsetTop - 120)}px)`;
      acts.forEach((a) => a.classList.toggle("pa-pill--on", !reading && a.dataset.act === "keep"));
    };
    show();
    whileSeen(pr, 1900, () => { i = (i + 1) % (ps.length + 2); show(); });
  }

  /* ---------- 10 vertical: the show turns tall ---------- */
  const shape = $("[data-shape]");
  if (shape) {
    const badge = $("[data-badge]", shape);
    whileSeen(shape, 3200, () => {
      const tall = !shape.classList.contains("is-tall");
      shape.classList.toggle("is-tall", tall);
      badge.textContent = tall ? "Vertical 9:16" : "Wide 16:9";
    });
  }

  /* ---------- Auntie PB: strips that follow a video ----------
     The episode band: 13 seconds of the app's video, its blocks the app's real cuts.
     The finished band: six moments from the edited episode; the lit one fills as it plays.
     The playhead and the lit block follow the video's own clock; a click jumps there. */
  $$("[data-zoom]").forEach((z) => {
    const v = $(z.dataset.zoom);
    if (!v) return;
    const len = +z.dataset.len;
    const blocks = $$(".pa-cuts__b", z);
    const label = $("[data-now-label]", z.parentElement);
    let raf = 0;
    const paint = () => {
      const t = Math.min(v.currentTime, len - 0.001);
      z.style.setProperty("--t", (t / len).toFixed(4));
      const on = blocks.find((b) => t >= +b.dataset.s && t < +b.dataset.e) || blocks[0];
      blocks.forEach((b) => b.classList.toggle("on", b === on));
      if (label) { const name = $("b", on).textContent; if (label.textContent !== name) label.textContent = name; }
      on.style.setProperty("--p", ((t - on.dataset.s) / (on.dataset.e - on.dataset.s)).toFixed(3));
      if (!v.paused) raf = requestAnimationFrame(paint);
    };
    v.addEventListener("play", () => { cancelAnimationFrame(raf); paint(); });
    v.addEventListener("seeked", paint);
    v.addEventListener("pause", () => cancelAnimationFrame(raf));
    blocks.forEach((b) => b.addEventListener("click", () => {
      if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); }
      v.currentTime = +b.dataset.s + 0.02;
      paint();
    }));
    paint();
  });

  /* the episode video's controls: pause / play, and "Hear it" (sound on starts it from the top) */
  $$(".pa-ep__film").forEach((fig) => {
    const v = fig.dataset.video ? $(fig.dataset.video) : $("video", fig);
    const pause = $("[data-pause]", fig);
    const sound = $("[data-sound]", fig);
    const load = () => { if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); } };
    const sync = () => {
      pause.classList.toggle("is-paused", v.paused);
      $(".sr-only", pause).textContent = v.paused ? "Play the video" : "Pause the video";
      sound.classList.toggle("is-on", !v.muted);
      $(".pa-ep__btn-t", sound).textContent = v.muted ? "Hear it" : "Mute";
    };
    // a visitor's pause sticks: scrolling back doesn't restart it
    pause.addEventListener("click", () => {
      load();
      if (v.paused) { fig.dataset.held = ""; delete fig.dataset.held; v.play().catch(() => {}); }
      else { fig.dataset.held = "1"; v.pause(); }
    });
    sound.addEventListener("click", () => {
      load();
      v.muted = !v.muted;
      // the app's 13 seconds restart for sound; the finished cut keeps its place (a visitor may have jumped to a moment)
      if (!v.muted) { delete fig.dataset.held; if (!fig.classList.contains("pa-fin__film")) v.currentTime = 0; v.play().catch(() => {}); }
      sync();
    });
    ["play", "pause", "volumechange"].forEach((e) => v.addEventListener(e, sync));
    sync();
  });

  /* ---------- Auto-switch: the app's Record screen, live ----------
     The program video is the show; the feeds video holds the three cameras side by side and is
     drawn into the three tiles, so they can never drift apart. Which tile is on the show, the
     chip, both mic meters and the REC clock all follow the program's own clock and the app's
     real cut list and mic data (pa-auto-data). On desktop the section pins and the view moves
     into the cameras, then the mics, then pulls back, as you scroll. */
  const auto = $("[data-auto]");
  if (auto) {
    let data = null;
    try { data = JSON.parse($("#pa-auto-data").textContent); } catch (_) {}
    const prog = $("#pa-auto-prog"), feeds = $("#pa-auto-feeds");
    const ctrls = $("[data-auto-ctrls]");
    const tiles = $$(".tmw__tile", auto);
    const cv = tiles.map((t) => $("canvas", t)), cx = cv.map((c) => c.getContext("2d"));
    const chip = $("[data-layout]", auto), clock = $("[data-rec-time]", auto), now = $("[data-now]", auto);
    const mics = { host: $('[data-who="host"]', auto), guest: $('[data-who="guest"]', auto) };
    const CAM = { wide: 0, host: 1, guest: 2 };
    // what's on the show, read together with who is talking (the director's own talking flags), so the
    // line never says one thing while the meters show another
    const WHO = { host: '<b class="ho">The host</b>', guest: '<b class="gu">The guest</b>' };
    const say = (cam, h, g) => {
      if (cam === "wide") return "After 16 seconds on one close-up, it shows the room for a moment.";
      const other = cam === "host" ? "guest" : "host";
      const me = cam === "host" ? h : g, them = cam === "host" ? g : h;
      if (me && them) return "Both talking. A short overlap doesn't move the shot.";
      if (them) return `${WHO[other]} starts talking. It cuts once she's talked for 0.7 seconds and this shot has had its 2.5.`;
      if (me) return `${WHO[cam]} is talking, so her close-up is on the show.`;
      return "A pause. The shot holds; 3 seconds of quiet would show the room.";
    };
    let shown = "", line = "", pend = "", pendAt = 0;
    const draw = () => {
      if (feeds.readyState < 2) return;
      const w = feeds.videoWidth / 3, h = feeds.videoHeight;
      cv.forEach((c, i) => { if (c.width !== w) { c.width = w; c.height = h; } cx[i].drawImage(feeds, i * w, 0, w, h, 0, 0, w, h); });
    };
    const paint = () => {
      const t = prog.currentTime;
      if (data) {
        let cam = data.cuts[0][1];
        for (const [at, c] of data.cuts) if (t >= at) cam = c;
        if (cam !== shown) {
          const first = !shown;
          shown = cam;
          tiles.forEach((tile, i) => { tile.classList.toggle("is-on", i === CAM[cam]); tile.classList.remove("go"); });
          if (!first && !reduced) { const tl = tiles[CAM[cam]]; void tl.offsetWidth; tl.classList.add("go"); }
          chip.textContent = `Cam ${CAM[cam] + 1}`;
        }
        const i = Math.min(data.host.m.length - 1, Math.max(0, Math.round(t * 10)));
        // the line changes only after a state has held 0.4 s (or at once on a cut), so it doesn't flicker
        const next = say(cam, !!data.host.on[i], !!data.guest.on[i]);
        if (next !== pend) { pend = next; pendAt = t; }
        if (pend !== line && (t - pendAt >= 0.4 || t < pendAt || line === "" || next.startsWith("After") || (now.dataset.cam !== cam))) { line = pend; now.innerHTML = line; now.dataset.cam = cam; }
        for (const who of ["host", "guest"]) {
          const m = mics[who], d = data[who];
          m.style.setProperty("--m", d.m[i]);
          $(".tmw__meter", m).classList.toggle("loud", d.m[i] > 0.8);
          const talk = !!d.on[i];
          if (m.classList.contains("talk") !== talk) { m.classList.toggle("talk", talk); $("em", m).textContent = talk ? "Talking" : "Ready"; }
          $(".tmw__meter i", m).style.width = `${(d.m[i] * 100).toFixed(1)}%`;
        }
        const s = Math.floor(data.t0 + t);
        clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }
      if (!feeds.paused && Math.abs(feeds.currentTime - t) > 0.1) feeds.currentTime = t;
      draw();
    };
    let raf = 0;
    const loop = () => { paint(); if (!prog.paused) raf = requestAnimationFrame(loop); };
    prog.addEventListener("play", () => { if (feeds.getAttribute("src")) feeds.play().catch(() => {}); cancelAnimationFrame(raf); loop(); });
    prog.addEventListener("pause", () => { feeds.pause(); cancelAnimationFrame(raf); paint(); });
    prog.addEventListener("seeked", () => { feeds.currentTime = prog.currentTime; paint(); });
    feeds.addEventListener("loadeddata", draw);
    const load = () => {
      [prog, feeds].forEach((v) => { if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); } });
    };
    if (!reduced && !saveData) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          load();
          if (ctrls?.dataset.held) return;
          prog.play().catch(() => {});
        } else if (!prog.paused) prog.pause();
      }, { threshold: 0.2 }).observe($(".pa-auto__view", auto));
    } else {
      // reduced motion: the screen still loads its first frame, so the tiles aren't empty
      new IntersectionObserver(([e], o) => { if (e.isIntersecting) { load(); o.disconnect(); } }, { threshold: 0.1 }).observe($(".pa-auto__view", auto));
      feeds.addEventListener("loadeddata", () => { draw(); paint(); }, { once: true });
    }
    paint();

    // the camera move (desktop, motion allowed)
    const pinMQ = matchMedia("(min-width: 1000px) and (prefers-reduced-motion: no-preference)");
    const pin = $(".pa-auto__pin", auto), view = $(".pa-auto__view", auto), mover = $("[data-cam-move]", auto);
    const steps = $$(".pa-auto__step", auto);
    const win = $(".tmw", auto);
    let F = null, ticking = false;
    const rel = (el, base) => { const b = el.getBoundingClientRect(); return { x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height }; };
    const measure = () => {
      mover.style.transform = "none";
      const base = mover.getBoundingClientRect();
      const vw = view.clientWidth, vh = view.clientHeight;
      const W = base.width, H = base.height;
      // zoom so a region fills the view, never past the window's own edges
      const fit = (r, frac, max) => {
        const s = Math.max(1, Math.min(max, vw * frac / r.w, vh * frac / r.h));
        const x = Math.min(0, Math.max(vw - W * s, vw / 2 - (r.x + r.w / 2) * s));
        const y = Math.min(0, Math.max(vh - H * s, vh / 2 - (r.y + r.h / 2) * s));
        return { s, x, y };
      };
      const full = { s: 1, x: 0, y: 0 };
      const cams = fit(rel($(".tmw__cams", mover), base), 1, 2.6);
      const micsF = fit(rel($(".tmw__mics", mover), base), 0.9, 2.4);
      // [progress, view]: rise in, the cameras, the mics, then the whole screen
      F = [[0, { s: 0.94, x: vw * 0.03, y: vh * 0.08 }], [0.06, full], [0.16, cams], [0.3, cams], [0.4, micsF], [0.54, micsF], [0.66, full], [1, full]];
    };
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const frame = () => {
      ticking = false;
      if (!pinMQ.matches || !F) return;
      const r = auto.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const p = Math.min(1, Math.max(0, (top - r.top) / Math.max(1, r.height - pin.offsetHeight)));
      let k = 0;
      while (k < F.length - 2 && p > F[k + 1][0]) k++;
      const [p0, a] = F[k], [p1, b] = F[k + 1];
      const e = ease(Math.min(1, Math.max(0, (p - p0) / Math.max(1e-6, p1 - p0))));
      const s = a.s + (b.s - a.s) * e, x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
      mover.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
      const on = p < 0.3 ? 0 : p < 0.6 ? 1 : 2;
      steps.forEach((st, i) => st.classList.toggle("on", i === on));
      // the part being explained stays lit; the rest of the screen steps back
      win.classList.toggle("f-cams", p > 0.1 && p < 0.33);
      win.classList.toggle("f-mics", p >= 0.33 && p < 0.6);
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    const setup = () => {
      if (pinMQ.matches) { measure(); frame(); addEventListener("scroll", onScroll, { passive: true }); }
      else { removeEventListener("scroll", onScroll); mover.style.transform = ""; steps.forEach((st) => st.classList.remove("on")); win.classList.remove("f-cams", "f-mics"); }
    };
    pinMQ.addEventListener("change", setup);
    addEventListener("resize", () => { if (pinMQ.matches) { measure(); frame(); } });
    if (document.readyState === "complete") setup(); else addEventListener("load", setup, { once: true });
  }

  /* ---------- 08 auto-switch, two-person: the camera on the show follows the app's real cuts ---------- */
  const live = $("[data-cams][data-cuts]");
  if (live) {
    const cuts = live.dataset.cuts.split(",").map((p) => { const [t, cam] = p.split(":"); return [+t, cam]; });
    const figs = $$("figure", live);
    const [a, b] = figs.map((f) => $("video", f));
    let raf = 0;
    const paint = () => {
      const t = a.currentTime;
      let cam = cuts[0][1];
      for (const [at, c] of cuts) if (t >= at) cam = c;
      figs.forEach((f) => f.classList.toggle("is-air", f.dataset.cam === cam));
      if (!b.paused && Math.abs(b.currentTime - t) > 0.12) b.currentTime = t;
      if (!a.paused) raf = requestAnimationFrame(paint);
    };
    a.addEventListener("play", () => { cancelAnimationFrame(raf); paint(); });
    a.addEventListener("pause", () => cancelAnimationFrame(raf));
  }

  /* ---------- 08 auto-switch: the show cuts between the angles ---------- */
  const cams = $("[data-cams]:not([data-cuts])");
  if (cams) {
    const tiles = $$("figure", cams);
    let i = 0;
    whileSeen(cams, 2800, () => { i = (i + 1) % tiles.length; tiles.forEach((t, k) => t.classList.toggle("is-air", k === i)); });
  }

  /* ---------- download: count it, say what's next, show the live beta's version ---------- */
  $$("a.dl").forEach((a) => a.addEventListener("click", () => {
    try { window.gtag?.("event", "file_download", { file_extension: "dmg", file_name: "TaylormadePodcast.dmg", link_url: a.href }); } catch (_) {}
    const note = $(".dl-started", a.closest("header, section"));
    if (note) note.innerHTML = 'Your download should start now (if your browser asks, click Allow). Next: open <strong>TaylormadePodcast.dmg</strong> from your Downloads and drag the app into Applications. <a href="#download">See the steps</a>';
  }));
  fetch("latest.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.version) return;
    $$(".dl-version").forEach((el) => { el.textContent = `Beta ${j.version} (build ${j.build})${j.size ? ` · ${j.size}` : ""}`; });
  }).catch(() => {});
  $$(".send-mac").forEach((b) => b.addEventListener("click", () => {
    const url = "https://www.taylormadecreative.net/podcast-app/";
    if (navigator.share) navigator.share({ title: "Taylormade Podcast for Mac", url }).catch(() => {});
    else location.href = `mailto:?subject=Taylormade%20Podcast%20for%20Mac&body=${encodeURIComponent(url)}`;
  }));
})();
