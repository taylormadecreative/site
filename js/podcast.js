/* TAYLORMADE PODCAST · the Mac app's page
   The live examples, all from one real take recorded with the app ("Tonight at 7"):
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

  /* ---------- clips: muted loops that load and play only while on screen ---------- */
  $$("[data-play]").forEach((box) => {
    const v = $("video", box);
    if (!v || reduced || saveData) return;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); }
        v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    }, { threshold: 0.25 }).observe(box);
  });

  /* ---------- the take: one audio file drives the player and the transcript ---------- */
  let take = null;
  try { take = JSON.parse($("#pa-take").textContent); } catch (_) {}
  const audio = new Audio();
  audio.preload = "none";
  const AUDIO = "../assets/video/podcast-app/tonight-podcast.m4a";
  const boxes = $$("[data-player], [data-tx]");
  const setPlaying = (on) => boxes.forEach((b) => b.classList.toggle("is-playing", on));
  const toggle = () => {
    if (!audio.getAttribute("src")) audio.src = AUDIO;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  };
  audio.addEventListener("play", () => { setPlaying(true); loop(); });
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => { setPlaying(false); audio.currentTime = 0; paint(0); });
  $$("[data-toggle]").forEach((b) => b.addEventListener("click", toggle));
  // pause when the visitor scrolls well away from both examples
  const near = new Set();
  boxes.forEach((b) => new IntersectionObserver(([e]) => {
    e.isIntersecting ? near.add(b) : near.delete(b);
    if (!near.size && !audio.paused) audio.pause();
  }).observe(b));

  // waveform bars, from the real audio's loudness
  const wave = $("[data-wave]");
  const bars = [];
  if (wave && take) {
    take.peaks.forEach((h) => { const i = document.createElement("i"); i.style.setProperty("--h", h); wave.append(i); bars.push(i); });
    const seek = (x) => {
      const r = wave.getBoundingClientRect();
      if (!audio.getAttribute("src")) audio.src = AUDIO;
      const go = () => { audio.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * take.dur; paint(audio.currentTime); };
      audio.readyState ? go() : audio.addEventListener("loadedmetadata", go, { once: true });
      if (!audio.readyState) audio.load();
    };
    wave.addEventListener("click", (e) => seek(e.clientX));
    wave.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      if (!audio.getAttribute("src")) { audio.src = AUDIO; audio.load(); }
      audio.currentTime = Math.max(0, Math.min(take.dur, audio.currentTime + (e.key === "ArrowRight" ? 5 : -5)));
      paint(audio.currentTime);
    });
  }
  const now = $("[data-now]");

  // the transcript, as the app wrote it, with each word's time
  const roll = $("[data-tx] [data-roll]");
  const words = [], lines = [];
  if (roll && take) {
    take.lines.forEach((l) => {
      const row = document.createElement("div");
      row.className = "pa-tx__line";
      row.innerHTML = `<span class="pa-tx__time">${mmss(l.s)}</span><p><span class="pa-tx__who">Host</span><span class="pa-tx__words"></span></p>`;
      const holder = $(".pa-tx__words", row);
      l.w.forEach(([text, s], k) => {
        const sp = document.createElement("span");
        sp.textContent = text;
        holder.append(sp);
        if (k < l.w.length - 1) holder.append(" ");
        words.push({ sp, s });
      });
      roll.append(row);
      lines.push({ row, s: l.s });
    });
  }
  let lastLine = -1;
  const paint = (t) => {
    const p = take ? t / take.dur : 0;
    bars.forEach((b, i) => b.classList.toggle("on", i / bars.length < p));
    wave?.setAttribute("aria-valuenow", String(Math.round(t)));
    if (now) now.textContent = mmss(t);
    words.forEach((w) => w.sp.classList.toggle("said", w.s <= t && t > 0));
    let cur = 0;
    lines.forEach((l, i) => { if (l.s <= t) cur = i; });
    if (cur !== lastLine && roll) {
      lastLine = cur;
      const row = lines[cur]?.row;
      if (row) roll.style.transform = `translateY(${-(row.offsetTop - 110)}px)`;
    }
  };
  let raf = 0;
  const loop = () => { cancelAnimationFrame(raf); const f = () => { paint(audio.currentTime); if (!audio.paused) raf = requestAnimationFrame(f); }; f(); };

  /* ---------- 06 voice: say it, it records, say stop, it saves ---------- */
  const voice = $("[data-voice]");
  if (voice) {
    const steps = $$(".pa-voice__step", voice), clock = $("[data-clock]", voice);
    let i = 0, secs = 0;
    const show = () => {
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      voice.classList.toggle("is-rec", i === 1 || i === 2);
      if (i === 0) secs = 0;
      clock.textContent = mmss(secs);
    };
    whileSeen(voice, 2600, () => { i = (i + 1) % steps.length; show(); });
    whileSeen(voice, 1000, () => { if (voice.classList.contains("is-rec")) { secs++; clock.textContent = mmss(secs); } });
  }

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

  /* ---------- 08 auto-switch: the show cuts between the angles ---------- */
  const cams = $("[data-cams]");
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
