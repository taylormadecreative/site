/* TAYLORMADE/CREATIVE · video production
   One engine runs the page: a film plays wide, and a subject track (made from the film
   with Apple Vision, shot by shot) tells a canvas where to crop for a phone, a square,
   a 4:5 or a 9:16. Title cards that are wider than a vertical crop switch to "fit".
   Also: the bento previews, Build your month, the podcast moments, the lighting color
   script with its live glow, the screening room and the phone quote bar.
   Shared pieces (words rise, blur fade, scroll progress, the theater) come from home.js. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const saveData = !!navigator.connection?.saveData;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const track = (name, params) => { try { window.gtag?.("event", name, params); } catch (_) {} };
  const json = (id) => { try { return JSON.parse(document.getElementById(id).textContent); } catch (_) { return null; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let theater = false;

  /* ---------- reframing ---------- */
  // subject center (0..1) and fit flag at time t, never blending across a cut
  function at(tr, t) {
    if (!tr) return { x: 0.5, fit: false };
    const f = clamp(t * tr.fps, 0, tr.x.length - 1);
    const i0 = Math.floor(f), i1 = Math.min(tr.x.length - 1, i0 + 1), k = f - i0;
    const a = tr.x[i0], b = tr.x[i1];
    const x = Math.abs(a - b) > 60 ? (k < 0.5 ? a : b) : a + (b - a) * k;
    return { x: x / 1000, fit: tr.fit[k < 0.5 ? i0 : i1] === "1" };
  }
  const amb = document.createElement("canvas"); amb.width = 16; amb.height = 9;
  const ambCtx = amb.getContext("2d");
  // draw the crop of `src` (video or image) that fills (dx,dy,dw,dh), centered on x
  function paint(ctx, src, dx, dy, dw, dh, x, fit, radius = 0) {
    const W = src.videoWidth || src.naturalWidth, H = src.videoHeight || src.naturalHeight;
    if (!W || !H || dw < 2 || dh < 2) return;
    ctx.save();
    if (radius && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, radius); ctx.clip(); }
    const frameAspect = dw / dh, srcAspect = W / H;
    if (fit && frameAspect < srcAspect - 0.02) {
      // title card: the whole frame, letterboxed over a soft wash of its own color
      ambCtx.drawImage(src, 0, 0, 16, 9);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(amb, 2, 0, 12, 9, dx, dy, dw, dh);
      ctx.fillStyle = "rgba(8,8,10,.5)"; ctx.fillRect(dx, dy, dw, dh);
      const h = dw / srcAspect;
      ctx.drawImage(src, 0, 0, W, H, dx, dy + (dh - h) / 2, dw, h);
    } else {
      let sw = H * frameAspect, sh = H;
      if (sw > W) { sw = W; sh = W / frameAspect; }
      const sx = clamp(x * W - sw / 2, 0, W - sw), sy = (H - sh) / 2;
      ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }
  // call fn on every new video frame while running (requestVideoFrameCallback where it exists)
  function frameLoop(video, fn) {
    const rvfc = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    let on = false, id = 0;
    const step = () => { if (!on) return; fn(); id = rvfc ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step); };
    return {
      start() { if (on) return; on = true; step(); },
      stop() { on = false; if (rvfc) video.cancelVideoFrameCallback?.(id); else cancelAnimationFrame(id); },
    };
  }
  const sizeCanvas = (cv) => {
    const w = clamp(Math.round(cv.clientWidth * DPR), 2, 4096), h = clamp(Math.round(cv.clientHeight * DPR), 2, 4096);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; return true; }
    return false;
  };
  const posterUp = (v) => { if (v.dataset.poster && !v.getAttribute("poster")) v.setAttribute("poster", v.dataset.poster); };
  const pickSrc = (v, big) => {
    posterUp(v);
    if (v.src || !v.dataset.src) return;
    const small = innerWidth < 700 && v.dataset.srcSm;
    v.src = small ? v.dataset.srcSm : big && v.dataset.srcHd ? v.dataset.srcHd : v.dataset.src;
  };

  /* ---------- a playing thing: visible + not paused by the visitor + no theater ---------- */
  const players = [];
  function player({ el, videos, btn, onState, autoplay = !reduced && !saveData, threshold = 0.25, load }) {
    const p = { el, videos, btn, user: !autoplay, seen: false, near: false, onState, load };
    const sync = () => {
      const run = p.seen && !p.user && !theater && !document.hidden;
      p.videos.forEach((v) => {
        if (run) {
          if (p.near && p.load) p.load();
          if (v.src) {
            // Low Power Mode and data savers refuse muted autoplay: show Play, so one tap (a gesture) starts it
            v.play()?.catch?.((err) => { if (err?.name === "NotAllowedError" && !p.user) { p.user = true; sync(); } });
          }
        }
        else if (!v.paused) v.pause();
      });
      if (p.btn) {
        p.btn.classList.toggle("is-paused", p.user);
        const what = p.btn.dataset.what || "";
        p.btn.setAttribute("aria-label", `${p.user ? "Play" : "Pause"} ${what}`.trim());
      }
      p.onState?.(run);
    };
    p.sync = sync;
    if (p.btn) {
      p.btn.dataset.what = (p.btn.getAttribute("aria-label") || "").replace(/^(Pause|Play) /, "");
      p.btn.addEventListener("click", () => { p.user = !p.user; if (!p.user) { p.near = true; } sync(); });
    }
    new IntersectionObserver((es) => { es.forEach((e) => { p.seen = e.isIntersecting; }); sync(); }, { threshold }).observe(el);
    new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      p.near = true; p.videos.forEach(posterUp); $$("video[data-poster]", el).forEach(posterUp);
      if (!p.user) p.load?.();
      sync();
    }, { rootMargin: "600px 0px" }).observe(el);
    players.push(p);
    return p;
  }
  document.addEventListener("hm-theater", (e) => { theater = !!e.detail; players.forEach((p) => p.sync()); });
  document.addEventListener("visibilitychange", () => players.forEach((p) => p.sync()));

  /* ---------- HERO · the reel wide, the phone shows the crop, the gold crop rides the subject ---------- */
  const stage = $("[data-stage]");
  if (stage) {
    const v = $("[data-hero]", stage), screen = $("[data-screen]", stage), cropEl = $("[data-crop]", stage);
    const poster = $(".vp-screen__poster", stage), cv = $("[data-phone]", stage), ctx = cv.getContext("2d");
    const tr = json(`rf-${stage.dataset.rf || "reel"}`);
    let fitWas = null, easeT = 0;
    const still = new Image();
    const draw = () => {
      sizeCanvas(cv);
      const live = v.readyState >= 2 && v.currentTime > 0;
      const src = live ? v : still;
      const pos = at(tr, live ? v.currentTime : 0);
      // the poster is not always frame 0: data-x0 holds where its subject sits
      const x = !live && stage.dataset.x0 ? +stage.dataset.x0 : pos.x, fit = live && pos.fit;
      paint(ctx, src, 0, 0, cv.width, cv.height, x, fit);
      // the crop box on the big screen = exactly what the phone shows
      const sw = screen.clientWidth, a = cv.width / cv.height, frac = clamp(a * 9 / 16, 0.05, 1);
      const useFit = fit && frac < 0.98;
      if (useFit !== fitWas) {
        cropEl.classList.add("is-ease"); clearTimeout(easeT); easeT = setTimeout(() => cropEl.classList.remove("is-ease"), 480);
        cropEl.classList.toggle("is-fit", useFit); fitWas = useFit;
      }
      cropEl.style.setProperty("--cw", `${(useFit ? 1 : frac) * 100}%`);
      cropEl.style.setProperty("--cx", `${useFit ? 0 : clamp(x - frac / 2, 0, 1 - frac) * sw}px`);
    };
    const loop = frameLoop(v, draw);
    v.addEventListener("playing", () => { screen.classList.add("is-live"); loop.start(); });
    v.addEventListener("pause", () => { loop.stop(); draw(); });
    v.addEventListener("seeked", draw);
    // a srcset <img> reports a density-corrected width, so the phone paints from a plain Image of the chosen file
    const useStill = () => { still.onload = draw; still.src = poster.currentSrc || poster.src; };
    if (poster.complete) useStill(); else poster.addEventListener("load", useStill, { once: true });
    new ResizeObserver(() => draw()).observe(cv);
    let ready = false;
    const load = () => {
      if (ready || saveData) return; ready = true;
      const w = innerWidth;
      v.src = w >= 1100 && DPR >= 1.5 ? v.dataset.srcHd : w >= 700 ? v.dataset.srcMd : v.dataset.srcSd;
    };
    const hp = player({ el: stage, videos: [v], btn: $("[data-pause='hero']", stage), load: () => { if (document.readyState === "complete") load(); } });
    // keep the hero's first paint clean: the film starts after the page has loaded
    if (document.readyState === "complete") { load(); hp.sync(); }
    else addEventListener("load", () => { setTimeout(() => { load(); hp.sync(); }, 300); }, { once: true });
  }

  /* ---------- BENTO · each card's footage plays on hover (desktop) or when it is in view (touch) ---------- */
  const bento = $("[data-bento]");
  if (bento) {
    const minis = new Map();
    $$(".vp-card", bento).forEach((card) => {
      const v = $("video", card);
      if (!v) return;
      const mini = $(".vp-mini canvas", card);
      if (mini) {
        const tr = json(`rf-${v.dataset.rf}`), mctx = mini.getContext("2d");
        const d = () => { sizeCanvas(mini); const { x, fit } = at(tr, v.currentTime || 0); paint(mctx, v.readyState >= 2 ? v : v.poster && null, 0, 0, mini.width, mini.height, x, fit); };
        const pimg = new Image();
        new IntersectionObserver((es, o) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); pimg.src = v.dataset.poster || v.poster; } }, { rootMargin: "600px 0px" }).observe(card);
        const dPoster = () => { sizeCanvas(mini); const { x } = at(tr, 0); paint(mctx, pimg, 0, 0, mini.width, mini.height, x, false); };
        pimg.addEventListener("load", dPoster, { once: true });
        const loop = frameLoop(v, () => { if (v.readyState >= 2) d(); });
        v.addEventListener("playing", () => loop.start());
        v.addEventListener("pause", () => loop.stop());
        minis.set(v, dPoster);
      }
      // hover or focus loops the card's footage
      const start = () => { if (reduced || theater) return; pickSrc(v); v.loop = true; v.play().catch(() => {}); };
      const stop = () => { v.loop = false; if (!v.paused) v.pause(); };
      if (fine) {
        card.addEventListener("pointerenter", start); card.addEventListener("pointerleave", stop);
        card.addEventListener("focus", start); card.addEventListener("blur", stop);
      }
    });
    new IntersectionObserver((es, o) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); $$("video", bento).forEach(posterUp); } }, { rootMargin: "800px 0px" }).observe(bento);
    if (!reduced && !saveData) {
      // in view, each card plays its footage through once and rests on the last frame
      // (touch: one at a time, the card most in view; desktop: every card in view)
      let current = null;
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          const v = $("video", e.target);
          if (!v) return;
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            if (!fine && current && current !== v) current.pause();
            current = v; pickSrc(v);
            if (!v.dataset.played && !theater) { v.loop = false; v.play().then(() => { v.dataset.played = "1"; }).catch(() => {}); }
          } else if (!v.paused) v.pause();
        });
      }, { threshold: [0, 0.6] });
      $$(".vp-card", bento).forEach((c) => io.observe(c));
    }
    document.addEventListener("hm-theater", (e) => { if (e.detail) $$("video", bento).forEach((v) => v.pause()); });
  }
  // hero chips that point at a card: bring it into view (also inside the phone swipe row) and mark it
  $$("[data-make]").forEach((a) => a.addEventListener("click", (e) => {
    const hit = document.getElementById(a.getAttribute("href").slice(1));
    const card = hit?.closest(".vp-b") || hit;
    if (!card) return;
    e.preventDefault();
    card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center", inline: "start" });
    history.replaceState(null, "", a.getAttribute("href"));
    card.classList.remove("is-called"); void card.offsetWidth; card.classList.add("is-called");
    setTimeout(() => $(".vp-card", card)?.focus({ preventScroll: true }), reduced ? 0 : 700);
  }));

  /* ---------- BUILD YOUR MONTH ---------- */
  const form = $("[data-build]");
  if (form) {
    const list = $("[data-month-list]", form), go = $("[data-month-go]", form);
    const needs = $$(".vp-need", form);
    const groups = $$(".vp-chips", form);
    const lineFor = (need) => {
      const label = need.dataset.label, unit = need.dataset.unit || "";
      const pick = $(".vp-need__opts [aria-pressed='true']", need);
      if (!pick) return label;
      const val = pick.dataset.v;
      if (val === "ns") return `${label}: not sure yet`;
      if (need.dataset.kind === "freq") return `${label}: ${pick.textContent.toLowerCase()}`;
      return `${label}: ${pick.textContent}${unit}`;
    };
    const state = () => {
      const on = needs.filter((n) => n.classList.contains("is-on"));
      const runs = $$("[data-group='runs'] [aria-pressed='true']", form).map((b) => b.textContent);
      const start = $("[data-group='start'] [aria-pressed='true']", form)?.textContent || "";
      return { on, runs, start };
    };
    const render = () => {
      const { on, runs, start } = state();
      const lines = on.map(lineFor);
      if (runs.length) lines.push(`Runs on ${runs.join(", ")}`);
      if (start) lines.push(`Start: ${start.toLowerCase()}`);
      list.replaceChildren(...(on.length ? lines : ["Pick at least one thing you need each month."]).map((t, i) => {
        const li = document.createElement("li"); li.textContent = t;
        if (!on.length) li.className = "vp-month__empty";
        return li;
      }));
      go.setAttribute("aria-disabled", on.length ? "false" : "true");
    };
    needs.forEach((n) => {
      const t = $(".vp-need__t", n), q = $(".vp-need__q", n);
      t.addEventListener("click", () => {
        const on = !n.classList.contains("is-on");
        n.classList.toggle("is-on", on); t.setAttribute("aria-pressed", String(on));
        if (q) q.hidden = !on;
        render();
      });
      $$(".vp-need__opts button", n).forEach((b) => b.addEventListener("click", () => {
        const was = b.getAttribute("aria-pressed") === "true";
        $$(".vp-need__opts button", n).forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", String(!was));
        render();
      }));
    });
    groups.forEach((g) => $$("button", g).forEach((b) => b.addEventListener("click", () => {
      const was = b.getAttribute("aria-pressed") === "true";
      if (g.hasAttribute("data-single")) $$("button", g).forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", String(!was));
      render();
    })));
    $("[data-month-reset]", form).addEventListener("click", () => {
      needs.forEach((n) => { n.classList.remove("is-on"); $(".vp-need__t", n).setAttribute("aria-pressed", "false"); const q = $(".vp-need__q", n); if (q) q.hidden = true; });
      $$("[aria-pressed='true']", form).forEach((b) => b.setAttribute("aria-pressed", "false"));
      render();
      $(".vp-need__t", form)?.focus();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const { on, runs, start } = state();
      if (!on.length) { $(".vp-need__t", form)?.focus(); list.firstElementChild?.animate?.([{ opacity: .3 }, { opacity: 1 }], { duration: 400 }); return; }
      const brief = [
        "Monthly video (retainer).",
        `Each month: ${on.map(lineFor).join("; ")}.`,
        runs.length ? `Runs on: ${runs.join(", ")}.` : "Runs on:",
        start ? `Start: ${start}.` : "Start:",
        "Brand and who it's for:",
        "Anything else I should know:",
      ].join("\n");
      track("vp_month_quote", { items: on.length });
      location.href = `../book/?service=brand-content&type=retainer&month=${encodeURIComponent(brief)}`;
    });
    render();
  }

  /* ---------- PODCAST · the finished episode, its moments, its reels ---------- */
  const pod = $("[data-pod]");
  if (pod) {
    const v = $(".vp-pod__screen video", pod), reels = $$(".vp-pod__reels video", pod);
    const moments = $$("[data-moments] li", pod), now = $("[data-now]", pod), snd = $("[data-pod-sound]", pod);
    const big = innerWidth >= 1100 && DPR >= 1.5;
    const tick = () => {
      const t = v.currentTime || 0;
      moments.forEach((m) => {
        const s = +m.dataset.s, e = +m.dataset.e, on = t >= s && t < e;
        m.classList.toggle("is-on", on);
        const mb = m.firstElementChild; if (mb) { if (on) mb.setAttribute("aria-current", "true"); else mb.removeAttribute("aria-current"); }
        m.style.setProperty("--p", t >= e ? 1 : on ? ((t - s) / (e - s)).toFixed(3) : 0);
        if (on && now.textContent !== m.textContent) now.textContent = m.textContent;
      });
    };
    moments.forEach((m) => { m.style.flexGrow = (+m.dataset.e - +m.dataset.s).toFixed(2); });
    const loop = frameLoop(v, tick);
    v.addEventListener("playing", () => loop.start());
    v.addEventListener("pause", () => loop.stop());
    v.addEventListener("seeked", tick);
    const pp = player({ el: pod, videos: [v, ...reels], btn: $("[data-pause='pod']", pod), threshold: 0.3,
      load: () => { pickSrc(v, big); reels.forEach((r) => pickSrc(r)); } });
    // each moment is a button: jump the episode there
    moments.forEach((m) => $("button", m)?.addEventListener("click", () => {
      pickSrc(v, big); pp.user = false; pp.near = true;
      const go = () => { v.currentTime = +m.dataset.s + 0.05; tick(); pp.sync(); };
      if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
      pp.sync();
      track("vp_podcast_moment", { moment: m.textContent.trim() });
    }));
    snd.addEventListener("click", () => {
      const on = v.muted;
      v.muted = !on;
      $("span", snd).textContent = on ? "Sound off" : "Sound on";
      snd.setAttribute("aria-label", on ? "Turn the sound off" : "Turn the sound on");
      snd.classList.toggle("is-on", on);
      if (on) { pickSrc(v, big); pp.user = false; pp.near = true; pp.sync(); v.play().catch(() => {}); track("vp_podcast_sound", {}); }
    });
  }

  /* ---------- EVERY PLACEMENT ----------
     Wide, tall screens: the section pins and scroll drives 16:9 → 1:1 → 4:5 → 9:16.
     Phones and short screens: the same frame runs on a clock (hold, morph, next), and each ratio row jumps to its shape. */
  const place = $("[data-place]");
  if (place) {
    const v = $("[data-pl-src]", place), tr = json("rf-place");
    const box = $("[data-pl]", place), cv = $("[data-pl-cv]", place), ctx = cv.getContext("2d");
    const lis = $$("[data-ratios] li", place), nowEl = $("[data-pl-now]", place), prog = $("[data-pl-prog]", place);
    const RATIOS = [16 / 9, 1, 4 / 5, 9 / 16], NAMES = ["16:9", "1:1", "4:5", "9:16"];
    const pinOK = () => innerWidth >= 1000 && innerHeight >= 700 && !reduced;
    let pin = pinOK(), p = 0;
    place.classList.toggle("is-pin", pin);
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const mix = (from, to, k) => Math.log(RATIOS[from]) + (Math.log(RATIOS[to]) - Math.log(RATIOS[from])) * k;
    // scroll progress → shape
    const SEG = [[0, .16, 0], [.16, .3, null], [.3, .42, 1], [.42, .56, null], [.56, .68, 2], [.68, .82, null], [.82, 1.01, 3]];
    const scrollShape = () => {
      for (let i = 0; i < SEG.length; i++) {
        const [a, b, hold] = SEG[i];
        if (p < b || i === SEG.length - 1) {
          if (hold !== null) return { r: Math.log(RATIOS[hold]), act: hold, k: 0, from: hold, to: hold };
          const from = SEG[i - 1][2], to = SEG[i + 1][2], k = ease(clamp((p - a) / (b - a), 0, 1));
          return { r: mix(from, to, k), act: k < 0.5 ? from : to, k, from, to };
        }
      }
      return { r: Math.log(RATIOS[0]), act: 0, k: 0, from: 0, to: 0 };
    };
    // clock → shape
    const HOLD = 2.2, MORPH = 0.8, STEP = HOLD + MORPH;
    let clk = 0;
    const clockShape = () => {
      const t = clk % (4 * STEP), idx = Math.floor(t / STEP), local = t - idx * STEP;
      if (local < HOLD) return { r: Math.log(RATIOS[idx]), act: idx, k: 0, from: idx, to: idx };
      const to = (idx + 1) % 4, k = ease(clamp((local - HOLD) / MORPH, 0, 1));
      return { r: mix(idx, to, k), act: k < 0.5 ? idx : to, k, from: idx, to };
    };
    const feedOf = (i) => (i === 1 || i === 2 ? 1 : 0);
    const posterImg = new Image();
    let lastAct = -1;
    const draw = () => {
      const live = v.readyState >= 2;
      const t = live ? v.currentTime : 0;
      const { x, fit } = at(tr, t);
      const src = live ? v : (posterImg.complete && posterImg.naturalWidth ? posterImg : null);
      sizeCanvas(cv);
      const SW = box.clientWidth, SH = box.clientHeight;
      if (!SW || !SH) return;
      const s = pin ? scrollShape() : clockShape(), a = Math.exp(s.r);
      const feed = feedOf(s.from) + (feedOf(s.to) - feedOf(s.from)) * s.k;
      const wide = (s.to === 0 ? s.k : 0) + (s.from === 0 ? 1 - s.k : 0);
      const tall = (s.to === 3 ? s.k : 0) + (s.from === 3 ? 1 - s.k : 0);
      const HEAD = 52 * feed, FOOT = 64 * feed;
      const fw = Math.min(SW, (SH - HEAD - FOOT) * a), fh = fw / a;
      const cardH = fh + HEAD + FOOT, cy = (SH - cardH) / 2, fx = (SW - fw) / 2, fy = cy + HEAD;
      const st = box.style;
      st.setProperty("--fx", `${fx}px`); st.setProperty("--fy", `${fy}px`); st.setProperty("--fw", `${fw}px`); st.setProperty("--fh", `${fh}px`);
      st.setProperty("--cx", `${fx}px`); st.setProperty("--cy", `${cy}px`); st.setProperty("--cw", `${fw}px`); st.setProperty("--ch", `${cardH}px`);
      st.setProperty("--feed", feed.toFixed(3)); st.setProperty("--wide", Math.min(1, wide).toFixed(3)); st.setProperty("--tall", Math.min(1, tall).toFixed(3));
      ctx.clearRect(0, 0, cv.width, cv.height);
      const rad = (12 * Math.min(1, wide) + 26 * Math.min(1, tall)) * DPR;
      if (src) paint(ctx, src, fx * DPR, fy * DPR, fw * DPR, fh * DPR, live ? x : 0.38, live && fit, rad);
      else { ctx.fillStyle = "#e2dccb"; ctx.fillRect(fx * DPR, fy * DPR, fw * DPR, fh * DPR); }
      if (s.act !== lastAct) {
        lastAct = s.act;
        lis.forEach((li, i) => { li.classList.toggle("is-on", i === s.act); const lb = $("button", li); if (i === s.act) lb?.setAttribute("aria-current", "true"); else lb?.removeAttribute("aria-current"); });
        nowEl.textContent = NAMES[s.act];
      }
      if (prog && v.duration) st.setProperty("--prog", (t / v.duration).toFixed(4));
    };
    posterImg.addEventListener("load", () => { if (v.readyState < 2) draw(); }, { once: true });
    const loop = frameLoop(v, () => { if (pin) draw(); });
    v.addEventListener("playing", () => loop.start());
    v.addEventListener("pause", () => { loop.stop(); draw(); });
    v.addEventListener("loadeddata", draw);
    // the clock runs only while the section is in view and the film is playing
    let raf = 0, lastTs = 0;
    const tick = (ts) => {
      raf = 0;
      if (pin) return;
      const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts;
      if (!v.paused && !reduced) clk += dt;
      draw();
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const startClock = () => { if (!pin && !raf) { lastTs = 0; raf = requestAnimationFrame(tick); } };
    v.addEventListener("playing", startClock);
    // each ratio row is a button: pinned, it scrolls the morph to that shape; otherwise it jumps the clock there
    const HOLD_AT = [0.08, 0.36, 0.62, 0.91];
    lis.forEach((li, i) => {
      $("button", li)?.addEventListener("click", () => {
        if (pin) {
          const span = place.offsetHeight - (innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72));
          scrollTo({ top: place.getBoundingClientRect().top + scrollY + span * HOLD_AT[i], behavior: reduced ? "auto" : "smooth" });
          return;
        }
        clk = i * STEP + 0.001; lastAct = -1; draw();
      });
    });
    const setMode = () => place.classList.toggle("is-pin", pin);
    setMode();
    const onScroll = () => {
      if (!pin) return;
      const r = place.getBoundingClientRect(), span = place.offsetHeight - (innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72));
      p = clamp(-r.top / Math.max(1, span), 0, 1);
      if (v.paused) draw();
    };
    let ticking = false;
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
    addEventListener("resize", () => {
      const was = pin; pin = pinOK();
      if (was !== pin) { lastAct = -1; setMode(); if (!pin) startClock(); }
      onScroll(); draw();
    }, { passive: true });
    player({ el: place, videos: [v], btn: $("[data-pause='place']", place), threshold: 0.2, load: () => { if (!posterImg.src && v.dataset.poster) posterImg.src = v.dataset.poster; pickSrc(v, pin && DPR >= 1.5); } });
    onScroll(); draw();
  }

  /* ---------- LIGHTING · the color script, and the glow sampled from the frame ---------- */
  const light = $("[data-light]");
  if (light) {
    const v = $(".vp-light__screen video", light), script = json("cs-light");
    const sc = $("[data-script]", light), sctx = sc.getContext("2d"), head = $("[data-script-head]", light);
    const glowHost = light;
    const s8 = document.createElement("canvas"); s8.width = 8; s8.height = 4;
    const s8x = s8.getContext("2d", { willReadFrequently: true });
    const paintScript = () => {
      sizeCanvas(sc);
      if (!script) return;
      const g = sctx.createLinearGradient(0, 0, sc.width, 0), n = script.c.length;
      script.c.forEach((c, i) => g.addColorStop(i / (n - 1), `#${c}`));
      sctx.fillStyle = g; sctx.fillRect(0, 0, sc.width, sc.height);
    };
    paintScript();
    new ResizeObserver(paintScript).observe(sc);
    let lastSample = 0;
    const boost = (r, g, b) => {
      const mx = Math.max(r, g, b) || 1, mn = Math.min(r, g, b), sat = (mx - mn) / mx;
      // saturated light glows bright; near-white frames stay soft instead of turning into a white halo
      const k = (120 + 95 * Math.min(1, sat * 1.6)) / mx;
      return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    };
    const tick = () => {
      const t = v.currentTime || 0, d = v.duration || 30;
      head.style.setProperty("--x", `${(t / d) * sc.clientWidth}px`);
      const nowMs = performance.now();
      if (nowMs - lastSample > 90 && v.readyState >= 2) {
        lastSample = nowMs;
        s8x.drawImage(v, 0, 0, 8, 4);
        const px = s8x.getImageData(0, 0, 8, 4).data;
        const avg = (x0, x1) => { let r = 0, g = 0, b = 0, n = 0; for (let y = 0; y < 4; y++) for (let x = x0; x < x1; x++) { const i = (y * 8 + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; } return boost(r / n, g / n, b / n); };
        glowHost.style.setProperty("--g1", avg(0, 4));
        glowHost.style.setProperty("--g2", avg(4, 8));
      }
    };
    const loop = frameLoop(v, tick);
    v.addEventListener("playing", () => loop.start());
    v.addEventListener("pause", () => loop.stop());
    player({ el: light, videos: [v], btn: $("[data-pause='light']", light), threshold: 0.3, load: () => pickSrc(v, innerWidth >= 1000 && DPR >= 1.5) });
  }

  /* ---------- THE WORK · screening room ---------- */
  const work = $("[data-work]");
  if (work) {
    const FILMS = json("hm-films") || {};
    const img = $("[data-room-img]", work), k = $("[data-room-k]", work), t = $("[data-room-t]", work), d = $("[data-room-d]", work), play = $("[data-room-play]", work);
    const items = $$("[data-room-list] li", work);
    const show = (slug, { focus = false } = {}) => {
      const f = FILMS[slug], btn = $(`[data-room-list] button[data-film-pick="${slug}"]`, work);
      if (!f || !btn) return;
      $$("[data-room-list] button", work).forEach((b) => b.setAttribute("aria-current", String(b === btn)));
      const big = btn.dataset.big, sm = btn.dataset.img;
      img.srcset = big ? `${sm} 1280w, ${big} 1920w` : "";
      img.src = sm;
      img.classList.remove("is-swap"); void img.offsetWidth; if (!reduced) img.classList.add("is-swap");
      k.textContent = f.m; t.textContent = f.t; d.textContent = f.d;
      play.dataset.film = slug;
      const live = $("[data-room-live]", work); if (live) live.textContent = `Now showing: ${f.t}`;
      play.href = f.yt ? `https://www.youtube.com/watch?v=${f.yt}` : "#work";
      if (focus) play.focus({ preventScroll: true });
    };
    items.forEach((li) => {
      const b = $("button", li);
      b.addEventListener("click", () => {
        show(b.dataset.filmPick);
        track("vp_room_pick", { film: b.dataset.filmPick });
        if (innerWidth < 1000) $("[data-room-stage]", work).scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      });
      if (fine) b.addEventListener("pointerenter", () => { const pre = new Image(); pre.src = b.dataset.img; }, { once: true });
    });
    $$(".vp-filters button", work).forEach((fb) => fb.addEventListener("click", () => {
      $$(".vp-filters button", work).forEach((x) => x.setAttribute("aria-pressed", String(x === fb)));
      const f = fb.dataset.f;
      items.forEach((li) => { li.hidden = f !== "all" && !li.dataset.k.split(" ").includes(f); });
      const cur = $("[data-room-list] button[aria-current='true']", work);
      if (!cur || cur.closest("li").hidden) { const first = items.find((li) => !li.hidden); if (first) show($("button", first).dataset.filmPick); }
    }));
  }

  /* ---------- section loops on the sub-pages: play in view, one pause for the figure ---------- */
  $$("[data-loop]").forEach((fig) => {
    const vids = $$("video", fig);
    player({ el: fig, videos: vids, btn: $("[data-pause]", fig), threshold: 0.35, load: () => vids.forEach((v) => pickSrc(v)) });
  });

  /* ---------- the client ribbon's pause (the marquee itself comes from home.js) ---------- */
  $$("[data-cb-pause]").forEach((btn) => {
    const row = $("[data-mq]", btn.closest("section"));
    if (reduced) { btn.hidden = true; return; }
    btn.addEventListener("click", () => {
      const stop = !row.classList.contains("is-stopped");
      row.classList.toggle("is-stopped", stop);
      btn.classList.toggle("is-paused", stop);
      btn.setAttribute("aria-label", `${stop ? "Play" : "Pause"} the moving client names`);
    });
  });

  /* ---------- theater: "Build your month" closes the film first ---------- */
  $("[data-th-month]")?.addEventListener("click", () => $("#theater")?.close());

  /* ---------- phone quote bar: shown between the hero and the closing CTA ---------- */
  const qbar = $("[data-qbar]");
  if (qbar && matchMedia("(max-width: 699px)").matches) {
    qbar.hidden = false;
    // it steps aside over the hero, the month builder, the closing CTA and the footer
    const seen = { hero: true, end: false, build: false, foot: false };
    const paint = () => { const on = !seen.hero && !seen.end && !seen.build && !seen.foot; qbar.classList.toggle("is-on", on); qbar.inert = !on; };
    const watch = (el, key) => el && new IntersectionObserver((es) => { es.forEach((e) => { seen[key] = e.isIntersecting; }); paint(); }).observe(el);
    watch($(".vp-hero"), "hero"); watch($(".hm-cta"), "end"); watch($(".vp-build"), "build"); watch($(".footer"), "foot");
    paint();
  }
  $$("[data-cta]").forEach((a) => a.addEventListener("click", () => track("vp_quote_click", { where: a.dataset.cta })));
})();
