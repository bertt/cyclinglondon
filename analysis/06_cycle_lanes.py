"""Cycle lanes vs cycle flows at TfL strategic-panel count sites (2022-2025).
1. cross-section: flow at sites with / without a cycle lane, with growing controls
2. event study: sites that gained a lane between 2022 and 2025 vs sites that never had one
Output: docs/data/lanes.json"""
import glob
import json
import pathlib
import duckdb
import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
rng = np.random.default_rng(7)

loc = pd.read_csv(RAW / "1 Monitoring locations.csv")
loc.columns = ["site", "desc", "borough", "area", "road", "panel", "old", "e", "n", "lat", "lon"]
loc["lat"] = pd.to_numeric(loc.lat, errors="coerce")
loc["lon"] = pd.to_numeric(loc.lon, errors="coerce")
loc = loc[loc.panel == 1].dropna(subset=["lat", "lon", "road", "area"])
# distance to Charing Cross (km, flat-earth approximation is fine at London scale)
loc["dist"] = np.hypot((loc.lat - 51.5074) * 111.2, (loc.lon + 0.1278) * 111.2 * np.cos(np.radians(51.5)))

files = [p.replace("\\", "/") for p in glob.glob(str(RAW / "20??*W1 spring*.csv"))]
con = duckdb.connect()
con.execute(
    f"""create table r as select cast(substr(Wave,1,4) as int) y, SiteID s, Round rd, Path p, Mode m,
        try_cast("Count" as int) n from read_csv({files}, all_varchar=true, union_by_name=true) where Day='Weekday'"""
)
df = con.sql(
    """
    with f as (select y, s, rd, p, n, case when m in ('Private cycles','Cycle hire bikes') then 1
          when m in ('Male cyclists','Female cyclists','Unknown cyclists') then 2
          when m in ('Conventional cycles','Cargo bikes') then 3 end fam from r),
    best as (select y, s, fam from (select y, s, fam, row_number() over (partition by y, s order by sum(n) desc) rk
             from f where fam is not null group by y, s, fam) where rk = 1),
    x as (select f.y, f.s, f.rd, sum(f.n) tot, sum(case when f.p like 'Cycle lane%' then f.n else 0 end) lane
          from f join best b using (y, s, fam) group by all)
    select y as year, s as site, avg(tot) flow, avg(lane) lane_flow from x group by 1, 2
    """
).df()
df["lane"] = (df.lane_flow > 0).astype(int)
df = df.merge(loc[["site", "area", "road", "dist"]], on="site")
df = df[df.flow > 0]
df["stratum"] = df.area + "/" + df.road
df["ly"] = np.log(df.flow)

# ---------- 1. cross-section: site-level mean of log flow over 2022-25 ----------
s = df.groupby("site").agg(ly=("ly", "mean"), flow=("flow", "mean"), lane=("lane", "max"), area=("area", "first"),
                           road=("road", "first"), dist=("dist", "first"), stratum=("stratum", "first")).reset_index()
s["ld"] = np.log(s.dist.clip(lower=0.3))


def design(d, controls):
    cols = [np.ones(len(d)), d.lane.values.astype(float)]
    if "stratum" in controls:
        dm = pd.get_dummies(d.stratum, drop_first=True).values.astype(float)
        cols += list(dm.T)
    if "dist" in controls:
        cols += [d.ld.values, d.ld.values ** 2]
    return np.column_stack(cols)


def coef(d, controls):
    X = design(d, controls)
    b = np.linalg.lstsq(X, d.ly.values, rcond=None)[0]
    return b[1]


def boot(d, fn, B=1000):
    out = []
    n = len(d)
    for _ in range(B):
        out.append(fn(d.iloc[rng.integers(0, n, n)]))
    return np.percentile(out, [2.5, 97.5])


