/* Animated average weekday (spring 2025): 64 x 15-minute slots, played in ~20 s */
(async function () {
  const box = document.getElementById("day-map");
  if (!box) return;
  const data = await fetch("data/daily_profile.json").then((r) => r.json());
  const N = data.slots.length; // 64
  const DURATION = 20000; // ms for 06:00 -> 22:00
  const sites = data.sites;
  const lerp = (c, p) => {
    const f = Math.min(p * (N - 1), N - 1), i = Math.floor(f), j = Math.min(i + 1, N - 1), t = f - i;
    return (c[i] * (1 - t) + c[j] * t) * 4; // cycles per hour
  };
  const features = sites.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { v: 0 } }));
  const fc = { type: "FeatureCollection", features };

  const totals = Array.from({ length: N }, (_, i) => sites.reduce((a, s) => a + s.c[i], 0) * 4);
  const maxTot = Math.max(...totals);
  const spark = document.getElementById("day-spark");
  const pts = totals.map((t, i) => `${(i / (N - 1)) * 600},${38 - (t / maxTot) * 34}`);
  spark.innerHTML = `<defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd36e" stop-opacity=".55"/><stop offset="1" stop-color="#ffd36e" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,40 ${pts.join(" ")} 600,40" fill="url(#sg)"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="#ffd36e" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    <line id="sg-cur" x1="0" x2="0" y1="0" y2="40" stroke="#fff" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  const cur = spark.querySelector("#sg-cur");
  const ticks = [["06", 0], ["09", 12], ["12", 24], ["15", 36], ["18", 48], ["21", 60]];

  const map = new maplibregl.Map({
    container: box,
    style: "https://tiles.openfreemap.org/styles/dark",
    bounds: [[-0.4, 51.38], [0.12, 51.63]],
    fitBoundsOptions: { padding: { top: 90, bottom: 70, left: 20, right: 20 } },
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  window.dayMap = map;

  const colour = ["interpolate", ["linear"], ["get", "v"], 0, "#3b2a9e", 60, "#8a2fc4", 200, "#e8459b", 500, "#ff8a3d", 1100, "#ffe36e"];
  const base = ["+", 1.2, ["*", 0.32, ["sqrt", ["get", "v"]]]];
  const radius = (k) => ["interpolate", ["linear"], ["zoom"], 8, ["*", base, 0.7 * k], 11, ["*", base, 1.2 * k], 14, ["*", base, 2.4 * k]];

  const clock = document.getElementById("day-time"), total = document.getElementById("day-total");
  const range = document.getElementById("day-range"), btn = document.getElementById("day-play");
  let p = 0, playing = false, last = 0, ready = false, inView = false, userPaused = false;

  function render() {
    for (let i = 0; i < sites.length; i++) features[i].properties.v = lerp(sites[i].c, p);
    if (ready) map.getSource("flow").setData(fc);
    const mins = 360 + p * 960, h = Math.floor(mins / 60), m = Math.floor(mins % 60);
    clock.textContent = String(h).padStart(2, "0") + ":" + String(m - (m % 5)).padStart(2, "0");
    const f = p * (N - 1), i = Math.floor(f), j = Math.min(i + 1, N - 1);
    total.textContent = Math.round(totals[i] * (1 - (f - i)) + totals[j] * (f - i)).toLocaleString("en-GB");
    cur.setAttribute("x1", p * 600); cur.setAttribute("x2", p * 600);
    range.value = p;
  }
  function frame(now) {
    if (!playing) return;
    p += (now - last) / DURATION;
    last = now;
    if (p >= 1) { p = 0; }
    render();
    requestAnimationFrame(frame);
  }
  function play() { if (playing) return; playing = true; last = performance.now(); btn.textContent = "❚❚"; requestAnimationFrame(frame); }
  function pause() { playing = false; btn.textContent = "▶"; }

  btn.addEventListener("click", () => { if (playing) { userPaused = true; pause(); } else { userPaused = false; play(); } });
  range.addEventListener("input", () => { p = +range.value; pause(); userPaused = true; render(); });

  map.on("load", () => {
    map.addSource("flow", { type: "geojson", data: fc });
    map.addLayer({ id: "flow-halo", type: "circle", source: "flow", paint: { "circle-color": colour, "circle-radius": radius(3.2), "circle-blur": 1, "circle-opacity": 0.28 }, layout: { "circle-sort-key": ["get", "v"] } });
    map.addLayer({ id: "flow-core", type: "circle", source: "flow", paint: { "circle-color": colour, "circle-radius": radius(1), "circle-blur": 0.35, "circle-opacity": 0.92 }, layout: { "circle-sort-key": ["get", "v"] } });
    ready = true;
    render();
    if (inView && !userPaused && !matchMedia("(prefers-reduced-motion: reduce)").matches) play();
  });

  // start when scrolled into view, pause when off screen
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView && ready && !userPaused && !matchMedia("(prefers-reduced-motion: reduce)").matches) play();
    if (!inView && playing) pause();
  }, { threshold: 0.35 }).observe(document.querySelector(".daybox"));
  btn.textContent = "▶";
  render();
})();
