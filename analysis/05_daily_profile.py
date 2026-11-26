"""Average weekday profile (06:00-22:00, 15-minute slots) per strategic-panel site, spring 2025.
Output: docs/data/daily_profile.json"""
import json
import pathlib
import duckdb
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "docs" / "data"

loc = pd.read_csv(RAW / "1 Monitoring locations.csv")
loc.columns = ["site", "desc", "borough", "area", "road", "panel", "old", "e", "n", "lat", "lon"]
loc["lat"] = pd.to_numeric(loc.lat, errors="coerce")
loc["lon"] = pd.to_numeric(loc.lon, errors="coerce")
loc = loc[(loc.panel == 1)].dropna(subset=["lat", "lon"])

files = sorted(RAW.glob("2025 W1 spring*.csv"))
glob_list = ", ".join("'" + p.as_posix() + "'" for p in files)
con = duckdb.connect()
con.execute(
    f"""
    create table raw as
    select SiteID as site, Round as round, Time as time, Mode as mode, try_cast("Count" as int) as n
    from read_csv([{glob_list}], all_varchar=true, union_by_name=true)
    where Day = 'Weekday'
    """
)
# one classification family per site (largest total), then sum directions and modes per slot, mean over rounds
df = con.sql(
    """
    with f as (
      select site, round, time, n,
        case when mode in ('Private cycles','Cycle hire bikes') then 1
             when mode in ('Male cyclists','Female cyclists','Unknown cyclists') then 2
             when mode in ('Conventional cycles','Cargo bikes') then 3 end as fam
      from raw
    ), tot as (
      select site, fam, sum(n) t from f where fam is not null group by 1,2
    ), best as (
      select site, fam from (select *, row_number() over (partition by site order by t desc) rk from tot) where rk = 1
    ), slot as (
      select f.site, f.round, f.time, sum(f.n) n from f join best b using (site, fam) group by all
    )
    select site, substr(time, 1, 5) as t, avg(n) as n from slot group by 1, 2
    """
).df()

slots = [f"{h:02d}:{m:02d}" for h in range(6, 22) for m in (0, 15, 30, 45)]
piv = df.pivot(index="site", columns="t", values="n").reindex(columns=slots).fillna(0)
sites = loc[loc.site.isin(piv.index)]
rows = []
for r in sites.itertuples():
    rows.append(
        {
            "id": r.site,
            "lon": round(r.lon, 5),
            "lat": round(r.lat, 5),
            "area": r.area,
            "c": [round(v, 1) for v in piv.loc[r.site].tolist()],
        }
    )
OUT.mkdir(parents=True, exist_ok=True)
json.dump({"year": 2025, "slots": slots, "sites": rows}, open(OUT / "daily_profile.json", "w"), separators=(",", ":"))
tot = piv.loc[sites.site].sum()
print(len(rows), "sites; peak slot", tot.idxmax(), "total", round(tot.max()), "min", tot.idxmin(), round(tot.min()))
