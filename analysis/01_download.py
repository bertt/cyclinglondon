"""Download the TfL strategic count files (spring waves) and the OSM extract."""
import pathlib
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RAW = pathlib.Path(__file__).resolve().parent.parent / "raw"
RAW.mkdir(exist_ok=True)
TFL = "https://cycling.data.tfl.gov.uk/ActiveTravelCountsProgramme/"

files = ["1 Monitoring locations.csv", "2 Availability matrix.csv"]
for y in [2015, 2016, 2017, 2018, 2019, 2021]:
    files += [f"{y} Q2 spring (Apr-Jun)-{a}.csv" for a in ("Central", "Inner", "Outer")]
for y in [2022, 2023, 2024, 2025]:
    files += [f"{y} W1 spring-{a}.csv" for a in ("Central", "Inner-Part1", "Inner-Part2", "Outer")]

jobs = [(TFL + urllib.parse.quote(f), RAW / f) for f in files]
jobs.append(
    (
        "https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf",
        RAW / "greater-london.osm.pbf",
    )
)


def fetch(job):
    url, dest = job
    if dest.exists() and dest.stat().st_size > 0:
        return f"skip {dest.name}"
    req = urllib.request.Request(url, headers={"User-Agent": "cyclinglondon-analysis/1.0"})
    try:
        with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    except Exception as e:
        dest.unlink(missing_ok=True)
        return f"FAIL {dest.name}: {e}"
    return f"ok   {dest.name} {dest.stat().st_size/1e6:.1f} MB"


with ThreadPoolExecutor(6) as ex:
    for msg in ex.map(fetch, jobs):
        print(msg, flush=True)
