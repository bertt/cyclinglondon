/* London cycling audit: charts (hand-rolled SVG) and map (MapLibre + OpenFreeMap) */
(async function () {
  const [model, sites] = await Promise.all([
    fetch("data/model.json").then((r) => r.json()),
    fetch("data/sites.geojson").then((r) => r.json()),
  ]);

  const C = { ink: "#1c2030", muted: "#5d6272", rule: "#d6cfbd", blue: "#1f3f94", red: "#c8341f", green: "#2e7355", amber: "#b9791c" };
  const PUB = { 2000: 0.47, 2015: 1.05 / 0.97, 2019: 1.05, 2022: 1.2, 2024: 1.33, 2025: 1.5, 2026: 1.66 };
  const V = model.variants.osm_no_service;
  const fmt = (v, d = 0) => v.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
  const NS = "http://www.w3.org/2000/svg";

  /* ---------- tiny SVG helpers ---------- */
  function svg(w, h, inner) {
    return `<svg viewBox="0 0 ${w} ${h}" role="img" xmlns="${NS}">${inner}</svg>`;
  }
  const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  function yAxis(sy, ticks, x0, x1, label) {
    return `<g class="ax">${ticks
      .map((t) => `<line x1="${x0}" x2="${x1}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${x0 - 8}" y="${sy(t) + 4}" text-anchor="end">${label ? label(t) : t}</text>`)
      .join("")}</g>`;
  }
  function xAxis(sx, ticks, y, label) {
    return `<g class="ax">${ticks.map((t) => `<text x="${sx(t)}" y="${y}" text-anchor="middle">${label ? label(t) : t}</text>`).join("")}</g>`;
  }
  const path = (pts, sx, sy) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");

  /* ---------- 1. timeline ---------- */
  (function () {
    const W = 1000, H = 440, m = { l: 52, r: 30, t: 20, b: 36 };
    const sx = scale(2014, 2027, m.l, W - m.r), sy = scale(0.8, 1.9, H - m.b, m.t);
    const k = PUB[2025] / V.cycle_km_m[2025];
    const rec = Object.entries(V.cycle_km_m).map(([y, v]) => [+y, v * k]);
    const recA = rec.filter((p) => p[0] <= 2019), recB = rec.filter((p) => p[0] >= 2022);
    const pub = [2015, 2019, 2022, 2024, 2025].map((y) => [y, PUB[y]]);
    let s = yAxis(sy, [0.8, 1.0, 1.2, 1.4, 1.6, 1.8], m.l, W - m.r, (t) => t.toFixed(1));
    s += xAxis(sx, [2015, 2017, 2019, 2021, 2023, 2025], H - 10);
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(1.6)}" y2="${sy(1.6)}" stroke="${C.red}" stroke-dasharray="5 4"/>
          <text class="lab" x="${m.l + 6}" y="${sy(1.6) - 7}" fill="${C.red}" style="fill:${C.red}">2030 target: 1.6 m</text>`;
    s += `<rect x="${sx(2019.5)}" y="${m.t}" width="${sx(2021.6) - sx(2019.5)}" height="${H - m.b - m.t}" fill="#e7dfcc" opacity=".55"/>
          <text class="lab" x="${(sx(2019.5) + sx(2021.6)) / 2}" y="${m.t + 14}" text-anchor="middle" style="fill:${C.muted};font-size:11px">pandemic</text>`;
    s += `<path d="${path(recA, sx, sy)}" fill="none" stroke="${C.muted}" stroke-width="2"/>
          <path d="${path(recB, sx, sy)}" fill="none" stroke="${C.muted}" stroke-width="2"/>
          <path d="${path([recA[recA.length - 1], rec.find((p) => p[0] === 2021)].filter(Boolean), sx, sy)}" fill="none" stroke="${C.muted}" stroke-dasharray="3 4"/>
          <path d="${path([rec.find((p) => p[0] === 2021), recB[0]], sx, sy)}" fill="none" stroke="${C.muted}" stroke-dasharray="3 4"/>`;
    s += rec.map((p) => `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="3.5" fill="${C.paperDot || "#f4f0e6"}" stroke="${C.muted}" stroke-width="1.8"/>`).join("");
    s += `<path d="${path(pub, sx, sy)}" fill="none" stroke="${C.blue}" stroke-width="2.4"/>`;
    s += pub.map((p) => `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="5.5" fill="${C.blue}"/>`).join("");
    s += pub.map((p) => `<text class="lab" x="${sx(p[0])}" y="${sy(p[1]) + (p[0] === 2024 ? 24 : -12)}" text-anchor="middle" style="font-weight:600;fill:${C.blue}">${p[1].toFixed(2)}</text>`).join("");
    // 2026 claim
    s += `<path d="${path([[2025, 1.5], [2026, 1.66]], sx, sy)}" fill="none" stroke="${C.red}" stroke-width="2.4" stroke-dasharray="6 4"/>
          <circle cx="${sx(2026)}" cy="${sy(1.66)}" r="6.5" fill="#f4f0e6" stroke="${C.red}" stroke-width="2.6"/>
          <text class="lab" x="${sx(2026) - 4}" y="${sy(1.66) - 14}" text-anchor="end" style="font-weight:700;fill:${C.red}">2026: 1.66 (claimed, no counts public)</text>`;
    // direct labels
    s += `<text class="lab" x="${sx(2016)}" y="${sy(rec.find((p) => p[0] === 2016)[1]) + 26}" style="fill:${C.muted}">counts-only reconstruction</text>
          <text class="lab" x="${sx(2022.1)}" y="${sy(1.2) + 24}" style="fill:${C.blue};font-weight:600">TfL published</text>`;
    document.getElementById("chart-timeline").innerHTML = svg(W, H, s);
  })();

  /* ---------- 2. area index ---------- */
  (function () {
    const W = 480, H = 330, m = { l: 38, r: 70, t: 14, b: 30 };
    const years = model.years.filter((y) => y !== 2021);
    const sx = scale(2015, 2025, m.l, W - m.r), sy = scale(60, 160, H - m.b, m.t);
    const series = [
      ["Central", V.cycle_km_area_m.Central, C.red],
      ["Inner", V.cycle_km_area_m.Inner, C.blue],
      ["Outer", V.cycle_km_area_m.Outer, C.green],
    ];
    let s = yAxis(sy, [60, 80, 100, 120, 140, 160], m.l, W - m.r) + xAxis(sx, [2015, 2017, 2019, 2022, 2025], H - 8);
    for (const [name, d, col] of series) {
      const pts = years.map((y) => [y, (d[y] / d[2019]) * 100]);
      s += `<path d="${path(pts.filter((p) => p[0] <= 2019), sx, sy)}" stroke="${col}" stroke-width="2.2" fill="none"/>
            <path d="${path(pts.filter((p) => p[0] >= 2022), sx, sy)}" stroke="${col}" stroke-width="2.2" fill="none"/>
            <path d="${path([pts.find((p) => p[0] === 2019), pts.find((p) => p[0] === 2022)], sx, sy)}" stroke="${col}" stroke-dasharray="3 4" fill="none"/>`;
      const last = pts[pts.length - 1];
      s += `<text class="lab" x="${sx(2025) + 8}" y="${sy(last[1]) + 4}" style="fill:${col};font-weight:600">${name} ${Math.round(last[1])}</text>`;
    }
    document.getElementById("chart-area").innerHTML = svg(W, H, s);
  })();

  /* ---------- 3. decomposition bars ---------- */
  (function () {
    const W = 480, H = 330, m = { l: 150, r: 30, t: 30, b: 20 };
    const counts = V.cycle_km_m[2025] / V.cycle_km_m[2019] - 1;
    const pub = 1.5 / 1.05 - 1;
    const conv = (1 + pub) / (1 + counts) - 1;
    const rows = [
      ["Counts (cycle-km)", counts, C.muted],
      ["Conversion factors", conv, C.amber],
      ["Published stages", pub, C.blue],
    ];
    const sx = scale(0, 0.5, m.l, W - m.r);
    let s = `<g class="ax">${[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${m.t - 6}" y2="${H - m.b}"/><text x="${sx(t)}" y="${m.t - 12}" text-anchor="middle">${Math.round(t * 100)}%</text>`).join("")}</g>`;
    rows.forEach((r, i) => {
      const y = m.t + 20 + i * 80;
      s += `<text class="lab" x="${m.l - 12}" y="${y + 22}" text-anchor="end">${r[0]}</text>
            <rect x="${sx(0)}" y="${y}" width="${sx(r[1]) - sx(0)}" height="34" fill="${r[2]}"/>
            <text class="lab" x="${sx(r[1]) + 8}" y="${y + 22}" style="font-weight:700">+${(r[1] * 100).toFixed(1)}%</text>`;
    });
    s += `<text class="lab" x="${m.l}" y="${H - 2}" style="font-size:12px;fill:${C.muted}">(1 + counts) × (1 + conversion) = 1 + published</text>`;
    document.getElementById("chart-decomp").innerHTML = svg(W, H, s);
  })();

  /* ---------- 4. wet share ---------- */
  (function () {
    const W = 1000, H = 220, m = { l: 52, r: 20, t: 14, b: 30 };
    const years = model.years;
    const sx = (i) => m.l + 40 + (i * (W - m.l - m.r - 80)) / (years.length - 1);
    const sy = scale(0, 0.2, H - m.b, m.t);
    let s = yAxis(sy, [0, 0.05, 0.1, 0.15, 0.2], m.l, W - m.r, (t) => Math.round(t * 100) + "%");
    years.forEach((y, i) => {
      const v = model.wet_share[y];
      const col = y === 2025 ? C.blue : y === 2024 ? C.muted : "#b9b3a2";
      s += `<rect x="${sx(i) - 26}" y="${sy(v)}" width="52" height="${H - m.b - sy(v)}" fill="${col}"/>
            <text class="lab" x="${sx(i)}" y="${sy(v) - 6}" text-anchor="middle" style="font-weight:${y >= 2024 ? 700 : 400}">${(v * 100).toFixed(1)}%</text>
            <text x="${sx(i)}" y="${H - 8}" text-anchor="middle" style="font:11px var(--mono);fill:${C.muted}">${y}</text>`;
    });
    document.getElementById("chart-wet").innerHTML = svg(W, H, s);
  })();

  /* ---------- 5. scenario ---------- */
  (function () {
    const W = 1000, H = 360, m = { l: 60, r: 220, t: 24, b: 40 };
    const g = model.growth;
    const bars = [["2022 → 23", g["2022-2023"]], ["2023 → 24", g["2023-2024"]], ["2024 → 25", g["2024-2025"]]];
    const need = model.scenario_2026;
    const sy = scale(-0.04, 0.14, H - m.b, m.t);
    const bw = 110, gap = (W - m.l - m.r - bars.length * bw) / (bars.length + 1);
    let s = yAxis(sy, [-0.04, 0, 0.04, 0.08, 0.12], m.l, W - m.r, (t) => (t > 0 ? "+" : "") + Math.round(t * 100) + "%");
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="${C.ink}"/>`;
    bars.forEach(([name, d], i) => {
      const x = m.l + gap + i * (bw + gap);
      const hi = d.change >= 0;
      s += `<rect x="${x}" y="${hi ? sy(d.change) : sy(0)}" width="${bw}" height="${Math.abs(sy(d.change) - sy(0))}" fill="${i === 2 ? C.blue : "#9aa3bd"}"/>
            <line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${sy(d.ci95[0])}" y2="${sy(d.ci95[1])}" stroke="${C.ink}" stroke-width="1.6"/>
            <line x1="${x + bw / 2 - 8}" x2="${x + bw / 2 + 8}" y1="${sy(d.ci95[0])}" y2="${sy(d.ci95[0])}" stroke="${C.ink}" stroke-width="1.6"/>
            <line x1="${x + bw / 2 - 8}" x2="${x + bw / 2 + 8}" y1="${sy(d.ci95[1])}" y2="${sy(d.ci95[1])}" stroke="${C.ink}" stroke-width="1.6"/>
            <text class="lab" x="${x + bw / 2 + 14}" y="${sy(d.change) + 4}" style="font-weight:700">${d.change >= 0 ? "+" : ""}${(d.change * 100).toFixed(1)}%</text>
            <text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle" style="font:11px var(--mono);fill:${C.muted}">${name}</text>`;
    });
    const lines = [
      [need.needed_cyclekm_growth_if_kappa_constant, "needed if κ constant", "+" + (need.needed_cyclekm_growth_if_kappa_constant * 100).toFixed(1) + "%"],
      [need.needed_cyclekm_growth_if_kappa_drifts_like_2024_25, "needed if κ drifts +3.3% again", "+" + (need.needed_cyclekm_growth_if_kappa_drifts_like_2024_25 * 100).toFixed(1) + "%"],
    ];
    lines.forEach(([v, label, val]) => {
      s += `<line x1="${m.l}" x2="${W - m.r + 10}" y1="${sy(v)}" y2="${sy(v)}" stroke="${C.red}" stroke-dasharray="6 4" stroke-width="1.8"/>
            <text class="lab" x="${W - m.r + 16}" y="${sy(v) - 2}" style="fill:${C.red};font-weight:700">${val}</text>
            <text class="lab" x="${W - m.r + 16}" y="${sy(v) + 13}" style="fill:${C.red};font-size:11.5px">${label}</text>`;
    });
    document.getElementById("chart-scenario").innerHTML = svg(W, H, s);
  })();

  /* ---------- cycle lanes ---------- */
  fetch("data/lanes.json").then((r) => r.json()).then((L) => {
    const pct = (v) => (v >= 0 ? "+" : "") + Math.round(v * 100) + "%";
    (function () {
      const W = 1000, H = 250, m = { l: 190, r: 70, t: 14, b: 34 };
      const sx = scale(0, 5.5, m.l, W - m.r);
      let s = `<g class="ax">${[0, 1, 2, 3, 4, 5].map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${m.t}" y2="${H - m.b}"/><text x="${sx(t)}" y="${H - 12}" text-anchor="middle">+${t * 100}%</text>`).join("")}</g>`;
      L.ladder.forEach((d, i) => {
        const y = m.t + 14 + i * 62, col = i === 0 ? "#9aa3bd" : C.blue;
        s += `<text class="lab" x="${m.l - 12}" y="${y + 24}" text-anchor="end">${d.label}</text>
          <rect x="${sx(0)}" y="${y}" width="${sx(d.ratio) - sx(0)}" height="34" fill="${col}"/>
          <line x1="${sx(d.ci[0])}" x2="${sx(d.ci[1])}" y1="${y + 17}" y2="${y + 17}" stroke="${C.ink}" stroke-width="1.6"/>
          <line x1="${sx(d.ci[0])}" x2="${sx(d.ci[0])}" y1="${y + 9}" y2="${y + 25}" stroke="${C.ink}" stroke-width="1.6"/>
          <line x1="${sx(d.ci[1])}" x2="${sx(d.ci[1])}" y1="${y + 9}" y2="${y + 25}" stroke="${C.ink}" stroke-width="1.6"/>
          <text class="lab" x="${sx(d.ci[1]) + 10}" y="${y + 22}" style="font-weight:700">${pct(d.ratio)}</text>`;
      });
      document.getElementById("chart-lanes").innerHTML = svg(W, H, s);
    })();
    (function () {
      const e = L.event, W = 1000, H = 280, m = { l: 60, r: 20, t: 24, b: 56 };
      const rows = [
        [`Gained a lane\n(n = ${e.gainers})`, e.growth_gain, C.red],
        [`Never had a lane\n(n = ${e.never})`, e.growth_never, "#9aa3bd"],
        [`Had a lane in 2022 and 2025\n(n = ${e.always})`, e.growth_always, C.blue],
      ];
      const sy = scale(0, 0.7, H - m.b, m.t), bw = 150, gap = (W - m.l - m.r - 3 * bw) / 4;
      let s = yAxis(sy, [0, 0.2, 0.4, 0.6], m.l, W - m.r, (t) => "+" + Math.round(t * 100) + "%");
      rows.forEach(([label, v, col], i) => {
        const x = m.l + gap + i * (bw + gap), lines = label.split("\n");
        s += `<rect x="${x}" y="${sy(v)}" width="${bw}" height="${sy(0) - sy(v)}" fill="${col}"/>
          <text class="lab" x="${x + bw / 2}" y="${sy(v) - 8}" text-anchor="middle" style="font-weight:700">${pct(v)}</text>
          <text class="lab" x="${x + bw / 2}" y="${H - 34}" text-anchor="middle">${lines[0]}</text>
          <text x="${x + bw / 2}" y="${H - 18}" text-anchor="middle" style="font:11px var(--mono);fill:${C.muted}">${lines[1]}</text>`;
      });
      document.getElementById("chart-event").innerHTML = svg(W, H, s);
      document.getElementById("event-note").textContent =
        `Difference-in-differences (gainers minus never-lane sites in the same area × road-type strata): ${pct(e.did)} (95% interval ${pct(e.did_ci[0])} to ${pct(e.did_ci[1])}). Only ${e.gainers} gainers, so treat as a hint.`;
    })();
  });

  /* ---------- strata table ---------- */
  (function () {
    const tb = document.querySelector("#strata-table tbody");
    const roadName = { A: "A road", B: "B road", Minor: "Minor road", Local: "Local street", Path: "Motor-vehicle-free path" };
    const order = ["Central", "Inner", "Outer"], rord = ["A", "B", "Minor", "Local", "Path"];
    const rows = model.strata_2025.slice().sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area) || rord.indexOf(a.road) - rord.indexOf(b.road));
    let tot = { sites: 0, km: 0, ckm: 0 };
    tb.innerHTML = rows
      .map((r) => {
        const ckm = (r.mean_flow * r.km_osm) / 1000;
        tot.sites += r.sites; tot.km += r.km_osm; tot.ckm += ckm;
        return `<tr><td>${r.area}</td><td>${roadName[r.road]}</td><td class="r num">${r.sites}</td><td class="r num">${fmt(r.mean_flow)}</td><td class="r num">${fmt(r.km_osm)}</td><td class="r num">${fmt(ckm)}</td></tr>`;
      })
      .join("") + `<tr class="sum"><td colspan="2">London</td><td class="r num">${fmt(tot.sites)}</td><td class="r num">${fmt((tot.ckm * 1000) / tot.km)}</td><td class="r num">${fmt(tot.km)}</td><td class="r num">${fmt(tot.ckm)}</td></tr>`;
    const k = 1.5 / (tot.ckm / 1000);
    document.getElementById("strata-note").innerHTML =
      `Total: <strong>${(tot.ckm / 1000).toFixed(2)} million cycle-km</strong> on an average spring weekday. Dividing TfL's 2025 figure of 1.50&nbsp;million stages by that gives κ = ${k.toFixed(3)} stages per cycle-km, or ${(1 / k).toFixed(1)}&nbsp;km per stage on a seven-day-average basis. Adding service roads gives ${V.network_km ? "" : ""}${model.variants.osm_with_service.cycle_km_m[2025].toFixed(1)}&nbsp;million cycle-km; scaling the network to TfL's implied 17,200&nbsp;km gives ${model.variants.osm_scaled_to_tfl_2_5pct ? "" : ""}${model.variants["osm_scaled_to_tfl_2.5pct"].cycle_km_m[2025].toFixed(1)}&nbsp;million. The mix matters: the 3,300 or so central and inner A-road and busy-street sites carry most of the cycle-km.`;
  })();

  /* ---------- map ---------- */
  (function () {
    const fcs = sites.features;
    fcs.forEach((f) => {
      const p = f.properties;
      p.chg2025 = p.f2019 > 50 && p.f2025 != null ? p.f2025 / p.f2019 - 1 : null;
      p.chg2024 = p.f2019 > 50 && p.f2024 != null ? p.f2024 / p.f2019 - 1 : null;
      p.chg2022 = p.f2019 > 50 && p.f2022 != null ? p.f2022 / p.f2019 - 1 : null;
      p.chg2019 = null;
    });
    const map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      bounds: [[-0.56, 51.27], [0.34, 51.71]],
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const el = { year: document.getElementById("m-year"), mode: document.getElementById("m-mode"), area: document.getElementById("m-area"), panel: document.getElementById("m-panel"), legend: document.getElementById("legend") };

    const flowColor = (prop) => ["interpolate", ["linear"], ["to-number", ["get", prop], 0], 0, "#ffffb2", 300, "#fecc5c", 1000, "#fd8d3c", 3000, "#e31a1c", 8000, "#800026"];
    const flowRadius = (prop) => ["interpolate", ["linear"], ["sqrt", ["to-number", ["get", prop], 0]], 0, 2.5, 30, 5, 60, 8.5, 110, 14];
    const chgColor = (prop) => ["interpolate", ["linear"], ["to-number", ["get", prop], 0], -0.5, "#2b6cb0", 0, "#d8d8d8", 0.5, "#f0a05a", 1.2, "#b02a1a"];

    function legend(mode) {
      if (mode === "flow") {
        el.legend.innerHTML = `<div class="bar" style="background:linear-gradient(90deg,#ffffb2,#fecc5c 20%,#fd8d3c 40%,#e31a1c 70%,#800026)"></div><div class="ticks"><span>0</span><span>1,000</span><span>3,000</span><span>8,000+</span></div><div class="ticks"><span>cycles per day</span><span>size ∝ √flow</span></div>`;
      } else {
        el.legend.innerHTML = `<div class="bar" style="background:linear-gradient(90deg,#2b6cb0,#d8d8d8 37%,#f0a05a 66%,#b02a1a)"></div><div class="ticks"><span>−50%</span><span>0</span><span>+50%</span><span>+120%</span></div><div class="ticks"><span>sites with &gt;50 cycles in 2019</span></div>`;
      }
    }

    function apply() {
      const y = el.year.value, mode = el.mode.value;
      const prop = mode === "flow" ? "f" + y : "chg" + y;
      const filt = ["all", ["!=", ["get", prop], null]];
      if (el.area.value !== "all") filt.push(["==", ["get", "area"], el.area.value]);
      if (el.panel.checked) filt.push(["==", ["get", "panel"], 1]);
      map.setFilter("sites-panel", ["all", filt, ["==", ["get", "panel"], 1]]);
      map.setFilter("sites-other", ["all", filt, ["==", ["get", "panel"], 0]]);
      for (const id of ["sites-panel", "sites-other"]) {
        map.setPaintProperty(id, "circle-radius", mode === "flow" ? flowRadius(prop) : 5);
      }
      map.setPaintProperty("sites-panel", "circle-color", mode === "flow" ? flowColor(prop) : chgColor(prop));
      map.setPaintProperty("sites-other", "circle-stroke-color", "#1c2030");
      legend(mode);
    }

    map.on("load", () => {
      map.addSource("sites", { type: "geojson", data: sites });
      map.addLayer({ id: "sites-other", type: "circle", source: "sites", paint: { "circle-color": "rgba(255,255,255,0.25)", "circle-stroke-width": 1.2, "circle-stroke-color": "#1c2030", "circle-radius": 4, "circle-opacity": 0.9 } });
      map.addLayer({ id: "sites-panel", type: "circle", source: "sites", paint: { "circle-color": "#fd8d3c", "circle-stroke-width": 0.6, "circle-stroke-color": "#1c2030", "circle-radius": 4, "circle-opacity": 0.85 } });
      apply();
      [el.year, el.mode, el.area, el.panel].forEach((c) => c.addEventListener("change", apply));
      for (const id of ["sites-panel", "sites-other"]) {
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
        map.on("click", id, (e) => {
          const p = e.features[0].properties;
          const vals = [2019, 2022, 2024, 2025].map((y) => [y, p["f" + y] === "null" || p["f" + y] == null ? null : +p["f" + y]]);
          const mx = Math.max(...vals.map((v) => v[1] || 0), 1);
          const rows = vals.map(([y, v]) => `<div class="row"><span>${y}</span><span>${v == null ? '<span class="muted">no count</span>' : `<i style="width:${(v / mx) * 100}%"></i>`}</span><span style="text-align:right">${v == null ? "" : fmt(v)}</span></div>`).join("");
          new maplibregl.Popup({ maxWidth: "280px" })
            .setLngLat(e.lngLat)
            .setHTML(`<div class="pop"><h4>${p.name}</h4><div class="meta">${p.borough} · ${p.area} London · ${p.road === "null" ? "" : p.road.replace("Path", "path").replace("Local", "local street").replace("Minor", "minor road").replace(/^A$/, "A road").replace(/^B$/, "B road")} · ${+p.panel ? "strategic panel" : "not in panel"}</div>${rows}</div>`)
            .addTo(map);
        });
      }
    });
  })();
})();
