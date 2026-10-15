/* Feature cards on the podcast app page (see css/pa-cards.css). Each card is its own IIFE. */

/* ==================== pod ==================== */
/* 02 · Spotify and Apple Podcasts (id "pod")
   Acts out what the user does with the app's real files for "2 Tonight at 7":
   Episodes › Where to post › Show the audio, drag Podcast Audio - 2 Tonight at 7.m4a
   into Spotify for Creators, then Copy the app's Apple Intelligence title and description
   and paste them in. The app never uploads; the pointer is the user.
   Plays only while the card is on screen and not covered; pauses where it is.
   Reduced motion: the finished state, nothing moves by itself. The take stays playable. */
(() => {
  const root = document.querySelector("[data-pod]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STOP = Symbol("stop");

  const stage = $("[data-pod-stage]"), cv = $("[data-pod-cv]"), site = $(".pod__site");
  const file = $("[data-pod-file]"), cur = $("[data-pod-cur]"), ul = $("[data-pod-ul]");
  const drop = $('[data-pod-t="drop"]'), show = $('[data-pod-t="show"]');
  const copyT = $('[data-pod-t="copy-title"]'), copyD = $('[data-pod-t="copy-desc"]');
  const fTitle = $('[data-pod-t="title"]'), fDesc = $('[data-pod-t="desc"]');
  const card = $(".pod__card"), cplay = $(".pod__cplay"), upl = $(".pod__upl");
  const bar = $("[data-pod-bar]"), pct = $("[data-pod-pct]"), tc = $("[data-pod-tc]"), dc = $("[data-pod-dc]");
  const TITLE_N = 48, DESC_N = 255;   // the pasted text's length, as the host counts it

  /* ---------- a clock that only runs while the card is in view ---------- */
  let vt = 0, last = 0, raf = 0, running = false, gen = 0;
  const waits = new Set();
  let upTween = null;   // the upload bar, driven by the same clock
  const frame = (now) => {
    vt += Math.min(64, now - last); last = now;
    waits.forEach((w) => { if (vt >= w.at) { waits.delete(w); w.res(); } });
    if (upTween) {
      const p = Math.min(1, (vt - upTween.t0) / upTween.dur);
      const e = 1 - Math.pow(1 - p, 1.6);
      bar.style.transform = `scaleX(${e.toFixed(4)})`;
      pct.textContent = String(Math.round(e * 100));
      if (p >= 1) { upTween = null; upl.classList.remove("is-upl"); }
    }
    raf = requestAnimationFrame(frame);
  };
  const sleep = (ms, g) => new Promise((res, rej) => {
    const w = { at: vt + ms, res: () => (g === gen ? res() : rej(STOP)) };
    waits.add(w);
  });
  const anims = () => [cur, file, cv].flatMap((el) => el.getAnimations());
  const pauseAll = () => { running = false; cancelAnimationFrame(raf); anims().forEach((a) => a.playState === "running" && a.pause()); };
  const playAll = () => {
    if (running) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
    anims().forEach((a) => a.playState === "paused" && a.play());
  };

  /* ---------- geometry: points inside the stage, in its own (unscaled) pixels ---------- */
  const pt = (el, ax = 0.5, ay = 0.5) => {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / stage.offsetWidth || 1;
    return { x: (r.left + r.width * ax - s.left) / k, y: (r.top + r.height * ay - s.top) / k };
  };
  const tip = () => ({ x: cur.offsetWidth * 5.2 / 24, y: cur.offsetHeight * 2.6 / 24 });
  let cx = 0, cy = 0, fx = 0, fy = 0;
  const tr = (x, y) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  const at = (x, y) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;   // the translate property: scale and rotate never move it
  // keep where it ended as plain style; a cancelled one (the loop was reset) just stops
  const settle = (a) => a.finished.then(() => { try { a.commitStyles(); } catch (_) {} a.cancel(); }, () => {});
  const curTo = (p, ms, g, ease = "cubic-bezier(.55,.05,.25,1)") => {
    const t = tip(), x = p.x - t.x, y = p.y - t.y;
    const a = cur.animate([{ translate: at(cx, cy) }, { translate: at(x, y) }], { duration: ms, easing: ease, fill: "forwards" });
    cx = x; cy = y;
    return settle(a).then(() => { if (g !== gen) throw STOP; });
  };
  const curAt = (p) => { const t = tip(); cx = p.x - t.x; cy = p.y - t.y; cur.style.translate = at(cx, cy); };
  const fade = (el, to, ms) => settle(el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: ms, easing: "ease-out", fill: "forwards" }));
  const press = async (el, g) => {
    el?.classList.add("is-down");
    cur.animate([{ scale: 1 }, { scale: 0.86 }, { scale: 1 }], { duration: 220, easing: "ease-out" });
    await sleep(130, g);
    el?.classList.remove("is-down");
  };

  /* ---------- the app window's camera: Where to post, or Titles & show notes ---------- */
  const panB = () => {
    const l = $(".pod__col--l"), r = $(".pod__col--r");
    return { x: cv.parentElement.clientWidth - cv.offsetWidth, y: -(r.offsetTop - l.offsetTop) };
  };
  let cam = { x: 0, y: 0 };
  const pan = (to, ms) => {
    const a = cv.animate([{ transform: tr(cam.x, cam.y) }, { transform: tr(to.x, to.y) }], { duration: ms, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
    cam = to;
    return settle(a);
  };
  const panSet = (to) => { cam = to; cv.style.transform = tr(to.x, to.y); };

  /* ---------- the host's step underline ---------- */
  const underline = (step) => {
    const st = $(step === "up" ? ".pod__st--up" : ".pod__st--det"), box = $(".pod__steps");
    if (!st || !box) return;
    ul.style.transform = `translateX(${st.offsetLeft}px) scaleX(${st.offsetWidth})`;
  };

  /* after a paste the caret is at the end, so the box shows the end: the chapter line */
  const dval = fDesc.querySelector(".pod__val"), dbox = fDesc.querySelector(".pod__txt");
  const toEndOfText = (on) => {
    const pad = parseFloat(getComputedStyle(dbox).paddingBottom) || 0;
    const raw = on ? Math.max(0, dval.offsetTop + dval.offsetHeight + pad - dbox.clientHeight) : 0;
    // whole lines, like a scrolled text box (the line above is clipped with the box's top padding)
    const lh = parseFloat(getComputedStyle(dval).lineHeight) || 16;
    let n = Math.round(raw / lh);
    if (n * lh < raw - 2) n++;
    const over = raw > 0 ? Math.round(n * lh) : 0;
    dval.style.transform = over ? `translateY(${-over}px)` : "";
  };

  /* ---------- the two ends of the loop ---------- */
  const fields = (filled) => {
    [fTitle, fDesc].forEach((f) => { f.classList.toggle("is-empty", !filled); f.classList.remove("is-focus"); });
    tc.textContent = filled ? String(TITLE_N) : "0";
    dc.textContent = filled ? String(DESC_N) : "0";
    card.classList.toggle("has-title", filled);
    [copyT, copyD].forEach((b) => b.classList.remove("is-copied", "is-hover", "is-down"));
    show.classList.remove("is-hover", "is-down");
    cplay.classList.remove("is-hover");
  };
  const upload = (done) => {
    upTween = null;
    upl.classList.toggle("is-upl", !done);
    bar.style.transform = `scaleX(${done ? 1 : 0})`;
    pct.textContent = done ? "100" : "0";
  };
  const quiet = (on) => root.classList.toggle("pod-still", on);
  const toStart = () => {
    [cur, file, cv].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    cur.style.opacity = "0"; file.style.opacity = "0";
    site.classList.add("is-up"); underline("up");
    drop.classList.remove("is-over");
    fields(false); upload(false); panSet({ x: 0, y: 0 }); toEndOfText(false);
  };
  const toEnd = () => {
    [cur, file, cv].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    cur.style.opacity = "0"; file.style.opacity = "0";
    site.classList.remove("is-up"); underline("det");
    drop.classList.remove("is-over");
    fields(true); upload(true); panSet({ x: 0, y: 0 }); toEndOfText(true);
  };

  /* ---------- the loop: what the user does ---------- */
  const narrow = () => stage.offsetWidth < 520 || getComputedStyle(card).display === "none";
  const run = async (g, first) => {
    toStart();
    await sleep(first ? 1500 : 600, g);   // the first time, the windows are still rising
    // the pointer arrives on the Spotify & Apple Podcasts row
    const s0 = pt(show);
    curAt({ x: s0.x - stage.offsetWidth * 0.16, y: s0.y + stage.offsetWidth * 0.07 });
    await fade(cur, 1, 220);
    await curTo(s0, 820, g);
    show.classList.add("is-hover");
    await sleep(160, g);
    await press(show, g);
    // Show the audio: Finder shows the file, selected
    await sleep(260, g);
    const spot = narrow()
      ? { x: stage.offsetWidth * 0.66 - file.offsetWidth / 2, y: s0.y - file.offsetHeight * 1.3 }
      : { x: stage.offsetWidth * 0.83 - file.offsetWidth / 2, y: stage.offsetHeight * 0.13 };
    fx = spot.x; fy = spot.y;
    file.style.translate = at(fx, fy);
    file.animate([{ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1 }], { duration: 340, easing: "cubic-bezier(.2,.9,.3,1)", fill: "forwards" });
    show.classList.remove("is-hover");
    await sleep(420, g);
    // grab it
    const icon = $(".pod__doc");
    await curTo(pt(icon, 0.55, 0.5), 700, g);
    await sleep(120, g);
    file.animate([{ scale: 1, rotate: "0deg" }, { scale: 1.06, rotate: "-4deg" }], { duration: 180, easing: "ease-out", fill: "forwards" });
    cur.animate([{ scale: 1 }, { scale: 0.9 }], { duration: 160, fill: "forwards" });
    await sleep(160, g);
    // drag it into the host's drop zone
    const d = pt(drop, 0.5, 0.52), t = tip();
    const grab = { x: cx + t.x - fx, y: cy + t.y - fy };   // where the pointer holds the file
    const dur = 1250, ease = "cubic-bezier(.5,0,.2,1)";
    const mid = { x: (cx + d.x - t.x) / 2 + stage.offsetWidth * 0.03, y: Math.min(cy, d.y - t.y) - stage.offsetWidth * 0.02 };
    cur.animate([{ translate: at(cx, cy) }, { translate: at(mid.x, mid.y), offset: 0.45 }, { translate: at(d.x - t.x, d.y - t.y) }], { duration: dur, easing: ease, fill: "forwards" });
    const fa = file.animate([
      { translate: at(fx, fy) },
      { translate: at(mid.x + t.x - grab.x, mid.y + t.y - grab.y), offset: 0.45 },
      { translate: at(d.x - grab.x, d.y - grab.y) },
    ], { duration: dur, easing: ease, fill: "forwards" });
    cx = d.x - t.x; cy = d.y - t.y; fx = d.x - grab.x; fy = d.y - grab.y;
    await sleep(dur * 0.62, g);
    drop.classList.add("is-over");
    await fa.finished.catch(() => {});
    if (g !== gen) throw STOP;
    // let go: the file goes in
    cur.animate([{ scale: 0.9 }, { scale: 1 }], { duration: 160, fill: "forwards" });
    file.animate([{ opacity: 1, scale: 1.06 }, { opacity: 0, scale: 0.55 }], { duration: 260, easing: "ease-in", fill: "forwards" });
    await sleep(320, g);
    drop.classList.remove("is-over");
    site.classList.remove("is-up"); underline("det");
    upl.classList.add("is-upl");
    upTween = { t0: vt, dur: 5200 };
    await sleep(700, g);
    // the app: Titles & show notes
    await pan(panB(), 950);
    if (g !== gen) throw STOP;
    await curTo(pt(copyT, 0.5, 0.5), 900, g);
    copyT.classList.add("is-hover");
    await press(copyT, g);
    copyT.classList.add("is-copied");
    const unCopy = (b) => sleep(1500, g).then(() => b.classList.remove("is-copied", "is-hover")).catch(() => {});
    unCopy(copyT);
    await sleep(320, g);
    // paste the title
    await curTo(pt(fTitle, 0.42, 0.5), 820, g);
    await press(null, g);
    fTitle.classList.add("is-focus");
    await sleep(420, g);
    fTitle.classList.remove("is-empty"); tc.textContent = String(TITLE_N); card.classList.add("has-title");
    await sleep(650, g);
    fTitle.classList.remove("is-focus");
    // copy and paste the description
    await curTo(pt(copyD, 0.5, 0.5), 900, g);
    copyD.classList.add("is-hover");
    await press(copyD, g);
    copyD.classList.add("is-copied");
    unCopy(copyD);
    await sleep(320, g);
    await curTo(pt($(".pod__txt"), 0.4, 0.28), 820, g);
    await press(null, g);
    fDesc.classList.add("is-focus");
    await sleep(420, g);
    fDesc.classList.remove("is-empty"); dc.textContent = String(DESC_N);
    await sleep(520, g);
    toEndOfText(true);
    await sleep(700, g);
    fDesc.classList.remove("is-focus");
    // the host's own preview of the episode
    if (!narrow()) {
      await curTo(pt(cplay), 900, g);
      cplay.classList.add("is-hover");
    }
    while (upTween) await sleep(120, g);
    await sleep(2800, g);
    // rewind, softly
    await fade(cur, 0, 260);
    cplay.classList.remove("is-hover");
    site.classList.add("is-up"); underline("up");
    await pan({ x: 0, y: 0 }, 800);
    await sleep(500, g);
  };

  let started = false, inView = false, covered = false, hold = false;
  const loop = async () => {
    const g = ++gen;
    let first = root.classList.contains("is-pre");
    root.classList.remove("is-pre");
    try { for (;;) { await run(g, first); first = false; } } catch (e) { if (e !== STOP && g === gen) throw e; }
  };
  const sync = () => {
    if (reduced) return;
    const go = inView && !covered && !hold;
    if (go) {
      playAll();
      if (!started) { started = true; loop(); }
    } else pauseAll();
  };

  /* ---------- the take: the app's real podcast audio ---------- */
  const audio = new Audio();
  audio.preload = "none";
  const SRC = "../assets/video/podcast-app/tonight-podcast.m4a";
  const DUR = 64.17;
  const wave = $("[data-pod-wave]"), now = $("[data-pod-now]"), ctime = $("[data-pod-time]"), cprog = $("[data-pod-prog]");
  const bars = [];
  if (wave) {
    (wave.dataset.peaks || "").split(",").forEach((h) => { const i = document.createElement("i"); i.style.setProperty("--h", h); wave.append(i); bars.push(i); });
  }
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const paint = () => {
    const t = audio.currentTime || 0, p = Math.min(1, t / DUR);
    bars.forEach((b, i) => b.classList.toggle("on", i / bars.length < p));
    if (now) now.textContent = mmss(t);
    if (ctime) ctime.textContent = `0${mmss(t)}`.slice(-5);
    if (cprog) cprog.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  let araf = 0;
  const follow = () => { cancelAnimationFrame(araf); const f = () => { paint(); if (!audio.paused) araf = requestAnimationFrame(f); }; f(); };
  const toggle = () => {
    if (!audio.getAttribute("src")) audio.src = SRC;
    if (audio.paused) {
      // the visitor wants to listen: show the finished upload and keep it still
      if (!reduced) { hold = true; gen++; waits.clear(); toEnd(); sync(); }
      audio.play().catch(() => {});
    } else audio.pause();
  };
  audio.addEventListener("play", () => { root.classList.add("is-playing"); follow(); });
  audio.addEventListener("pause", () => root.classList.remove("is-playing"));
  audio.addEventListener("ended", () => { root.classList.remove("is-playing"); audio.currentTime = 0; paint(); });
  $$("[data-pod-play]").forEach((b) => b.addEventListener("click", toggle));
  wave?.addEventListener("click", (e) => {
    const r = wave.getBoundingClientRect();
    if (!audio.getAttribute("src")) audio.src = SRC;
    const go = () => { audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DUR; paint(); };
    audio.readyState ? go() : (audio.addEventListener("loadedmetadata", go, { once: true }), audio.load());
  });

  /* ---------- when to move ---------- */
  if (reduced) {
    toEnd();
    document.fonts?.ready.then(() => toEndOfText(true));
    addEventListener("resize", () => toEndOfText(true));
    return;
  }
  toStart();
  root.classList.add("is-pre");
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (!inView && !audio.paused) audio.pause();
    if (!inView && hold && audio.paused) { hold = false; started = false; gen++; waits.clear(); toStart(); }
    sync();
  }, { threshold: 0.3 }).observe(stage);
  root.closest(".hm-ch")?.addEventListener("hm-cover", (e) => {
    covered = !!e.detail;
    if (covered && !audio.paused) audio.pause();
    sync();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseAll(); else sync(); });
  addEventListener("resize", () => { if (!site.classList.contains("is-up")) underline("det"); else underline("up"); });
})();

