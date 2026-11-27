/* The 15 strata (3 areas x 5 road types): area zones, OpenFreeMap roads, panel sites */
(async function () {
  const box = document.getElementById("strata-map");
  if (!box) return;
  const [areas, sites] = await Promise.all([
    fetch("data/areas.geojson").then((r) => r.json()),
    fetch("data/sites.geojson").then((r) => r.json()),
  ]);
  sites.features = sites.features.filter((f) => f.properties.panel === 1);
  document.getElementById("sm-count").textContent = sites.features.length.toLocaleString("en-GB");

  const AREA = { Central: "#d6336c", Inner: "#f59f00", Outer: "#4c6ef5" };
  const ROAD = { A: "#d9230f", B: "#ef7d00", Minor: "#8a6d00", Local: "#6b7a99", Path: "#1f9d55" };
  const ROAD_LABEL = { A: "A road", B: "B road", Minor: "Minor road", Local: "Local street", Path: "Motor-vehicle-free path" };

  document.getElementById("sm-areas").innerHTML = Object.entries(AREA)
    .map(([k, c]) => `<div class="lg"><i style="background:${c};opacity:.45"></i>${k}</div>`).join("");
  document.getElementById("sm-roads").innerHTML = Object.entries(ROAD)
    .map(([k, c]) => `<div class="lg"><i style="background:${c};height:4px"></i>${ROAD_LABEL[k]}</div>`).join("");

  const map = new maplibregl.Map({
    container: box,
    style: "https://tiles.openfreemap.org/styles/positron",
    bounds: [[-0.5, 51.28], [0.28, 51.7]],
    fitBoundsOptions: { padding: 20 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

  const w = (a, b, c) => ["interpolate", ["linear"], ["zoom"], 9, a, 12, b, 16, c];
  const isRef = (p) => ["all", ["has", "ref"], ["==", ["slice", ["get", "ref"], 0, 1], p], ["in", ["slice", ["get", "ref"], 1, 2], ["literal", "0123456789".split("")]]];
  const trunkish = ["trunk", "primary", "secondary", "tertiary"];

  map.on("load", () => {
    const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addSource("areas", { type: "geojson", data: areas });
    map.addSource("sites", { type: "geojson", data: sites });

    map.addLayer({
      id: "area-fill", type: "fill", source: "areas",
      paint: { "fill-color": ["match", ["get", "area"], "Central", AREA.Central, "Inner", AREA.Inner, AREA.Outer], "fill-opacity": 0.2 },
    }, firstSymbol);
    map.addLayer({
      id: "area-line", type: "line", source: "areas",
      paint: { "line-color": ["match", ["get", "area"], "Central", AREA.Central, "Inner", AREA.Inner, AREA.Outer], "line-width": 2, "line-opacity": 0.8 },
    }, firstSymbol);

    // Order matters: Minor/Local are drawn first, A/B (from refs) are drawn over them.
    const road = (id, src, layer, filter, color, width, extra = {}) =>
      map.addLayer({
        id, type: "line", source: src, "source-layer": layer, minzoom: extra.minzoom ?? 9, filter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": width },
      }, firstSymbol);
    map.addSource("omt", { type: "vector", url: "https://tiles.openfreemap.org/planet" });
    road("r-local", "omt", "transportation", ["in", ["get", "class"], ["literal", ["minor", "living_street"]]], ROAD.Local, w(0.3, 0.7, 2), { minzoom: 11 });
    road("r-minor", "omt", "transportation", ["in", ["get", "class"], ["literal", trunkish]], ROAD.Minor, w(0.6, 1.2, 3.5));
    road("r-b", "omt", "transportation_name", isRef("B"), ROAD.B, w(1, 1.8, 4));
    road("r-a", "omt", "transportation_name", isRef("A"), ROAD.A, w(1.2, 2.4, 5));
    road("r-path", "omt", "transportation", ["==", ["get", "class"], "path"], ROAD.Path, w(0.4, 1, 2.5), { minzoom: 11 });

    map.addLayer({
      id: "sites", type: "circle", source: "sites",
      paint: {
        "circle-radius": w(2.2, 3.5, 6),
        "circle-color": ["match", ["get", "road"], "A", ROAD.A, "B", ROAD.B, "Minor", ROAD.Minor, "Local", ROAD.Local, ROAD.Path],
        "circle-stroke-color": ["match", ["get", "area"], "Central", AREA.Central, "Inner", AREA.Inner, AREA.Outer],
        "circle-stroke-width": 1.4,
      },
    });

    const roadSel = document.getElementById("sm-road");
    const apply = () => {
      const v = roadSel.value;
      const keep = { "r-a": "A", "r-b": "B", "r-minor": "Minor", "r-local": "Local", "r-path": "Path" };
      const lines = document.getElementById("sm-lines").checked;
      for (const [id, t] of Object.entries(keep))
        map.setLayoutProperty(id, "visibility", lines && (v === "all" || v === t) ? "visible" : "none");
      map.setLayoutProperty("sites", "visibility", document.getElementById("sm-sites").checked ? "visible" : "none");
      map.setFilter("sites", v === "all" ? null : ["==", ["get", "road"], v]);
    };
    ["sm-road", "sm-lines", "sm-sites"].forEach((id) => document.getElementById(id).addEventListener("input", apply));

    map.on("click", "sites", (e) => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat)
        .setHTML(`<div class="pop"><h4>${p.name}</h4><div class="meta">${p.borough} · ${p.area} · ${ROAD_LABEL[p.road]} (stratum ${p.area} / ${p.road})</div></div>`)
        .addTo(map);
    });
    map.on("mouseenter", "sites", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "sites", () => (map.getCanvas().style.cursor = ""));
  });
})();
