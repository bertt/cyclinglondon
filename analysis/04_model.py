"""Rebuild the TfL cycling-use chain from open data and export JSON for the site.

weekday cycle-km  = sum over 15 strata of  L_g * mean_flow_g           (TfL method, step A)
stages (7-day avg) = cycle-km * kappa                                   (steps C/D; kappa not published)

kappa is not published, so we calibrate it on TfL's published stage totals
and test whether it is stable over time.
"""
import json
import pathlib
import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, DATA, OUT = ROOT / "raw", ROOT / "data", ROOT / "docs" / "data"
OUT.mkdir(parents=True, exist_ok=True)

loc = pd.read_csv(RAW / "1 Monitoring locations.csv")
loc = loc.rename(columns={
    "Site ID": "site", "Functional area for monitoring": "area", "Road type": "road",
    "Is it on the strategic CIO panel?": "panel", "Location description": "desc",
})
loc["area"] = loc.area.str[3:]
loc["road"] = loc.road.str[3:].replace({
    "A Road": "A", "B Road": "B", "Minor Road": "Minor", "Local Street": "Local", "Motor vehicle-free": "Path"})

flows = pd.read_csv(DATA / "site_year_flows.csv")
panel = flows.merge(loc[loc.panel == 1][["site", "area", "road"]], on="site")
YEARS = sorted(panel.year.unique())

# --- published TfL figures (Travel in London 2025/2026, TfL press release) ---------
PUBLISHED_TOTAL = {2019: 1.05, 2022: 1.20, 2024: 1.33, 2025: 1.50, 2026: 1.66}
PUBLISHED_AREA = {  # thousand stages/day, TfL press release Nov 2025
    2024: {"Central": 187, "Inner": 650, "Outer": 490},
    2025: {"Central": 211, "Inner": 747, "Outer": 538},
}

# --- stratum means ------------------------------------------------------------
g = panel.groupby(["year", "area", "road"]).flow.agg(["mean", "count", "std"]).reset_index()
mean_g = g.pivot_table(index=["area", "road"], columns="year", values="mean")

lengths = pd.read_csv(DATA / "osm_network_lengths.csv")
TFL_NETWORK_KM = 431 / 0.025  # TfL: 431 km of Cycleways = 2.5% of all cyclable roads and paths (rounded)


def length_table(variant, scale_to=None):
    t = lengths[lengths.variant == variant].set_index(["area", "road_type"]).km
    t.index.names = ["area", "road"]
    if scale_to:
        t = t * scale_to / t.sum()
    return t


variants = {
    "osm_no_service": length_table("without_service"),
    "osm_with_service": length_table("with_service"),
    "osm_scaled_to_tfl_2.5pct": length_table("without_service", TFL_NETWORK_KM),
}

result = {"years": [int(y) for y in YEARS], "variants": {}}
for name, L in variants.items():
    L = L.reindex(mean_g.index).fillna(0)
    km = mean_g.mul(L, axis=0)  # km * flow = cycle-km per stratum
    by_area = km.groupby("area").sum() / 1e6
    total = by_area.sum()
    out = {"network_km": float(L.sum()), "cycle_km_m": {int(y): float(total[y]) for y in YEARS},
           "cycle_km_area_m": {a: {int(y): float(by_area.loc[a, y]) for y in YEARS} for a in by_area.index}}
    kappa = {y: PUBLISHED_TOTAL[y] / total[y] for y in PUBLISHED_TOTAL if y in total.index}
    out["kappa_stages_per_cycle_km"] = {int(y): float(k) for y, k in kappa.items()}
    out["effective_km_per_stage"] = {int(y): float(1 / k) for y, k in kappa.items()}
    # hindcast with the 2025 kappa
    k25 = kappa[2025]
    out["hindcast_stages_m"] = {int(y): float(total[y] * k25) for y in YEARS}
    # area-level kappa for 2024 and 2025
    out["kappa_area"] = {
        int(y): {a: float(PUBLISHED_AREA[y][a] / 1000 / by_area.loc[a, y]) for a in by_area.index}
        for y in PUBLISHED_AREA
    }
    result["variants"][name] = out
    print(name, "network km", round(L.sum()))
    print(" cycle-km (M/weekday):", {y: round(v, 2) for y, v in out["cycle_km_m"].items()})
    print(" km per stage:", {y: round(v, 2) for y, v in out["effective_km_per_stage"].items()})
    print(" hindcast:", {y: round(v, 2) for y, v in out["hindcast_stages_m"].items()})
    print(" kappa area:", out["kappa_area"])

# --- simple panel statistics -----------------------------------------------------
ann = panel.groupby("year").flow.agg(["mean", "median", "count"])
result["panel"] = {int(y): {"mean": float(r["mean"]), "median": float(r["median"]), "n": int(r["count"])}
                   for y, r in ann.iterrows()}