/* ==================== tx ==================== */
/* 03 TRANSCRIPT (tx) · the app's Episodes screen, acting out "Transcript ready." on Auntie PB.
   On entering view: the window comes in wide, the top bar says it's writing the transcript mic by
   mic, the camera moves in as the app's toast drops and the Transcript section fills in, Copy is
   clicked (it reads "Copied" for 1.5 s, like the app), then the camera settles on the rows and a
   band follows the 30 seconds the page's auto-switch section plays. The band, the pointer, the
   play button and the two file cards are the website's; everything else is the app's own UI.
   Plays only while the card is on screen and not covered by the next card. */
(() => {
  const root = document.querySelector(".tx-card[data-tx]");
  if (!root) return;
  const q = (s) => root.querySelector(s);
  const qq = (s) => [...root.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = q(".tx-stage"), cam = q(".tx-cam"), win = q(".tx-win"), sec = q(".tx-sec");
  const copy = q(".tx-copy"), cursor = q(".tx-cursor"), btn = q(".tx-play"), ring = q(".tx-ring__on");
  const peekTxt = q('[data-peek="txt"]'), peekSrt = q('[data-peek="srt"]');
  const DUR = Number(root.dataset.txDur) || 29.65;
  const RING = 201.06;

  qq(".tx-ln").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 18)));
  const lines = qq(".tx-ln[data-s]").map((el) => ({
    el, s: Number(el.dataset.s), e: Number(el.dataset.e), n: el.dataset.n, srt: el.dataset.srt, b: el.dataset.b,
    who: el.querySelector("b").textContent, text: el.querySelector("span").textContent,
  }));

  /* ---------- the camera ---------- */
  const phone = () => stage.clientWidth < 560;
  const unit = () => win.offsetWidth / (phone() ? 380 : 1280);
  const off = (el) => { let x = 0, y = 0; for (let e = el; e && e !== win; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
  let focus = null; // the line the phone camera keeps in view
  const follow = () => {
    const u = unit(), H = stage.clientHeight;
    const el = focus?.el || lines[0]?.el;
    const mid = el ? off(el).y + el.offsetHeight / 2 : 0;
    const y = Math.max(0, Math.min(mid - H * 0.44, win.offsetHeight - H - 8 * u));
    return { x: 0, y: -y, s: 1 };
  };
  const shots = {
    wide: () => (phone() ? { x: 0, y: 0, s: 1 } : { x: 0, y: 0, s: stage.clientWidth / win.offsetWidth }),
    // the tabs and the toast, from just past the episode title to the middle of Talk time
    top: () => { if (phone()) return { x: 0, y: 0, s: 1 }; const u = unit(), s = stage.clientWidth / (790 * u); return { x: -222 * u * s, y: 0, s }; },
    medium: () => {
      if (phone()) return { x: 0, y: 0, s: 1 };
      const u = unit(), p = off(sec), s = stage.clientWidth / (sec.offsetWidth + 40 * u);
      return { x: -(p.x - 20 * u) * s, y: -(p.y - 20 * u) * s, s };
    },
    close: () => {
      if (phone()) return follow();
      const u = unit(), p = off(sec);
      return { x: -(p.x - 18 * u), y: -(p.y - 16 * u), s: 1 };
    },
  };
  let shot = "wide";
  const aim = (name, how = "") => {
    shot = name;
    const t = shots[name]();
    cam.classList.toggle("is-follow", how === "follow");
    if (how === "now") cam.classList.add("no-tr");
    cam.style.transform = `translate3d(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px, 0) scale(${t.s.toFixed(5)})`;
    if (how === "now") { void cam.offsetWidth; cam.classList.remove("no-tr"); }
  };

  /* ---------- the pointer that clicks Copy ---------- */
  const at = (el, sh, fx, fy) => { const p = off(el); return [sh.x + (p.x + el.offsetWidth * fx) * sh.s, sh.y + (p.y + el.offsetHeight * fy) * sh.s]; };
  const pointerIn = () => {
    const sh = shots[shot]();
    const [x, y] = at(copy, sh, 0.34, 0.42);
    cursor.classList.add("no-tr");
    cursor.style.transform = `translate(${(x - stage.clientWidth * 0.2).toFixed(1)}px, ${(y + stage.clientHeight * 0.34).toFixed(1)}px)`;
    cursor.getBoundingClientRect(); // an <svg> has no offsetWidth: this is what commits the start point
    cursor.classList.remove("no-tr");
    cursor.classList.add("is-on");
    cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const click = () => {
    copy.classList.add("is-press");
    cursor.classList.add("is-click");
    later(() => {
      copy.classList.remove("is-press");
      cursor.classList.remove("is-click");
      copy.classList.add("is-copied");
      later(() => copy.classList.remove("is-copied"), 1500); // the app's Copy reads "Copied" for 1.5 s (EpisodesView.swift:929-937)
    }, 130);
  };
  const pointerOut = () => cursor.classList.remove("is-on");

  /* ---------- the build, once per visit; then the band loops over the 30 seconds ---------- */
  let clock = 0, beat = 0, playFrom = Infinity, followOn = false, built = false;
  const ready = () => { root.classList.add("is-ready", "is-toast"); playFrom = clock + 700; };
  const toastOut = () => root.classList.remove("is-toast"); // the app's toast stays 3.5 s (Studio.swift:1626-1634)
  const settle = () => { followOn = phone(); aim("close", phone() ? "follow" : ""); };
  const DESK = [
    [0, () => root.classList.add("is-in")],
    [1050, () => root.classList.add("st2")],
    [1350, () => aim("top")],
    [2450, ready],
    [4800, () => aim("medium")],
    [5750, pointerIn],
    [6050, toastOut],
    [6600, click],
    [7100, pointerOut],
    [7300, settle],
    [8500, () => { built = true; }],
  ];
  const PHONE = [
    [0, () => root.classList.add("is-in")],
    [1050, () => root.classList.add("st2")],
    [1400, ready],
    [3300, pointerIn],
    [4150, click],
    [4650, pointerOut],
    [4900, toastOut],
    [5000, settle],
    [5800, () => { built = true; }],
  ];
  let beats = DESK;

  const finish = () => { // Play pressed during the build: jump to the finished screen
    if (built) return;
    built = true; beat = Infinity;
    timers.forEach(clearTimeout); timers.clear();
    root.classList.add("is-in", "st2", "is-ready");
    root.classList.remove("is-toast");
    copy.classList.remove("is-press", "is-copied");
    cursor.classList.remove("is-on", "is-click");
    if (playFrom === Infinity) playFrom = clock;
    settle();
  };

  /* ---------- the band, the file cards and the ring ---------- */
  let mode = "auto", heldAt = 0, nowKey = "", peekLine = null;
  const audio = new Audio();
  audio.preload = "none";
  const peek = (l) => {
    const [a, b] = peekTxt.children, [c, d, e] = peekSrt.children;
    a.textContent = `[${l.b}] ${l.who}:`; b.textContent = l.text;          // Transcript.txt (EpisodeStore.swift:144-155)
    c.textContent = l.n; d.textContent = l.srt; e.textContent = `${l.who.toUpperCase()}: ${l.text}`; // the .srt (EpisodeStore.swift:134-142)
    [peekTxt, peekSrt].forEach((p) => { p.classList.remove("is-tick"); void p.offsetWidth; p.classList.add("is-tick"); });
  };
  const paint = (t) => {
    let on = lines.filter((l) => l.s <= t && t < l.e);
    if (!on.length) { const past = lines.filter((l) => l.s <= t); if (past.length) on = [past[past.length - 1]]; }
    const key = on.map((l) => l.n).join();
    if (key !== nowKey) { nowKey = key; lines.forEach((l) => l.el.classList.toggle("is-now", on.includes(l))); }
    const lead = on.reduce((a, l) => (!a || l.s > a.s ? l : a), null);
    if (lead && lead !== peekLine) {
      peekLine = lead; focus = lead; peek(lead);
      if (followOn && shot === "close") aim("close", "follow");
    }
    if (mode !== "auto") ring.style.strokeDashoffset = (RING * (1 - Math.min(1, t / DUR))).toFixed(2);
  };

  /* ---------- the clock: runs only while the card is on screen ---------- */
  let raf = 0, last = 0, running = false;
  const frame = (now) => {
    clock += Math.min(400, now - last); last = now;
    while (beat < beats.length && beats[beat][0] <= clock) beats[beat++][1]();
    if (mode === "sound") paint(audio.currentTime);
    else if (mode === "held") paint(heldAt);
    else if (!reduced && clock >= playFrom) paint(((clock - playFrom) / 1000) % DUR);
    raf = requestAnimationFrame(frame);
  };
  const run = (on) => {
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
  };

  const setMode = (m) => {
    mode = m;
    root.classList.toggle("is-sound", m === "sound");
    root.classList.toggle("is-held", m === "held");
    btn.setAttribute("aria-label", m === "sound" ? "Pause" : "Play these 30 seconds of Auntie PB");
  };
  btn.addEventListener("click", () => {
    if (mode === "sound") { audio.pause(); return; }
    finish();
    if (reduced && shot !== "close") settle(); // a cut, not a move: transitions are off
    if (!audio.getAttribute("src")) audio.src = root.dataset.txSrc;
    if (mode !== "held") { try { audio.currentTime = 0; } catch (_) {} }
    setMode("sound");
    nowKey = ""; peekLine = null;
    audio.play().catch(() => setMode("auto"));
    run(true);
  });
  audio.addEventListener("pause", () => {
    if (mode !== "sound") return;
    if (audio.ended) return;
    heldAt = audio.currentTime;
    setMode("held");
    if (reduced) run(false);
  });
  audio.addEventListener("ended", () => {
    setMode("auto");
    ring.style.strokeDashoffset = RING;
    playFrom = reduced ? Infinity : clock; // the silent band starts over from the top
    nowKey = ""; peekLine = null;
    if (reduced) run(false);
  });
  // another player on the page starts with sound: this one stops
  document.addEventListener("play", (e) => {
    const m = e.target;
    if (mode === "sound" && m instanceof HTMLMediaElement && m !== audio && !m.muted) audio.pause();
  }, true);
  document.addEventListener("volumechange", (e) => {
    const m = e.target;
    if (mode === "sound" && m instanceof HTMLMediaElement && m !== audio && !m.muted && !m.paused) audio.pause();
  }, true);

  /* ---------- on screen, off screen, covered by the next card ---------- */
  let seen = false, covered = false;
  const sync = () => {
    const on = seen && !covered && !document.hidden;
    if (!on && mode === "sound") audio.pause();
    run(on && (!reduced || mode === "sound"));
  };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { threshold: 0.3 }).observe(stage);
  root.closest(".hm-ch")?.addEventListener("hm-cover", (e) => { covered = !!e.detail; sync(); });
  document.addEventListener("visibilitychange", sync);

  /* ---------- start ---------- */
  const init = () => {
    beats = phone() ? PHONE : DESK;
    if (reduced) { // the finished screen, still: the Episodes tab, the section and its first rows
      built = true; beat = Infinity;
      root.classList.add("is-in", "st2", "is-ready");
      aim("top", "now");
      return;
    }
    aim("wide", "now");
  };
  init();
  new ResizeObserver(() => aim(shot, "now")).observe(stage);
  document.fonts?.ready.then(() => aim(shot, "now"));
})();