ladder = []
for label, ctl in [("No controls", []), ("+ area × road type", ["stratum"]), ("+ distance to centre", ["stratum", "dist"])]:
    b = coef(s, ctl)
    lo, hi = boot(s, lambda d: coef(d, ctl))
    ladder.append({"label": label, "ratio": float(np.exp(b) - 1), "ci": [float(np.exp(lo) - 1), float(np.exp(hi) - 1)]})
    print(label, round(np.exp(b) - 1, 3), np.exp([lo, hi]) - 1)

cell = (s.groupby(["area", "road", "lane"]).agg(sites=("site", "count"), mean=("flow", "mean"), median=("flow", "median")).reset_index())
share = float(s.lane.mean())
print("sites", len(s), "lane share", share)

# ---------- 2. event study: lane status change 2022 -> 2025 ----------
w = df.pivot(index="site", columns="year", values="lane")
fl = df.pivot(index="site", columns="year", values="ly")
ev = pd.DataFrame({"l22": w[2022], "l25": w[2025], "y22": fl[2022], "y25": fl[2025]}).dropna()
ev = ev.join(s.set_index("site")[["stratum", "ld"]])
gain = ev[(ev.l22 == 0) & (ev.l25 == 1)]
never = ev[(ev.l22 == 0) & (ev.l25 == 0)]
always = ev[(ev.l22 == 1) & (ev.l25 == 1)]
lost = ev[(ev.l22 == 1) & (ev.l25 == 0)]
print("gainers", len(gain), "never", len(never), "always", len(always), "lost", len(lost))


def stratified_mean(d, col, strata_w):
    g = d.groupby("stratum")[col].mean()
    ww = strata_w.reindex(g.index).fillna(0)
    return float((g * ww).sum() / ww.sum())


def did(gain_d, ctrl_d):
    # compare gainers with controls of the same stratum, weighting strata by number of gainers
    sw = gain_d.groupby("stratum").size()
    dg = gain_d.assign(dy=gain_d.y25 - gain_d.y22)
    dc = ctrl_d.assign(dy=ctrl_d.y25 - ctrl_d.y22)
    common = sw.index.intersection(dc.stratum.unique())
    sw = sw.loc[common]
    return stratified_mean(dg[dg.stratum.isin(common)], "dy", sw) - stratified_mean(dc[dc.stratum.isin(common)], "dy", sw)


def level_gap(gain_d, ctrl_d):
    sw = gain_d.groupby("stratum").size()
    common = sw.index.intersection(ctrl_d.stratum.unique())
    sw = sw.loc[common]
    return stratified_mean(gain_d[gain_d.stratum.isin(common)], "y22", sw) - stratified_mean(ctrl_d[ctrl_d.stratum.isin(common)], "y22", sw)


def b_ci(fn, g, c, B=1000):
    out = []
    for _ in range(B):
        out.append(fn(g.iloc[rng.integers(0, len(g), len(g))], c.iloc[rng.integers(0, len(c), len(c))]))
    return [float(np.exp(v) - 1) for v in np.percentile(out, [2.5, 97.5])]


event = {
    "gainers": len(gain), "never": len(never), "always": len(always), "lost": len(lost),
    "did": float(np.exp(did(gain, never)) - 1), "did_ci": b_ci(did, gain, never),
    "gap22": float(np.exp(level_gap(gain, never)) - 1), "gap22_ci": b_ci(level_gap, gain, never),
    "growth_gain": float(np.exp((gain.y25 - gain.y22).mean()) - 1),
    "growth_never": float(np.exp((never.y25 - never.y22).mean()) - 1),
    "growth_always": float(np.exp((always.y25 - always.y22).mean()) - 1),
}
print(event)

out = {
    "sites": int(len(s)), "lane_share": share, "ladder": ladder,
    "cells": cell.to_dict("records"), "event": event,
    "network_km": {"2016": 90, "2024": 403, "2025": 431},
}
json.dump(out, open(ROOT / "docs" / "data" / "lanes.json", "w"), separators=(",", ":"))