area_year = panel.groupby(["year", "area"]).flow.mean().unstack()
result["panel_area_mean"] = {a: {int(y): float(area_year.loc[y, a]) for y in YEARS} for a in area_year.columns}
wx = pd.read_csv(DATA / "wet_share.csv")
result["wet_share"] = {int(r.year): float(r.wet_share) for r in wx.itertuples()}

# stratified (area x road) mean flow table for the last year
result["strata_2025"] = [
    {"area": a, "road": r, "sites": int(g[(g.year == 2025) & (g.area == a) & (g.road == r)]["count"].iloc[0]),
     "mean_flow": float(mean_g.loc[(a, r), 2025]),
     "km_osm": float(variants["osm_no_service"].reindex(mean_g.index).fillna(0).loc[(a, r)])}
    for (a, r) in mean_g.index
]

# --- matched-site growth and bootstrap uncertainty of year-on-year change ------------
rng = np.random.default_rng(42)
w = variants["osm_no_service"]


def strat_cyclekm(df):
    m = df.groupby(["area", "road"]).flow.mean()
    return float((m * w.reindex(m.index).fillna(0)).sum())


growth = {}
for y0, y1 in [(2023, 2024), (2024, 2025), (2022, 2023), (2019, 2022), (2019, 2025)]:
    a = panel[panel.year == y0].set_index("site")
    b = panel[panel.year == y1].set_index("site")
    both = a.index.intersection(b.index)
    a, b = a.loc[both].reset_index(), b.loc[both].reset_index()
    est = strat_cyclekm(b) / strat_cyclekm(a) - 1
    boots = []
    for _ in range(400):
        idx = rng.integers(0, len(both), len(both))
        boots.append(strat_cyclekm(b.iloc[idx]) / strat_cyclekm(a.iloc[idx]) - 1)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    growth[f"{y0}-{y1}"] = {"matched_sites": int(len(both)), "change": float(est), "ci95": [float(lo), float(hi)],
                            "raw_mean_flow_change": float(b.flow.mean() / a.flow.mean() - 1)}
    print(y0, y1, len(both), f"{est:+.1%}", f"[{lo:+.1%}, {hi:+.1%}]")
result["growth"] = growth

# sampling uncertainty of the 2025 level (resampling sites within each stratum)
p25 = panel[panel.year == 2025]
strata_groups = {k: d.flow.values for k, d in p25.groupby(["area", "road"])}
lvl = []
for _ in range(2000):
    tot = 0.0
    for (a, r), v in strata_groups.items():
        tot += w.get((a, r), 0.0) * rng.choice(v, len(v)).mean()
    lvl.append(tot)
lvl = np.array(lvl)
result["level_2025_bootstrap"] = {"rel_sd": float(lvl.std() / lvl.mean()),
                                  "ci95_rel": [float(np.percentile(lvl, 2.5) / lvl.mean() - 1),
                                               float(np.percentile(lvl, 97.5) / lvl.mean() - 1)]}
print(result["level_2025_bootstrap"])

# --- 2026 scenarios: which flow growth is needed for 1.66M? ----------------------------
k = result["variants"]["osm_no_service"]
cyc = k["cycle_km_m"]
result["scenario_2026"] = {
    "target_stages_m": 1.66,
    "needed_cyclekm_growth_if_kappa_constant": 0.101,
    "needed_cyclekm_growth_if_kappa_drifts_like_2024_25":
        1.101 / ((1.50 / cyc[2025]) / (1.33 / cyc[2024])) - 1,
    "kappa_drift_2024_25": (1.50 / cyc[2025]) / (1.33 / cyc[2024]) - 1,
    "flow_growth_2024_25": cyc[2025] / cyc[2024] - 1,
}
print(result["scenario_2026"])

# --- map data --------------------------------------------------------------------------
pv = panel.pivot_table(index="site", columns="year", values="flow")
sites = loc.merge(pv[[2019, 2022, 2024, 2025]].rename(columns=lambda c: f"f{c}"), left_on="site", right_index=True, how="left")
feats = []
for _, r in sites.iterrows():
    lat = pd.to_numeric(r.Latitude, errors="coerce")  # one source row holds the text "gre"
    if pd.isna(lat) or pd.isna(r.Longitude):
        continue
    props = {"id": r.site, "name": r.desc, "borough": r.Borough, "area": r.area, "road": r.road, "panel": int(r.panel)}
    for y in (2019, 2022, 2024, 2025):
        v = r.get(f"f{y}")
        props[f"f{y}"] = None if pd.isna(v) else round(float(v))
    feats.append({"type": "Feature", "properties": props,
                  "geometry": {"type": "Point", "coordinates": [round(r.Longitude, 5), round(float(lat), 5)]}})
(OUT / "sites.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
(OUT / "model.json").write_text(json.dumps(result, indent=1))
print("sites", len(feats))