/* ==================== yt ==================== */
/* 05 · YouTube (id "yt")
   Acts out what the user does with the app's real files for Auntie PB, Episode 1:
   Episodes › Where to post › Show the video, drag Show - Episode 1 (ready to post).mp4
   into YouTube Studio's upload dialog, then Copy description (the app's description plus
   its chapter line) and a title idea, and paste them in while it uploads. The app never
   uploads; the pointer is the user.
   Plays only while the card is on screen and not covered; pauses where it is.
   Reduced motion: the finished state, nothing moves by itself. */
(() => {
  const root = document.querySelector("[data-yt]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STOP = Symbol("stop");

  const stage = $("[data-yt-stage]"), cv = $("[data-yt-cv]"), dlg = $("[data-yt-dlg]");
  const file = $("[data-yt-file]"), cur = $("[data-yt-cur]");
  const drop = $('[data-yt-t="drop"]'), show = $('[data-yt-t="show"]'), next = $('[data-yt-t="next"]');
  const copyT = $('[data-yt-t="copy-title"]'), copyD = $('[data-yt-t="copy-desc"]');
  const fTitle = $('[data-yt-t="title"]'), fDesc = $('[data-yt-t="desc"]');
  const pct = $("[data-yt-pct]"), tc = $("[data-yt-tc]"), dc = $("[data-yt-dc]");
  const vid = $(".yt__vid video");
  // lengths as YouTube counts them: the file name it starts from, the pasted title, the pasted description
  const FILE_N = 32, TITLE_N = 16, DESC_N = 210;

  /* ---------- a clock that only runs while the card is in view ---------- */
  let vt = 0, last = 0, raf = 0, running = false, gen = 0;
  const waits = new Set();
  let upTween = null, procUntil = 0;
  const frame = (now) => {
    vt += Math.min(64, now - last); last = now;
    waits.forEach((w) => { if (vt >= w.at) { waits.delete(w); w.res(); } });
    if (upTween) {
      const p = Math.min(1, (vt - upTween.t0) / upTween.dur);
      pct.textContent = String(Math.floor((1 - Math.pow(1 - p, 1.4)) * 100));
      if (p >= 1) { upTween = null; dlg.classList.remove("is-uploading"); dlg.classList.add("is-processing"); procUntil = vt + 1200; }
    }
    if (procUntil && vt >= procUntil) { procUntil = 0; dlg.classList.remove("is-processing"); }
    raf = requestAnimationFrame(frame);
  };
  const sleep = (ms, g) => new Promise((res, rej) => {
    waits.add({ at: vt + ms, res: () => (g === gen ? res() : rej(STOP)) });
  });
  const anims = () => [cur, file, cv].flatMap((el) => el.getAnimations());
  const pauseAll = () => { running = false; cancelAnimationFrame(raf); anims().forEach((a) => a.playState === "running" && a.pause()); };
  const playAll = () => {
    if (running) return;
    running = true; last = performance.now(); raf = requestAnimationFrame(frame);
    anims().forEach((a) => a.playState === "paused" && a.play());
  };

  /* ---------- geometry: points inside the stage, in its own (unscaled) pixels ---------- */
  const pt = (el, ax = 0.5, ay = 0.5) => {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / stage.offsetWidth || 1;
    return { x: (r.left + r.width * ax - s.left) / k, y: (r.top + r.height * ay - s.top) / k };
  };
  const tip = () => ({ x: cur.offsetWidth * 5.2 / 24, y: cur.offsetHeight * 2.6 / 24 });
  let cx = 0, cy = 0, fx = 0, fy = 0;
  const tr = (x, y) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  const at = (x, y) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;   // the translate property: scale and rotate never move it
  // keep where it ended as plain style; a cancelled one (the loop was reset) just stops
  const settle = (a) => a.finished.then(() => { try { a.commitStyles(); } catch (_) {} a.cancel(); }, () => {});
  const curTo = (p, ms, g, ease = "cubic-bezier(.55,.05,.25,1)") => {
    const t = tip(), x = p.x - t.x, y = p.y - t.y;
    const a = cur.animate([{ translate: at(cx, cy) }, { translate: at(x, y) }], { duration: ms, easing: ease, fill: "forwards" });
    cx = x; cy = y;
    return settle(a).then(() => { if (g !== gen) throw STOP; });
  };
  const curAt = (p) => { const t = tip(); cx = p.x - t.x; cy = p.y - t.y; cur.style.translate = at(cx, cy); };
  const fade = (el, to, ms) => settle(el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: ms, easing: "ease-out", fill: "forwards" }));
  const press = async (el, g) => {
    el?.classList.add("is-down");
    cur.animate([{ scale: 1 }, { scale: 0.86 }, { scale: 1 }], { duration: 220, easing: "ease-out" });
    await sleep(130, g);
    el?.classList.remove("is-down");
  };

  /* ---------- the app window's camera: Where to post, or Titles & show notes ---------- */
  const panB = () => {
    const l = $(".yt__col--l"), r = $(".yt__col--r");
    return { x: cv.parentElement.clientWidth - cv.offsetWidth, y: -(r.offsetTop - l.offsetTop) };
  };
  let cam = { x: 0, y: 0 };
  const pan = (to, ms) => {
    const a = cv.animate([{ transform: tr(cam.x, cam.y) }, { transform: tr(to.x, to.y) }], { duration: ms, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
    cam = to;
    return settle(a);
  };
  const panSet = (to) => { cam = to; cv.style.transform = tr(to.x, to.y); };

  /* after a paste the caret is at the end, so the box shows the end: the chapter line */
  const dval = fDesc.querySelector(".yt__v1"), dbox = fDesc.querySelector(".yt__bv");
  const toEndOfText = (on) => {
    const raw = on ? Math.max(0, dval.offsetHeight - dbox.clientHeight + 2) : 0;
    const over = Math.round(raw);
    dval.style.transform = over ? `translateY(${-over}px)` : "";
  };

  /* ---------- the two ends of the loop ---------- */
  const reset = (done) => {
    [cur, file, cv].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    cur.style.opacity = "0"; file.style.opacity = "0";
    upTween = null; procUntil = 0;
    dlg.classList.toggle("is-up", !done);
    dlg.classList.toggle("is-file", !done);
    dlg.classList.toggle("is-uploading", !done);
    dlg.classList.remove("is-processing");
    fTitle.classList.toggle("is-file", !done);
    fDesc.classList.toggle("is-empty", !done);
    [fTitle, fDesc].forEach((f) => f.classList.remove("is-focus", "is-sel"));
    tc.textContent = String(done ? TITLE_N : FILE_N);
    dc.textContent = String(done ? DESC_N : 0);
    pct.textContent = done ? "100" : "0";
    drop.classList.remove("is-over");
    [copyT, copyD, show, next].forEach((b) => b.classList.remove("is-copied", "is-hover", "is-down"));
    panSet({ x: 0, y: 0 });
    toEndOfText(done);
  };

  /* ---------- the loop: what the user does ---------- */
  const narrow = () => stage.offsetWidth < 520;
  const run = async (g, first) => {
    reset(false);
    await sleep(first ? 1500 : 600, g);   // the first time, the windows are still rising
    // the pointer arrives on the YouTube row
    const s0 = pt(show);
    curAt({ x: s0.x + stage.offsetWidth * 0.18, y: s0.y + stage.offsetWidth * 0.06 });
    await fade(cur, 1, 220);
    await curTo(s0, 820, g);
    show.classList.add("is-hover");
    await sleep(160, g);
    await press(show, g);
    // Show the video: Finder shows the file, selected
    await sleep(260, g);
    const spot = narrow()
      ? { x: stage.offsetWidth * 0.68 - file.offsetWidth / 2, y: s0.y - file.offsetHeight * 1.25 }
      : { x: stage.offsetWidth * 0.83 - file.offsetWidth / 2, y: stage.offsetHeight * 0.1 };
    fx = spot.x; fy = spot.y;
    file.style.translate = at(fx, fy);
    file.animate([{ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1 }], { duration: 340, easing: "cubic-bezier(.2,.9,.3,1)", fill: "forwards" });
    show.classList.remove("is-hover");
    await sleep(420, g);
    // grab it
    await curTo(pt($(".yt__thumb"), 0.55, 0.55), 700, g);
    await sleep(120, g);
    file.animate([{ scale: 1, rotate: "0deg" }, { scale: 1.06, rotate: "-4deg" }], { duration: 180, easing: "ease-out", fill: "forwards" });
    cur.animate([{ scale: 1 }, { scale: 0.9 }], { duration: 160, fill: "forwards" });
    await sleep(160, g);
    // drag it onto Studio's upload circle
    const d = pt(drop, 0.5, 0.5), t = tip();
    const grab = { x: cx + t.x - fx, y: cy + t.y - fy };
    const dur = 1250, ease = "cubic-bezier(.5,0,.2,1)";
    const mid = { x: (cx + d.x - t.x) / 2 + stage.offsetWidth * 0.03, y: Math.min(cy, d.y - t.y) - stage.offsetWidth * 0.02 };
    cur.animate([{ translate: at(cx, cy) }, { translate: at(mid.x, mid.y), offset: 0.45 }, { translate: at(d.x - t.x, d.y - t.y) }], { duration: dur, easing: ease, fill: "forwards" });
    const fa = file.animate([
      { translate: at(fx, fy) },
      { translate: at(mid.x + t.x - grab.x, mid.y + t.y - grab.y), offset: 0.45 },
      { translate: at(d.x - grab.x, d.y - grab.y) },
    ], { duration: dur, easing: ease, fill: "forwards" });
    cx = d.x - t.x; cy = d.y - t.y; fx = d.x - grab.x; fy = d.y - grab.y;
    await sleep(dur * 0.62, g);
    drop.classList.add("is-over");
    await fa.finished.catch(() => {});
    if (g !== gen) throw STOP;
    // let go: Studio takes it and opens Details
    cur.animate([{ scale: 0.9 }, { scale: 1 }], { duration: 160, fill: "forwards" });
    file.animate([{ opacity: 1, scale: 1.06 }, { opacity: 0, scale: 0.55 }], { duration: 260, easing: "ease-in", fill: "forwards" });
    await sleep(320, g);
    drop.classList.remove("is-over");
    dlg.classList.remove("is-up");
    upTween = { t0: vt, dur: 9200 };
    await sleep(700, g);
    // the app: Copy description (the description plus its chapter line)
    await curTo(pt(copyD), 950, g);
    copyD.classList.add("is-hover");
    await press(copyD, g);
    copyD.classList.add("is-copied");
    const unCopy = (b) => sleep(1500, g).then(() => b.classList.remove("is-copied", "is-hover")).catch(() => {});
    unCopy(copyD);
    await sleep(320, g);
    await curTo(pt(fDesc.querySelector(".yt__bv"), 0.4, 0.3), 880, g);
    await press(null, g);
    fDesc.classList.add("is-focus");
    await sleep(420, g);
    fDesc.classList.remove("is-empty"); dc.textContent = String(DESC_N);
    await sleep(520, g);
    toEndOfText(true);
    await sleep(700, g);
    fDesc.classList.remove("is-focus");
    // the app: a title idea from Apple Intelligence
    await pan(panB(), 950);
    if (g !== gen) throw STOP;
    await curTo(pt(copyT), 900, g);
    copyT.classList.add("is-hover");
    await press(copyT, g);
    copyT.classList.add("is-copied");
    unCopy(copyT);
    await sleep(320, g);
    await curTo(pt(fTitle.querySelector(".yt__bv"), 0.5, 0.5), 880, g);
    await press(null, g);
    fTitle.classList.add("is-focus", "is-sel");
    await sleep(480, g);
    fTitle.classList.remove("is-file", "is-sel"); dlg.classList.remove("is-file"); tc.textContent = String(TITLE_N);
    await sleep(650, g);
    fTitle.classList.remove("is-focus");
    // uploaded and processed: Next
    while (upTween || procUntil) await sleep(120, g);
    await curTo(pt(next), 900, g);
    next.classList.add("is-hover");
    await sleep(3000, g);
    // rewind, softly
    await fade(cur, 0, 260);
    next.classList.remove("is-hover");
    dlg.classList.add("is-up");
    await pan({ x: 0, y: 0 }, 800);
    await sleep(500, g);
  };

  let started = false, inView = false, covered = false;
  const loop = async () => {
    const g = ++gen;
    let first = root.classList.contains("is-pre");
    root.classList.remove("is-pre");
    try { for (;;) { await run(g, first); first = false; } } catch (e) { if (e !== STOP && g === gen) throw e; }
  };
  const film = (on) => {
    if (!vid) return;
    if (on) {
      if (!vid.getAttribute("src")) { vid.src = vid.dataset.src; vid.load(); }
      vid.play().catch(() => {});
    } else if (!vid.paused) vid.pause();
  };
  const sync = () => {
    const go = inView && !covered && !document.hidden;
    if (reduced) return;
    film(go);
    if (go) {
      playAll();
      if (!started) { started = true; loop(); }
    } else pauseAll();
  };

  /* ---------- when to move ---------- */
  if (reduced) {   // the finished dialog; the picture stays a still
    reset(true);
    document.fonts?.ready.then(() => toEndOfText(true));
    addEventListener("resize", () => toEndOfText(true));
    return;
  }
  reset(false);
  root.classList.add("is-pre");
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }, { threshold: 0.3 }).observe(stage);
  root.closest(".hm-ch")?.addEventListener("hm-cover", (e) => { covered = !!e.detail; sync(); });
  document.addEventListener("visibilitychange", sync);
})();

