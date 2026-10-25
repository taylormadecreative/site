/* Training series player: one <video>, four lessons. Picks 1080 or 720 by rendered width and Save-Data. */
(() => {
  const root = document.querySelector("[data-series]");
  if (!root) return;
  const video = root.querySelector(".series-video");
  const play = root.querySelector(".series-play");
  const label = root.querySelector(".series-pill__txt");
  const err = root.querySelector(".series-err");
  const items = [...root.querySelectorAll(".series-item")];
  const VID = "../assets/video/training/";
  const IMG = "../assets/img/training/";
  const conn = navigator.connection || {};
  let cur = 0;

  const quality = () => (conn.saveData || video.clientWidth * (window.devicePixelRatio || 1) < 1300 ? "720" : "1080");
  const pad = (n) => String(n + 1).padStart(2, "0");

  function setLabel(i, kicker) {
    const it = items[i];
    label.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = kicker ? `${kicker} · ${pad(i)}` : `Lesson ${pad(i)}`;
    const s = document.createElement("span");
    s.textContent = it.dataset.dur;
    label.append(b, s);
    play.setAttribute("aria-label", `Play lesson ${i + 1}, ${it.dataset.title}`);
  }

  function load(i, autoplay, kicker) {
    cur = i;
    const it = items[i];
    const slug = it.dataset.slug;
    items.forEach((b, k) => b.setAttribute("aria-current", k === i ? "true" : "false"));
    err.hidden = true;
    root.classList.remove("is-error");
    play.hidden = false;
    root.classList.add("is-swapping");
    video.pause();
    video.querySelectorAll("track").forEach((t) => t.remove());
    video.poster = `${IMG}${slug}-1280.jpg`;
    video.src = `${VID}${slug}-${quality()}.mp4`;
    if (it.hasAttribute("data-vtt")) {
      const t = document.createElement("track");
      Object.assign(t, {kind: "captions", srclang: "en", label: "English", src: `${VID}${slug}.vtt`});
      video.appendChild(t);
    }
    setLabel(i, kicker);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("is-swapping")));
    if (autoplay) start();
    else {
      root.classList.remove("is-playing");
      video.controls = false;
    }
  }

  function start() {
    video.controls = true;
    root.classList.add("is-playing");
    play.hidden = true; // out of the tab order while the native controls own the frame
    const p = video.play();
    const ok = () => { if (window.gtag) window.gtag("event", "training_lesson_play", {lesson: items[cur].dataset.slug}); };
    if (p && p.then) p.then(ok, () => {
      root.classList.remove("is-playing");
      play.hidden = false;
      video.controls = false;
    });
    else ok();
  }

  play.addEventListener("click", start);
  items.forEach((b, i) => b.addEventListener("click", () => load(i, true)));
  video.addEventListener("timeupdate", () => {
    if (video.duration) items[cur].style.setProperty("--p", (video.currentTime / video.duration).toFixed(4));
  });
  video.addEventListener("ended", () => {
    items[cur].style.setProperty("--p", 1);
    items[cur].classList.add("is-done");
    if (cur < items.length - 1) load(cur + 1, false, "Up next");
    else load(0, false, "Watch again");
  });
  video.addEventListener("error", () => {
    if (!video.getAttribute("src")) return;
    root.classList.remove("is-playing");
    root.classList.add("is-error");
    video.controls = false;
    err.hidden = false;
  });
  err.querySelector("button").addEventListener("click", () => load(cur, true));
  const cta = root.querySelector(".series-cta");
  if (cta) cta.addEventListener("click", () => { if (window.gtag) window.gtag("event", "training_series_quote_click", {lesson: items[cur].dataset.slug}); });

  load(0, false);
})();