/* ==================== voice ==================== */
/* 06 Hands-free: Siri runs the Record screen of Taylormade Podcast 1.0 (4).
   Every line in the window is the app's own text (Intents.swift, StudioView.swift, RunSheetPanel.swift,
   Studio.swift, EpisodesView.swift). The picture is Nelson's own take "2 Tonight at 7": the app's show file,
   0:00.2 to 0:09.6, then 0:59.0 to the end at 1:04, with its mic's real levels driving the meter.
   Plays while the card is on screen; pauses when it is scrolled away or covered by the next card. */
(() => {
  const root = document.querySelector("[data-voice]");
  if (!root) return;
  const q = (s) => root.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);

  const vid = q(".voice__vid"), box = q(".voice__box"), meter = q(".voice__meter"), micRow = q(".tmw__mic");
  const el = {
    t: q("[data-t]"), chip: q("[data-chip]"), layout: q("[data-layout]"), n: q("[data-n]"), btn: q("[data-btn]"),
    space: q("[data-space]"), mic: q("[data-mic]"), topic: q("[data-topic]"), next: q("[data-next]"),
    count: q("[data-count]"), mark: q("[data-mark]"), toast: q("[data-toast]"), st: q("[data-status]"),
    st2: q("[data-status2]"), ask: q("[data-ask]"), reply: q("[data-reply]"),
  };
  const tabs = [...root.querySelectorAll("[data-tab]")];
  const set = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const flag = (cls, on) => root.classList.toggle(cls, on);
  const clock = (s) => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  /* "Mic 1 - Host.wav" peak levels, 20 a second, on the app's -60…0 dBFS meter scale */
  const LV = {
    a: [0,.136,.149,.167,.101,.319,.543,.599,.585,.627,.668,.649,.589,.57,.473,.417,.576,.793,.813,.774,.545,.681,.695,.649,.591,.46,.555,.674,.659,.292,.578,.589,.544,.511,.637,.654,.62,.571,.468,.049,0,0,0,0,.36,.474,.607,.626,.521,.701,.673,.609,.601,.594,.661,.647,.536,.475,.578,.572,.549,.486,.555,.601,.669,.608,.528,.481,.545,.569,.549,.576,.574,.567,.331,.14,.043,.052,.148,.449,.65,.647,.71,.628,.607,.529,.531,.561,.532,.469,.302,0,0,0,0,0,0,0,0,0,.34,.649,.537,.585,.698,.627,.597,.511,.415,.18,.603,.599,.511,.108,.494,.493,.478,.21,.464,.548,.503,.486,.455,.452,.388,.509,.527,.488,.45,.198,.274,.146,0,.271,.572,.53,.19,.52,.599,.615,.585,.588,.483,.439,.395,.541,.698,.726,.697,.594,.487,.5,.49,.478,.46,.452,.414,.546,.579,.491,.546,.57,.58,.558,.414,.143,.213,.118,0,0,.16,.519,.465,.403,.556,.636,.527,.508,.184,.55,.524,.493,.18,.517,.577,.552,.521,.568],
    b: [.403,.458,.426,.359,.039,.064,.001,0,0,0,.039,.108,.298,.625,.636,.639,.449,.493,.605,.524,.496,.543,.65,.64,.298,.268,.6,.603,.51,.634,.606,.584,.485,.278,0,0,0,0,0,.23,.376,.546,.539,.467,.442,.482,.498,.466,.424,.497,.528,.518,.518,.399,.375,.483,.47,.485,.517,.468,.401,.108,.235,.032],
  };
  const A_LEN = 9.4, A_AT = 0.2, B_AT = 59.0, FILE = 14.5;          // voice-show.mp4 = take 0:00.2-0:09.6 + 0:59.0-1:04.1
  const takeAt = (f) => (f < A_LEN ? A_AT + f : B_AT + (f - A_LEN));
  const levelAt = (f) => (f < A_LEN ? LV.a[Math.floor(f * 20)] : LV.b[Math.floor((f - A_LEN) * 20)]) || 0;

  /* ---------- the script (seconds) ---------- */
  const REC = 5.05, STOP = REC + FILE, LOOP = 31.6;
  const STATUS = ["Looking for long pauses…", "Making the podcast audio…", "Making the video to post…", "Writing the transcript…", "Making vertical clips… 1 of 1", "Writing title ideas and show notes…"];
  const VIDEO_PCT = [23.7, 25.2];                                    // "Making the video to post… NN%" counts up here
  let phase = "idle", markShown = "", status = "", pct = -1;

  const setPhase = (p) => {
    phase = p; root.dataset.phase = p;
    set(el.chip, p === "rec" ? "● RECORDING" : "PREVIEW");
    set(el.btn, { idle: "Record", count: "Cancel", rec: "Stop", saving: "Saving", eps: "Saving" }[p]);
    set(el.space, p === "saving" || p === "eps" ? "Saving your files…" : "12.4 hrs of space left");
    set(el.next, p === "idle" || p === "count" ? "Topic 1 starts when you hit Record" : "You're on the last one");
    tabs.forEach((s) => s.classList.toggle("on", (s.dataset.tab === "eps") === (p === "eps")));
  };
  const setStatus = (s) => { status = s; set(el.st, s); set(el.st2, s); };
  const toast = (text) => { if (text) set(el.toast, text); flag("is-toast", !!text); };
  const ask = (text) => {
    el.ask.textContent = "";
    text.split(" ").forEach((w, i, all) => {
      const s = document.createElement("span");
      s.textContent = (i === 0 ? "“" : "") + w + (i === all.length - 1 ? "”" : "");
      el.ask.append(s, i < all.length - 1 ? " " : "");
    });
    el.reply.textContent = ""; flag("is-reply", false);
  };
  const word = (i) => { const s = el.ask.children[i]; if (s) s.classList.add("on"); };
  const reply = (text) => { el.reply.textContent = text; void el.reply.offsetWidth; flag("is-reply", true); };
  const tick = (n) => { set(el.n, String(n)); el.n.classList.remove("is-tick"); void el.n.offsetWidth; el.n.classList.add("is-tick"); };

  const cues = [];
  const cue = (at, fn) => cues.push([at, fn]);
  const say = (at, text, step) => {
    cue(at, () => { ask(text); flag("is-siri", true); flag("is-listen", true); });
    text.split(" ").forEach((_, i) => cue(at + 0.22 + i * step, () => word(i)));
  };

  // 1. "Start recording in Taylormade Podcast." Siri: "Recording in 3, 2, 1." (Intents.swift:33), then the 3-2-1 countdown
  say(0.6, "Start recording in Taylormade Podcast", 0.21);
  cue(2.05, () => { flag("is-listen", false); setPhase("count"); tick(3); });   // Record runs first, then Siri answers
  cue(2.15, () => reply("Recording in 3, 2, 1."));
  cue(3.05, () => tick(2));
  cue(4.05, () => tick(1));
  cue(4.6, () => flag("is-siri", false));
  // 2. Recording: ● RECORDING, the REC pill and timer, Stop
  cue(REC, () => { setPhase("rec"); playFrom(0); });
  // 3. "Mark a clip moment in Taylormade Podcast." No spoken answer (Intents.swift:55-58); the app's toast says it
  say(9.55, "Mark a clip moment in Taylormade Podcast", 0.15);
  cue(10.75, () => { flag("is-listen", false); flag("is-siri", false); });
  cue(10.9, () => {
    markShown = clock(takeAt(10.9 - REC));
    set(el.mark, markShown); set(el.count, "1"); flag("is-marked", true);
    toast(`★ Clip moment 1 saved at ${markShown}`);
  });
  cue(REC + A_LEN - 0.28, () => { box.classList.remove("is-dip"); void box.offsetWidth; box.classList.add("is-dip"); flag("is-b", true); });
  cue(14.4, () => toast(""));
  // 4. "Stop recording in Taylormade Podcast." Siri: "Stopped. Saving the episode." (Intents.swift:46)
  say(17.7, "Stop recording in Taylormade Podcast", 0.2);
  cue(19.2, () => flag("is-listen", false));
  cue(STOP, () => { setPhase("saving"); vid.pause(); reply("Stopped. Saving the episode."); });
  cue(21.3, () => flag("is-siri", false));
  // 5. Saved: Episodes, the toast, and the after-Stop jobs one at a time (ui-spec A9)
  cue(21.5, () => { setStatus(STATUS[0]); setPhase("eps"); });
  cue(21.65, () => toast("Saved! Your episode is ready to edit."));
  cue(22.5, () => setStatus(STATUS[1]));
  cue(23.4, () => setStatus(STATUS[2]));
  cue(25.15, () => toast(""));
  cue(25.4, () => { pct = -1; setStatus(STATUS[3]); });
  cue(26.3, () => setStatus(STATUS[4]));
  cue(27.2, () => setStatus(STATUS[5]));
  // 6. iPhone, coming soon: "start recording"
  cue(27.5, () => flag("is-phone", true));
  cue(28.15, () => flag("is-bubble", true));
  cue(30.9, () => { flag("is-bubble", false); flag("is-phone", false); flag("is-reset", true); });
  cues.sort((x, y) => x[0] - y[0]);

  /* ---------- state ---------- */
  const resetState = () => {
    setPhase("idle"); setStatus(STATUS[0]); toast(""); pct = -1;
    ["is-siri", "is-listen", "is-reply", "is-marked", "is-b", "is-phone", "is-bubble"].forEach((c) => flag(c, false));
    set(el.count, "0"); set(el.t, "00:00"); set(el.topic, "00:00 on this topic"); set(el.layout, "Cam 1"); tick(3);
    meterTo(0, 0); hold = 0;
    box.classList.remove("is-dip");
    if (vid.getAttribute("src")) { vid.pause(); try { vid.currentTime = 0; } catch (_) {} }
  };

  let hold = 0, holdUntil = 0, talkUntil = -1;
  const meterTo = (lvl, f) => {
    meter.style.setProperty("--m", lvl.toFixed(3));
    meter.classList.toggle("loud", lvl > 0.8);
    if (lvl >= hold) { hold = lvl; holdUntil = f + 1; } else if (f > holdUntil) hold = Math.max(lvl, hold - 0.02);
    meter.style.setProperty("--h", hold.toFixed(3));
    meter.style.setProperty("--ho", hold > 0.02 ? 1 : 0);
    if (lvl > 0.3) talkUntil = f + 0.45;
    const talking = phase === "rec" && f < talkUntil;
    micRow.classList.toggle("talk", talking);
    set(el.mic, talking ? "Talking" : "Ready");
  };

  /* ---------- the video ---------- */
  let wantVideo = !saveData;
  const load = () => {
    if (!wantVideo || vid.getAttribute("src")) return;
    vid.src = vid.dataset.src; vid.preload = "auto"; vid.load();
  };
  vid.addEventListener("error", () => { wantVideo = false; flag("is-novid", true); });
  if (!wantVideo) flag("is-novid", true);
  const playFrom = (f) => {
    if (!wantVideo) return;
    load();
    try { vid.currentTime = f; } catch (_) {}
    const p = vid.play(); if (p && p.catch) p.catch(() => {});
  };

  /* ---------- the clock: runs only while the card is on screen ---------- */
  let t = 0, ci = 0, raf = 0, last = 0, seen = false, covered = false, away = 0, began = false;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t += dt;
    if (t >= LOOP) { t = 0; ci = 0; resetState(); flag("is-reset", false); }
    while (ci < cues.length && cues[ci][0] <= t) cues[ci++][1]();
    if (phase === "rec") {
      const f = Math.min(FILE, t - REC), take = takeAt(f);
      set(el.t, clock(take));
      set(el.topic, `${clock(take)} on this topic`);
      set(el.layout, take < 1.218 ? "Cam 1 + Cam 3" : "Cam 1");          // the take's real cuts (episode.json)
      meterTo(levelAt(f), f);
      if (wantVideo && vid.readyState >= 2) {
        if (Math.abs(vid.currentTime - f) > 0.3) { try { vid.currentTime = f; } catch (_) {} }
        if (vid.paused) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); }
      }
    } else if (phase !== "idle" && phase !== "count") meterTo(0, t);
    if (status === STATUS[2] && t >= VIDEO_PCT[0] && t < 25.4) {
      const n = Math.min(100, Math.floor(((t - VIDEO_PCT[0]) / (VIDEO_PCT[1] - VIDEO_PCT[0])) * 100));
      if (n !== pct) { pct = n; set(el.st, `Making the video to post… ${n}%`); set(el.st2, `Making the video to post… ${n}%`); }
    }
    raf = requestAnimationFrame(frame);
  };
  const running = () => seen && !covered && !document.hidden;
  const update = () => {
    if (running()) {
      if (raf) return;
      if (!began) { flag("is-in", true); requestAnimationFrame(() => flag("is-pre", false)); }
      if (!began || (away && performance.now() - away > 1500)) { t = 0; ci = 0; resetState(); flag("is-reset", false); began = true; }
      else if (phase === "rec" && wantVideo) { const p = vid.play(); if (p && p.catch) p.catch(() => {}); }
      away = 0; last = performance.now(); raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf); raf = 0; away = performance.now(); vid.pause();
    }
  };

  /* ---------- reduced motion: one finished frame, nothing moves ---------- */
  if (reduced) {
    wantVideo = false; flag("is-novid", true);
    setPhase("rec");
    set(el.t, "00:06"); set(el.topic, "00:06 on this topic"); set(el.mark, "00:06"); set(el.count, "1");
    flag("is-marked", true);
    ask("Start recording in Taylormade Podcast"); [...el.ask.children].forEach((s) => s.classList.add("on"));
    reply("Recording in 3, 2, 1."); flag("is-siri", true);
    meterTo(0.62, 0); micRow.classList.add("talk"); set(el.mic, "Talking");
    return;
  }

  resetState();
  flag("is-pre", true);
  new IntersectionObserver(([e]) => { if (e.isIntersecting) load(); }, { rootMargin: "900px 0px" }).observe(root);
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; update(); }, { threshold: 0.3 }).observe(root);
  const card = root.closest(".hm-ch");
  if (card) card.addEventListener("hm-cover", (e) => { covered = !!e.detail; update(); });
  document.addEventListener("visibilitychange", update);
})();

/* ==================== brand ==================== */
/* TAYLORMADE PODCAST · chapter 07, Your brand.
   Acts out the app's Setup › 4 Your show (choose a logo, type the line under the name, choose an intro and
   an outro), then plays the video the app made from those settings on a phone, with lenses on the logo and
   the name card and a timeline of intro, show and outro. The video is real output of the app's own
   CleanShow/ShowGraphics code (v1.0-4) on Nelson's "2 Tonight at 7" take. Runs only while on screen. */
(() => {
  const root = document.querySelector("[data-brand]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = !!navigator.connection?.saveData;
  const video = $(".brand-vid");
  const typed = $("[data-typed]");
  const status = $("[data-brand-status]");
  const now = $("[data-brand-now]");
  const head = $(".brand-head");
  const strip = $(".brand-strip");
  const seg = { in: $(".brand-seg--in"), show: $(".brand-seg--show"), out: $(".brand-seg--out") };
  const lens = { logo: $(".brand-lens--logo"), card: $(".brand-lens--card") };
  const ctx = { logo: lens.logo.getContext("2d"), card: lens.card.getContext("2d") };
  if (!video || !typed || !status || !head) return;

  /* What he types under his name in Setup (his name itself comes from Mics). */
  const TITLE = "Taylormade Creative";

  /* Phase A, the setup, in ms. */
  const A = { logoPress: 1100, logoSet: 1300, focus: 2300, type: 2600, per: 72, blur: 4500,
    introPress: 4800, introSet: 5000, outroPress: 5800, outroSet: 6000, make: 6900, made: 8500, toB: 8800, play: 9800 };

  /* The video: 0 to 12 s of the app's 69.17 s output, then its last 5 s (the end of the show and the outro).
     Its intro is 2.5 s (CleanShow.Made.introSeconds); the show is 64.17 s; the name card is up 1.9 to 6.9 s
     into the show (ShowGraphics.nameCards for this take). */
  const INTRO = 2.5, SHOW = 64.1667, OUTRO = 2.5, JOIN = 12, SKIP = 52.1667, CARD = [1.9, 6.9];
  const showAt = (t) => (t < JOIN ? t : t + SKIP) - INTRO;   // seconds into the show: < 0 intro, >= SHOW outro
  /* Where the crops sit in each 1088x960 frame (the phone picture is the left 540x960): the name card
     (x 30-430, y 1320-1500 of the app's 1080x1920 frame) at 1.35x, and the logo corner (x 940-1060, y 170-290) at 2x. */
  const FRAME_W = 1088;
  const CROP = { card: [548, 0, 540, 243], logo: [548, 252, 240, 240] };
  const POSTER_T = 6.5;

  const set = (c, on) => root.classList.toggle(c, !!on);
  let nowText = "";
  const say = (text) => {
    if (!now || text === nowText) return;
    nowText = text;
    if (reduced) { now.textContent = text; return; }
    now.classList.add("is-swap");
    setTimeout(() => { now.textContent = nowText; now.classList.remove("is-swap"); }, 220);
  };

  /* ---------- phase A: Setup › Your show ---------- */
  let typedN = -1, statusText = "";
  const renderA = (t) => {
    set("p-logo", t >= A.logoPress && t < A.logoPress + 200);
    set("s-logo", t >= A.logoSet);
    set("s-focus", t >= A.focus && t < A.blur);
    const n = Math.max(0, Math.min(TITLE.length, Math.floor((t - A.type) / A.per) + 1));
    if (n !== typedN) { typedN = n; typed.textContent = TITLE.slice(0, n); }
    set("s-typed", n > 0);
    set("p-intro", t >= A.introPress && t < A.introPress + 200);
    set("s-intro", t >= A.introSet);
    set("p-outro", t >= A.outroPress && t < A.outroPress + 200);
    set("s-outro", t >= A.outroSet);
    set("s-make", t >= A.make && t < A.toB + 300);
    const p = (t - A.make - 300) / (A.made - A.make - 300);
    const st = p < 0 ? "Making the video to post…" : `Making the video to post… ${Math.round(Math.min(1, p) * 100)}%`;
    if (st !== statusText) { statusText = st; status.textContent = st; }
    say(t < A.focus - 150 ? "Choose your logo."
      : t < A.introPress - 150 ? "Your name comes from Mics. Add the line under it."
      : t < A.make - 100 ? "Add your own intro and outro."
      : "Stop, and the app makes the video to post.");
  };

  /* ---------- phase B: the video the app made ---------- */
  let box = null, lastX = null, jumpT = 0;
  const measure = () => {
    const r = (el) => ({ x: el.offsetLeft, w: el.offsetWidth });
    box = { in: r(seg.in), show: r(seg.show), out: r(seg.out) };
  };
  const draw = (src, k) => {
    const [x, y, w, h] = CROP[k];
    const f = (src.videoWidth || src.naturalWidth || FRAME_W) / FRAME_W;
    try { ctx[k].drawImage(src, x * f, y * f, w * f, h * f, 0, 0, lens[k].width, lens[k].height); } catch (_) {}
  };
  const renderB = (t, src) => {
    const s = showAt(t);
    const inShow = s >= 0 && s < SHOW;
    const onCard = s >= CARD[0] && s < CARD[1];
    set("a-in", s < 0);
    set("a-show", inShow);
    set("a-out", s >= SHOW);
    set("a-card", onCard);
    set("l-logo", s >= 0.35 && s < SHOW - 0.2);
    set("l-card", s >= CARD[0] - 0.15 && s < CARD[1] + 0.35);
    if (src && (src.readyState === undefined || src.readyState >= 2)) {
      if (root.classList.contains("l-logo")) draw(src, "logo");
      if (root.classList.contains("l-card")) draw(src, "card");
    }
    if (!box) measure();
    const x = s < 0 ? box.in.x + box.in.w * Math.max(0, (s + INTRO) / INTRO)
      : s < SHOW ? box.show.x + box.show.w * (s / SHOW)
      : box.out.x + box.out.w * Math.min(1, (s - SHOW) / OUTRO);
    if (lastX !== null && Math.abs(x - lastX) > box.show.w * 0.3) {
      head.classList.add("is-jump");
      clearTimeout(jumpT);
      jumpT = setTimeout(() => head.classList.remove("is-jump"), 600);
    }
    lastX = x;
    head.style.setProperty("--x", `${x.toFixed(1)}px`);
    say(s < 0 ? "Your intro plays first."
      : onCard || (s >= CARD[1] && s < CARD[1] + 0.4) ? "Your name, the first time you're on camera up close."
      : s < SHOW ? "Your logo, in the corner the whole show."
      : "Then your outro.");
  };
  addEventListener("resize", () => { box = null; });

  /* ---------- reduced motion (or Save-Data): the finished state ---------- */
  if (reduced || saveData) {
    ["s-logo", "s-typed", "s-intro", "s-outro", "is-b"].forEach((c) => set(c, true));
    typed.textContent = TITLE;
    const img = new Image();
    img.onload = () => renderB(POSTER_T, img);
    img.src = video.getAttribute("poster");
    requestAnimationFrame(() => renderB(POSTER_T, null));
    return;
  }

  /* ---------- the loop: A (setup), B (the video), C (clear and start again) ---------- */
  video.removeAttribute("poster");   // the video opens on its own first frame (the intro)
  set("is-out", true);               // fades in the first time it's seen
  let phase = "A", tA = 0, tB = 0, tC = 0, raf = 0, last = 0, running = false, started = false, playing = false;
  const load = () => {
    if (video.getAttribute("src")) return;
    video.src = video.dataset.brandSrc;
    video.preload = "auto";
    video.load();
  };
  const reset = () => {
    root.classList.add("no-t");
    ["is-b", "is-out", "s-logo", "s-focus", "s-typed", "s-intro", "s-outro", "s-make", "p-logo", "p-intro", "p-outro",
      "l-logo", "l-card", "a-in", "a-show", "a-out", "a-card"].forEach((c) => set(c, false));
    set("is-out", true);
    typedN = -1; typed.textContent = ""; lastX = null;
    video.pause(); playing = false;
    try { video.currentTime = 0; } catch (_) {}
    void root.offsetWidth;
    root.classList.remove("no-t");
    requestAnimationFrame(() => set("is-out", false));
    phase = "A"; tA = 0; tB = 0; tC = 0;
  };
  video.addEventListener("ended", () => { if (phase === "B") { phase = "C"; tC = 0; set("is-out", true); playing = false; } });

  const frame = (ms) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, last ? ms - last : 16);
    last = ms;
    if (phase === "A") {
      tA += dt;
      renderA(tA);
      if (tA >= A.toB) { phase = "B"; tB = 0; set("s-focus", false); set("s-make", false); set("is-b", true); renderB(0, null); }
    } else if (phase === "B") {
      tB += dt;
      if (!playing && tB >= A.play - A.toB && video.readyState >= 3) {
        playing = true;
        try { video.currentTime = 0; } catch (_) {}
        video.play().catch(() => { playing = false; });
      }
      renderB(playing ? video.currentTime : 0, playing ? video : null);
    } else if (phase === "C") {
      tC += dt;
      if (tC >= 700) reset();
    }
  };
  const run = (on) => {
    if (on === running) return;
    running = on;
    if (on) {
      load();
      if (!started) { started = true; requestAnimationFrame(() => set("is-out", false)); }
      last = 0;
      raf = requestAnimationFrame(frame);
      if (phase === "B" && playing) video.play().catch(() => {});
    } else {
      cancelAnimationFrame(raf);
      if (!video.paused) video.pause();
    }
  };
  let seen = false, covered = false;
  const sync = () => run(seen && !covered && !document.hidden);
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { threshold: 0.3 }).observe(root);
  root.closest(".hm-ch")?.addEventListener("hm-cover", (e) => { covered = !!e.detail; sync(); });
  document.addEventListener("visibilitychange", sync);
})();

/* ==================== tall ==================== */
/* Card 09 · Vertical ("tall"): the Record screen acts out a vertical show.
   Footage: one video holding the app's own show (720x1280) and its two cameras (270x480 each),
   from Nelson's "2 Tonight at 7" take, 8.3 to 20.8 s. Everything on screen is drawn from it, so the
   show, the tiles and the phone stay frame for frame together.
   Beats (s): 1.3 Camera 1 turns tall · 4.15 the show follows, 2 s later (the app's ShapeWatch hold)
   · 5.8 Rotate stands the sideways camera up · 9.0 auto-switch stacks both (the app's real cut)
   · 10.4 the video to post lifts out into a phone · 16.9 again. */
(() => {
  const root = document.querySelector("[data-tall]");
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const files = $(".tall__src").dataset;
  const area = $("[data-area]"), showC = $("[data-show]"), chips = $("[data-chips]");
  const badge = $("[data-badge]"), badgeT = $("span", badge), layoutChip = $("[data-layout]");
  const tile1 = $('[data-tile="1"]'), tile3 = $('[data-tile="3"]');
  const c1 = $("canvas", tile1), c3 = $("canvas", tile3);
  const rot = $("[data-rot]"), cursor = $("[data-cursor]"), cam = $("[data-cam]"), view = $("[data-view]"), win = $("[data-win]");
  const phone = $("[data-phone]"), screen = $("[data-screen]"), nowEl = $("[data-now]");
  const card = root.closest(".hm-ch") || root;

  /* where each picture sits in the feeds frame (992x1280) */
  const SHOW = [0, 0, 720, 1280], CAM1 = [720, 0, 270, 480], CAM3 = [720, 480, 270, 480];
  /* the app's cut list for this take (episode.json), less the 8.3 s start: both cameras stacked */
  const STACK = [17.317 - 8.3, 20.318 - 8.3];
  const L = 16.9;

  /* cubic-bezier(.77, 0, .175, 1), the site's --ease-io */
  const bez = (x1, y1, x2, y2) => (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
      const d = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - cx / d));
    }
    return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  };
  const ease = bez(0.77, 0, 0.175, 1);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, p) => a + (b - a) * p;

  /* ---------- the picture source: the video once it plays, a still before ---------- */
  const img = new Image();
  img.decoding = "async";
  img.src = reduced ? files.end : files.start;
  const video = document.createElement("video");
  video.muted = true; video.loop = true; video.playsInline = true; video.preload = "none";
  video.setAttribute("muted", ""); video.setAttribute("playsinline", ""); video.setAttribute("aria-hidden", "true");
  video.className = "tall__feed";
  if (!reduced) root.append(video);   /* in the page (but unseen) so every browser decodes it; the canvases show it */
  const source = () => (video.readyState >= 2 ? video : img.complete && img.naturalWidth ? img : null);

  /* ---------- sizes ---------- */
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const fit = (c) => {
    const w = Math.round(c.clientWidth * dpr()), h = Math.round(c.clientHeight * dpr());
    if (w && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
  };
  const unit = () => win.clientWidth / (parseFloat(getComputedStyle(win).getPropertyValue("--D")) || 760);
  /* the show box in the area: 16:9 fitted (wide) to 9:16 at full height (tall), centred */
  const boxAt = (p, aw, ah) => {
    let ww = ah * 16 / 9, wh = ah;
    if (ww > aw) { ww = aw; wh = aw * 9 / 16; }
    const tw = ah * 9 / 16, th = ah;
    const w = lerp(ww, tw, p), h = lerp(wh, th, p);
    return { x: (aw - w) / 2, y: (ah - h) / 2, w, h };
  };
  /* aspect-fill with the app's headroom: a tall picture keeps 42% of its overflow above (ProgramEngine) */
  const fill = (ctx, s, r, b) => {
    const k = Math.max(b.w / r[2], b.h / r[3]);
    const dw = r[2] * k, dh = r[3] * k;
    const dx = b.x + (b.w - dw) / 2;
    const dy = dh > b.h ? b.y - (dh - b.h) * 0.42 : b.y + (b.h - dh) / 2;
    ctx.drawImage(s, r[0], r[1], r[2], r[3], dx, dy, dw, dh);
  };
  const rr = (ctx, b, rad) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, rad); else ctx.rect(b.x, b.y, b.w, b.h);
  };

  /* ---------- state ---------- */
  let t = 0, p1 = 0, ps = 0, pr = 0, stacked = false, phoneOn = false;
  const shape = (p) => {
    const aw = area.clientWidth, ah = area.clientHeight, u = unit();
    const b = boxAt(p, aw, ah);
    return { b, cx: b.x + 14 * u, cy: b.y + 14 * u, cw: b.w - 28 * u };
  };
  const placeChips = (p) => {
    const s = shape(p);
    chips.style.setProperty("--cx", s.cx.toFixed(1));
    chips.style.setProperty("--cy", s.cy.toFixed(1));
    chips.style.setProperty("--cw", s.cw.toFixed(1));
  };
  /* the chips move with the box and re-wrap into its narrow top (FLIP, transform only) */
  const morphChips = (dur) => {
    const kids = [...chips.children];
    const first = kids.map((k) => k.getBoundingClientRect());
    badgeT.textContent = "Vertical 9:16";
    badge.classList.add("is-swap");
    placeChips(1);
    kids.forEach((k, i) => {
      const a = first[i], z = k.getBoundingClientRect();
      k.style.transition = "none";
      k.style.transform = `translate(${a.left - z.left}px, ${a.top - z.top}px) scaleX(${a.width / z.width})`;
    });
    chips.getBoundingClientRect();
    /* the badge doesn't travel: it fades out where it was and comes back with its new words where it lands */
    badge.style.transition = "none"; badge.style.transform = ""; badge.style.opacity = "0";
    chips.getBoundingClientRect();
    kids.forEach((k) => {
      if (k === badge) return;
      k.style.transition = `transform ${dur}s cubic-bezier(.77, 0, .175, 1)`;
      k.style.transform = "";
    });
    badge.style.transition = `opacity .4s ease-out ${(dur * 0.6).toFixed(2)}s`;
    badge.style.opacity = "";
    setTimeout(() => badge.classList.remove("is-swap"), dur * 600);
  };
  const setStacked = (on) => {
    if (on === stacked) return;
    stacked = on;
    layoutChip.textContent = on ? "Cam 1 + Cam 3" : "Cam 1";
    tile3.classList.toggle("is-on", on);
  };
  let nowText = nowEl.textContent;
  const say = (text) => {
    if (text === nowText) return;
    nowText = text;
    if (reduced) { nowEl.textContent = text; return; }
    nowEl.classList.add("is-out");
    setTimeout(() => { nowEl.textContent = text; nowEl.classList.remove("is-out"); }, 220);
  };

  /* ---------- drawing ---------- */
  const draw = () => {
    const s = source();
    [showC, c1, c3].forEach(fit);
    const D = dpr();
    /* the show box */
    let ctx = showC.getContext("2d");
    ctx.clearRect(0, 0, showC.width, showC.height);
    const b0 = boxAt(ps, area.clientWidth, area.clientHeight);
    const b = { x: b0.x * D, y: b0.y * D, w: b0.w * D, h: b0.h * D };
    const rad = 10 * unit() * D;
    ctx.save(); rr(ctx, b, rad); ctx.clip();
    ctx.fillStyle = "#08080a"; ctx.fillRect(b.x, b.y, b.w, b.h);
    if (s) fill(ctx, s, SHOW, b);
    ctx.restore();
    ctx.strokeStyle = "#2e2d32"; ctx.lineWidth = D;
    rr(ctx, { x: b.x + D / 2, y: b.y + D / 2, w: b.w - D, h: b.h - D }, rad); ctx.stroke();
    /* Camera 1: held wide, then turned tall (its picture is fitted on ink, like the app's tiles) */
    ctx = c1.getContext("2d");
    const W = c1.width, H = c1.height;
    ctx.fillStyle = "#08080a"; ctx.fillRect(0, 0, W, H);
    if (s) {
      const tw = H * 9 / 16;
      const tb = { x: lerp(0, (W - tw) / 2, p1), y: 0, w: lerp(W, tw, p1), h: H };
      ctx.save(); ctx.beginPath(); ctx.rect(tb.x, tb.y, tb.w, tb.h); ctx.clip(); fill(ctx, s, CAM1, tb); ctx.restore();
    }
    /* Camera 3: on its side until Rotate turns it a quarter turn clockwise */
    ctx = c3.getContext("2d");
    const W3 = c3.width, H3 = c3.height;
    ctx.fillStyle = "#08080a"; ctx.fillRect(0, 0, W3, H3);
    if (s) {
      const k = lerp(W3 / 480, H3 / 480, pr);
      ctx.save(); ctx.translate(W3 / 2, H3 / 2); ctx.rotate((-Math.PI / 2) * (1 - pr));
      ctx.drawImage(s, CAM3[0], CAM3[1], CAM3[2], CAM3[3], -135 * k, -240 * k, 270 * k, 480 * k);
      ctx.restore();
    }
    /* the phone: the video to post */
    if (phoneOn) {
      fit(screen);
      ctx = screen.getContext("2d");
      ctx.fillStyle = "#050506"; ctx.fillRect(0, 0, screen.width, screen.height);
      if (s) fill(ctx, s, SHOW, { x: 0, y: 0, w: screen.width, h: screen.height });
    }
  };

  /* ---------- the beats ---------- */
  const camTo = (s, el) => {
    if (!el || s === 1) { cam.style.transform = ""; cursor.style.setProperty("--cur", 18); return; }
    const cr = cam.getBoundingClientRect(), r = el.getBoundingClientRect();
    const k = cr.width / cam.offsetWidth || 1;
    /* the tile in the middle of the view; past the window's edge is the same ink, so no clamping */
    const px = (r.left + r.width * 0.56 - cr.left) / k, py = (r.top + r.height * 0.5 - cr.top) / k;
    const vw = cam.offsetWidth, vh = cam.offsetHeight;
    const tx = vw / 2 - s * px, ty = vh / 2 - s * py;
    cam.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s})`;
    cursor.style.setProperty("--cur", (18 / s).toFixed(2));
  };
  const local = (el) => {
    const cr = cam.getBoundingClientRect(), r = el.getBoundingClientRect(), k = cr.width / cam.offsetWidth || 1;
    return { x: (r.left - cr.left) / k, y: (r.top - cr.top) / k, w: r.width / k, h: r.height / k };
  };
  const cursorAt = (x, y, now) => {
    if (now) cursor.style.transition = "none";
    cursor.style.setProperty("--px", x.toFixed(1)); cursor.style.setProperty("--py", y.toFixed(1));
    if (now) { cursor.getBoundingClientRect(); cursor.style.transition = ""; }
  };
  const zoomFor = () => (root.clientWidth <= 560 ? 2 : 2.15);
  const flyPhone = () => {
    phoneOn = true;
    const b = boxAt(1, area.clientWidth, area.clientHeight), ar = area.getBoundingClientRect();
    phone.classList.remove("is-flying", "is-leaving");
    phone.style.transition = "none"; phone.style.transform = ""; phone.style.opacity = "0";
    const sr = $(".mu-iphone__screen", phone).getBoundingClientRect();
    const k = b.w / sr.width;
    phone.style.setProperty("--fo", 0);
    phone.style.transform = `translate(${(ar.left + b.x - sr.left).toFixed(1)}px, ${(ar.top + b.y - sr.top).toFixed(1)}px) scale(${k.toFixed(4)})`;
    phone.style.opacity = "1";
    draw();
    phone.getBoundingClientRect();
    phone.style.transition = "";
    phone.classList.add("is-flying");
    phone.style.transform = "";
    phone.style.setProperty("--fo", 1);
    root.classList.add("is-lifted", "is-docked");
  };
  const LINES = {
    a: "Camera 1 decides the shape. Held wide, the show is 16:9.",
    b: "Turn Camera 1 tall. Two seconds later, the show turns 9:16.",
    c: "A camera plugged into the Mac is on its side? Rotate stands it up.",
    d: "Auto-switch keeps cutting. Two cameras stack, one above the other.",
    e: "The video to post is 1080 × 1920, ready for Reels, TikTok and Shorts.",
  };
  const EVENTS = [
    [1.3, () => say(LINES.b)],
    [4.15, () => { root.classList.add("is-tall"); morphChips(1.1); }],
    [5.8, () => { say(LINES.c); camTo(zoomFor(), tile3); }],
    [6.35, () => {
      const t3 = local(tile3), r = local(rot);
      cursorAt(t3.x + t3.w * 0.55, t3.y + t3.h * 0.95, true);
      cursor.classList.add("is-on");
      requestAnimationFrame(() => cursorAt(r.x + r.w / 2 - 1.8 / zoomFor(), r.y + r.h / 2 - 1 / zoomFor()));
    }],
    [7.1, () => rot.classList.add("is-hover")],
    [7.22, () => rot.classList.add("is-down")],
    [7.38, () => rot.classList.remove("is-down")],
    [7.75, () => root.classList.add("is-turned")],
    [8.35, () => { cursor.classList.remove("is-on"); rot.classList.remove("is-hover"); }],
    [8.5, () => camTo(1)],
    [9.0, () => say(LINES.d)],
    [10.4, () => { say(LINES.e); flyPhone(); }],
    [15.8, () => {
      root.classList.remove("is-lifted", "is-docked");
      phone.classList.remove("is-flying"); phone.classList.add("is-leaving");
      phone.style.transform = "translateY(3%) scale(.97)"; phone.style.opacity = "0";
    }],
    [16.35, () => { root.classList.add("is-fade"); nowEl.classList.add("is-out"); }],
  ];

  const reset = () => {
    t = 0; p1 = 0; ps = 0; pr = 0; phoneOn = false;
    root.classList.remove("is-tall", "is-turned", "is-lifted", "is-docked");
    view.style.transition = "opacity .45s ease-out"; setTimeout(() => { view.style.transition = ""; }, 500);
    cursor.classList.remove("is-on"); rot.classList.remove("is-hover", "is-down");
    cam.style.transition = "none"; cam.style.transform = ""; cam.getBoundingClientRect(); cam.style.transition = "";
    phone.classList.remove("is-flying", "is-leaving"); phone.style.transition = "none"; phone.style.transform = ""; phone.style.opacity = "0";
    badgeT.textContent = "Wide 16:9"; badge.classList.remove("is-swap");
    [...chips.children].forEach((k) => { k.style.transition = "none"; k.style.transform = ""; k.style.opacity = ""; });
    placeChips(0);
    stacked = true; setStacked(false);
    nowText = ""; say(LINES.a);
    if (video.readyState >= 1) { try { video.currentTime = 0; } catch (_) {} }
    root.classList.remove("is-fade");
    next = 0;
  };

  /* ---------- reduced motion: the finished state, still ---------- */
  if (reduced) {
    p1 = ps = pr = 1;
    root.classList.add("is-tall", "is-turned", "is-docked");
    badgeT.textContent = "Vertical 9:16";
    setStacked(true);
    phoneOn = true; phone.style.opacity = "1"; phone.style.setProperty("--fo", 1);
    nowEl.textContent = "Camera 1 is tall, so the show is 9:16. Rotate stood the sideways camera up, and the video to post is 1080 × 1920.";
    const paint = () => { placeChips(1); draw(); };
    img.addEventListener("load", paint);
    new ResizeObserver(paint).observe(root);
    paint();
    return;
  }

  /* ---------- the loop: runs only while the card is on screen and not covered ---------- */
  let next = 0, raf = 0, last = 0, seen = false, covered = false, started = false, loading = false;
  const frame = (ms) => {
    const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
    last = ms;
    if (video.readyState >= 2 && !video.paused) t += dt;
    while (next < EVENTS.length && t >= EVENTS[next][0]) EVENTS[next++][1]();
    if (t >= L) reset();
    p1 = ease(clamp((t - 1.3) / 0.85));
    ps = ease(clamp((t - 4.15) / 1.1));
    pr = ease(clamp((t - 7.3) / 0.7));
    if (ps >= 1) setStacked(video.currentTime >= STACK[0] && video.currentTime < STACK[1]);
    draw();
    raf = requestAnimationFrame(frame);
  };
  const run = () => {
    const go = seen && !covered && !document.hidden;
    if (go) {
      if (!video.getAttribute("src")) {
        if (loading) return;
        loading = true;
        video.src = files.feeds; video.preload = "auto"; video.load();
        video.addEventListener("canplay", () => { loading = false; run(); }, { once: true });
        return;
      }
      if (!started) { started = true; reset(); }
      video.play().catch(() => {});
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    } else {
      video.pause();
      cancelAnimationFrame(raf); raf = 0;
    }
  };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }, { threshold: 0.3 }).observe(root);
  card.addEventListener("hm-cover", (e) => { covered = !!e.detail; run(); });
  document.addEventListener("visibilitychange", run);
  img.addEventListener("load", () => { if (!raf) draw(); });
  new ResizeObserver(() => { if (!started) placeChips(0); else placeChips(ps >= 1 ? 1 : 0); if (!raf) draw(); }).observe(root);
  placeChips(0);
})();

/* ==================== mics ==================== */
/* Card 10 · Sound check ("mics"): the Record screen acts out Check mics, then the safety net.
   The app's own words and timings: 4 seconds per person, "Mics fixed" when each mic heard the other
   person louder in both turns (the app swaps the two seats' mics in one go), the "went silent" warning
   after 2 s of dead air, auto-switch going wide after 3 s of nobody, and after Stop the gap filled
   from the best backup (the iPhone filming that person first, the Mac's own mic next).
   The pictures are the app's practice cameras, drawn the way the app draws them (DemoArt).
   The waveforms are real: Nelson's "2 Tonight at 7" take, 0:20 to 0:30, with a gap made on purpose. */
(() => {
  const root = document.querySelector("[data-mics]");
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const card = root.closest(".hm-ch") || root;
  let wave = null;
  try { wave = JSON.parse($("[data-wave]").textContent); } catch (_) {}
  if (!wave) return;

  const pic = $("[data-pic]"), cam = $("[data-cam]"), cursor = $("[data-cursor]");
  const stateEl = $("[data-state]"), layoutEl = $("[data-layout]"), recEl = $("[data-rec]");
  const listen = $('[data-step="listen"]'), done = $('[data-step="done"]');
  const titleEl = $("[data-title]"), countEl = $("[data-count]"), ometer = $("[data-ometer]");
  const checkBtn = $("[data-check]"), doneBtn = $("[data-done]"), recordLabel = $("[data-rlabel]");
  const rows = { host: $('[data-who="host"]'), guest: $('[data-who="guest"]') };
  const meters = { host: $("[data-m]", rows.host), guest: $("[data-m]", rows.guest) };
  const stEl = { host: $("[data-st]", rows.host), guest: $("[data-st]", rows.guest) };
  const lift = $("[data-lift]"), micNote = $("[data-mic-note]"), nowEl = $("[data-now]");

  /* ---------- the real waveforms (10 s, 50 ms a bar); the gap is 22 to 27 s ---------- */
  const N = wave.mic.length, G0 = Math.round((wave.gap[0] - wave.t0) / (wave.t1 - wave.t0) * N), G1 = Math.round((wave.gap[1] - wave.t0) / (wave.t1 - wave.t0) * N);
  const bars = (vals, from, to, gapFlat, gapClass) => {
    let out = "";
    for (let i = from; i < to; i++) {
      const inGap = i >= G0 && i < G1;
      const h = inGap && gapFlat ? 1.4 : Math.max(2.2, vals[i] * 94);
      out += `<rect x="${(i - from + 0.2).toFixed(1)}" width=".6" y="${(50 - h / 2).toFixed(1)}" height="${h.toFixed(1)}"${inGap && gapClass ? ' class="is-gap"' : ""}/>`;
    }
    return out;
  };
  const svgOf = (sel) => $(`[data-tr="${sel}"] .mics__wave > svg`);
  [["mic", true, false], ["phone", false, true], ["mac", false, false]].forEach(([k, flat, mark]) => {
    const s = svgOf(k);
    s.setAttribute("viewBox", `0 0 ${N} 100`);
    s.innerHTML = bars(wave[k], 0, N, flat, mark);
  });
  const ls = $("svg", lift);
  ls.setAttribute("viewBox", `0 0 ${G1 - G0} 100`);
  ls.innerHTML = bars(wave.phone, G0, G1, false, false);

  /* a voice to drive the meters: the take's own loudness, 50 ms at a time */
  const env = (t) => {
    const x = ((t * 20) % N + N) % N, i = Math.floor(x), f = x - i;
    return wave.mic[i] * (1 - f) + wave.mic[(i + 1) % N] * f;
  };

  /* ---------- the practice cameras, as the app draws them (VideoFeeds.swift, DemoArt) ---------- */
  const HUES = ["#33291f", "#1f2630", "#2e1f29", "#212b24"];
  const drawPic = (camIdx, single, talk, time) => {
    const D = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(pic.clientWidth * D), H = Math.round(pic.clientHeight * D);
    if (!W) return;
    if (pic.width !== W || pic.height !== H) { pic.width = W; pic.height = H; }
    const c = pic.getContext("2d"), k = W / 1920;
    const g = c.createRadialGradient(W * 0.5, H * 0.38, 40 * k, W * 0.5, H * 0.38, W * 0.75);
    g.addColorStop(0, HUES[camIdx]); g.addColorStop(1, "#101014");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const people = single ? [0] : [0, 1], s = single ? 0.78 : 0.52;
    people.forEach((p, slot) => {
      const cx = (single ? 960 : slot === 0 ? 614.4 : 1305.6) * k;
      const bob = talk[p] ? Math.sin(time * 9 + p) * 6 : 0;
      const cy = (single ? 0.36 : 0.4) * 1080 + bob;
      const Y = (v) => (1080 - v) * k;
      c.fillStyle = p === 0 ? "#e9b949" : "#ccc7b8";
      c.save(); c.beginPath(); c.rect(cx - 320 * s * k, Y(cy + 70 * s), 640 * s * k, H); c.clip();
      c.beginPath(); c.arc(cx, Y(cy - 170 * s), 300 * s * k, 0, Math.PI * 2); c.fill(); c.restore();
      c.beginPath(); c.arc(cx, Y(cy + 250 * s), 150 * s * k, 0, Math.PI * 2); c.fill();
      const open = talk[p] ? Math.abs(Math.sin(time * 13 + p * 2)) : 0, mh = (10 + 34 * open) * s;
      c.fillStyle = "#101014"; c.fillRect(cx - 42 * s * k, Y(cy + 200 * s + mh / 2), 84 * s * k, mh * k);
      const size = (single ? 46 : 34) * k, name = p === 0 ? "HOST" : "GUEST";
      c.font = `700 ${size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
      if ("letterSpacing" in c) c.letterSpacing = `${(size * 0.12).toFixed(1)}px`;
      const w = c.measureText(name).width, h = size * 1.2, lx = cx - w / 2;
      c.fillStyle = "rgba(8, 8, 10, .72)"; c.fillRect(lx - 22 * k, Y(1080 * 0.07 - 14 + h / k + 28), w + 44 * k, h + 28 * k);
      c.fillStyle = "#f5f2ea"; c.textBaseline = "bottom"; c.fillText(name, lx, Y(1080 * 0.07) - size * 0.08);
    });
    if (W / D < 480) return;   /* the tag is too small to read on a phone-sized window, and the chips cover it */
    const ts = 26 * k;
    c.font = `700 ${ts}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;
    if ("letterSpacing" in c) c.letterSpacing = `${(ts * 0.12).toFixed(1)}px`;
    const tag = `PRACTICE CAM ${camIdx + 1}`, tw = c.measureText(tag).width;
    c.fillStyle = "#e9b949"; c.textBaseline = "bottom"; c.fillText(tag, W - tw - 56 * k, 80 * k);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
  };

  /* ---------- the meters ---------- */
  const mstate = { host: { m: 0, h: 0, at: 0 }, guest: { m: 0, h: 0, at: 0 } };
  const noise = (t, s) => 0.5 + 0.5 * Math.sin(t * 7.3 + s) * Math.sin(t * 3.1 + s * 2);
  /* one mic's level (0..1 of -60..0 dBFS): its own person close up, the other far away, the room */
  const level = (near, far, t, seed) => {
    let v = 0.06 + 0.04 * noise(t, seed);
    if (near > 0) v = Math.max(v, near > 0.05 ? 0.58 + 0.32 * Math.min(1, near) : 0.22 + 2 * near);
    if (far > 0) v = Math.max(v, far > 0.05 ? 0.24 + 0.1 * Math.min(1, far) : 0.1);
    return v;
  };
  const paintMeter = (el, st, target, t, dt) => {
    st.m += (target - st.m) * Math.min(1, dt / 0.08);
    if (st.m >= st.h) { st.h = st.m; st.at = t; } else if (t - st.at > 0.8) st.h = Math.max(st.m, st.h - 0.35 * dt);
    el.style.setProperty("--m", st.m.toFixed(3));
    el.style.setProperty("--h", st.h.toFixed(3));
    el.style.setProperty("--ho", st.h > 0.02 ? 1 : 0);
    el.classList.toggle("loud", st.m > 0.8);
  };
  const setRow = (who, talking) => {
    rows[who].classList.toggle("talk", talking);
    const s = talking ? "Talking" : "Ready";
    if (stEl[who].textContent !== s) stEl[who].textContent = s;
  };

  /* ---------- state ---------- */
  let t = 0, swapped = true, rec = false, silent = false, camIdx = 0, single = false, check = null;
  const say = (text) => {
    if (nowEl.textContent === text) return;
    if (reduced) { nowEl.textContent = text; return; }
    nowEl.classList.add("is-out");
    setTimeout(() => { nowEl.textContent = text; nowEl.classList.remove("is-out"); }, 220);
  };
  const turn = (who, n) => {
    check = who;
    listen.classList.add("on"); done.classList.remove("on");
    titleEl.textContent = who === "host" ? "Host, say a sentence" : "Guest, say a sentence";
    countEl.style.setProperty("--pc", who === "host" ? "#e9b949" : "#9ec2ed");
    ometer.style.setProperty("--c", who === "host" ? "#e9b949" : "#9ec2ed");
    count(n);
  };
  const count = (n) => { countEl.textContent = n; countEl.classList.remove("tick"); void countEl.offsetWidth; countEl.classList.add("tick"); };
  const setLayout = (idx, one) => { camIdx = idx; single = one; layoutEl.textContent = `Cam ${idx + 1}`; };
  /* "Mics fixed": the two mics trade seats; the bars slide past each other, then each row hears its own person */
  const swapMeters = () => {
    const pitch = meters.guest.getBoundingClientRect().top - meters.host.getBoundingClientRect().top;
    const k = cam.getBoundingClientRect().height / cam.offsetHeight || 1;
    const d = pitch / k;
    [["host", d], ["guest", -d]].forEach(([w, y]) => { meters[w].classList.add("is-moving"); meters[w].style.transform = `translateY(${y.toFixed(1)}px)`; });
    setTimeout(() => {
      swapped = false;
      const a = mstate.host; mstate.host = mstate.guest; mstate.guest = a;
      ["host", "guest"].forEach((w) => { meters[w].classList.remove("is-moving"); meters[w].style.transform = ""; });
    }, 880);
  };
  const local = (el) => {
    const cr = cam.getBoundingClientRect(), r = el.getBoundingClientRect(), k = cr.width / cam.offsetWidth || 1;
    return { x: (r.left - cr.left) / k, y: (r.top - cr.top) / k, w: r.width / k, h: r.height / k };
  };
  const pointTo = (el, from) => {
    const r = local(el);
    if (from) {
      cursor.style.transition = "none";
      cursor.style.setProperty("--px", (r.x + from[0]).toFixed(1)); cursor.style.setProperty("--py", (r.y + from[1]).toFixed(1));
      cursor.getBoundingClientRect(); cursor.style.transition = "";
      cursor.classList.add("is-on");
    }
    requestAnimationFrame(() => { cursor.style.setProperty("--px", (r.x + r.w * 0.5 - 2).toFixed(1)); cursor.style.setProperty("--py", (r.y + r.h * 0.55 - 1).toFixed(1)); });
  };
  const press = (el, at) => { setTimeout(() => el.classList.add("is-down"), at); setTimeout(() => el.classList.remove("is-down"), at + 150); };

  const LINES = {
    a: "Before you record, press Check mics. Each person talks for 4 seconds.",
    b: "Host talks, but it's Guest's meter that moves. The mics are on the wrong seats.",
    c: "Guest talks, and Host's meter moves.",
    d: "So the app swaps them for you. Now each meter follows its own voice.",
    e: "Mid-take, Host's wireless mic goes silent. The app tells you to keep going.",
    f: "After you stop, the gap is filled with the same moment from a backup: the iPhone filming Host first, then the Mac's own mic.",
  };
  const L = 25;
  const EVENTS = [
    [0.45, () => pointTo(checkBtn, [120, 70])],
    [1.3, () => { checkBtn.classList.add("is-hover"); press(checkBtn, 0); }],
    [1.55, () => { root.classList.add("is-check"); turn("host", 4); }],
    [1.9, () => { cursor.classList.remove("is-on"); checkBtn.classList.remove("is-hover"); }],
    [2.2, () => say(LINES.b)],
    [2.55, () => count(3)], [3.55, () => count(2)], [4.55, () => count(1)],
    [5.55, () => turn("guest", 4)],
    [5.9, () => say(LINES.c)],
    [6.55, () => count(3)], [7.55, () => count(2)], [8.55, () => count(1)],
    [9.55, () => { check = null; listen.classList.remove("on"); done.classList.add("on"); say(LINES.d); }],
    [9.8, swapMeters],
    [10.55, () => pointTo(doneBtn, [90, 120])],
    [11.2, () => press(doneBtn, 0)],
    [11.4, () => { root.classList.remove("is-check"); cursor.classList.remove("is-on"); }],
    [11.9, () => {
      cam.style.opacity = "0";
      setTimeout(() => {
        rec = true; root.classList.add("is-rec");
        stateEl.textContent = "● Recording"; recordLabel.textContent = "Stop"; setLayout(1, true);
        cam.style.opacity = "1";
      }, 300);
      say(LINES.e);
    }],
    [13.2, () => { silent = true; }],
    [15.2, () => root.classList.add("is-alert")],
    [16.2, () => setLayout(0, false)],
    [18.2, () => { silent = false; root.classList.remove("is-alert"); }],
    [18.6, () => { root.classList.add("is-fill"); say(LINES.f); }],
    [18.9, () => setLayout(1, true)],
    [19.6, () => root.classList.add("is-pulse")],
    [21.0, () => { lift.classList.add("is-up"); }],
    [21.9, () => { root.classList.add("is-filled"); micNote.textContent = "Gap filled"; }],
    [22.3, () => root.classList.add("is-result")],
    [24.45, () => { root.classList.add("is-fade"); nowEl.classList.add("is-out"); }],
  ];
  /* the REC timer: 00:21 when the take is shown, a second at a time (00:22 is when the mic goes silent) */
  const REC0 = 11.9 + 0.3, recAt = (x) => `00:${String(21 + Math.max(0, Math.floor(x - REC0))).padStart(2, "0")}`;

  let next = 0;
  const reset = () => {
    t = 0; next = 0; swapped = true; rec = false; silent = false; check = null;
    root.classList.remove("is-check", "is-rec", "is-alert", "is-fill", "is-pulse", "is-filled", "is-result", "is-fade");
    listen.classList.add("on"); done.classList.remove("on");
    stateEl.textContent = "Preview"; recordLabel.textContent = "Record"; setLayout(0, false);
    lift.classList.remove("is-up"); micNote.textContent = "Cut out for 5 seconds";
    cursor.classList.remove("is-on"); checkBtn.classList.remove("is-hover");
    nowEl.classList.remove("is-out"); nowEl.textContent = LINES.a;
    recEl.textContent = "00:21";
  };

  const step = (dt) => {
    while (next < EVENTS.length && t >= EVENTS[next][0]) EVENTS[next++][1]();
    if (t >= L) reset();
    /* who is talking: the person whose turn it is during the check; Host during the take */
    const hostV = check === "host" || (rec && t > 12.2) ? env(t) : 0;
    const guestV = check === "guest" ? env(t + 4.85) : 0;
    /* mic A is on Host, mic B on Guest; until the fix, Host's seat is set to mic B */
    const micA = silent ? 0 : level(hostV, guestV, t, 1);
    const micB = level(guestV, hostV, t, 4);
    const seat = swapped ? { host: micB, guest: micA } : { host: micA, guest: micB };
    ["host", "guest"].forEach((w) => {
      paintMeter(meters[w], mstate[w], seat[w], t, dt);
      setRow(w, mstate[w].m > 0.5);
    });
    if (check) { ometer.style.setProperty("--m", mstate[check].m.toFixed(3)); ometer.style.setProperty("--h", mstate[check].h.toFixed(3)); ometer.style.setProperty("--ho", 1); ometer.classList.toggle("loud", mstate[check].m > 0.8); }
    if (rec && t < 18.6) { const r = recAt(t); if (recEl.textContent !== r) recEl.textContent = r; }
    drawPic(camIdx, single, [hostV > 0.05, guestV > 0.05], t);
  };

  /* ---------- reduced motion: the answer and the fill, side by side in time ---------- */
  if (reduced) {
    root.classList.add("is-check", "is-filled", "is-result", "is-still");
    listen.classList.remove("on"); done.classList.add("on");
    swapped = false; lift.classList.add("is-up"); micNote.textContent = "Gap filled";
    nowEl.textContent = "Check mics found the mics on the wrong seats and swapped them. If a mic cuts out mid-take, the gap is filled from a backup of the same moment.";
    const paint = () => { drawPic(0, false, [false, false], 0); };
    new ResizeObserver(paint).observe(root);
    paint();
    return;
  }

  /* ---------- the loop: only while the card is on screen and not covered ---------- */
  let raf = 0, last = 0, seen = false, covered = false, started = false;
  const frame = (ms) => {
    const dt = last ? Math.min(0.1, (ms - last) / 1000) : 0;
    last = ms; t += dt;
    step(dt);
    raf = requestAnimationFrame(frame);
  };
  const run = () => {
    if (seen && !covered && !document.hidden) {
      if (!started) { started = true; reset(); }
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    } else { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }, { threshold: 0.3 }).observe(root);
  card.addEventListener("hm-cover", (e) => { covered = !!e.detail; run(); });
  document.addEventListener("visibilitychange", run);
  new ResizeObserver(() => { if (!raf) step(0); }).observe(root);
  step(0);
})();
