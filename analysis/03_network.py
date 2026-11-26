"""Estimate the length of the cyclable network (km) in Greater London per
TfL sampling group (area x road type) from OpenStreetMap.

Area is assigned by nearest TfL monitoring location (all 2,176 sites carry an
area label), because the official congestion-zone / inner-cordon polygons are not
published in the data folder. Road class is derived from OSM tags.
"""
import json
import pathlib
import numpy as np
import osmium
import pandas as pd
from pyproj import Transformer
from scipy.spatial import cKDTree

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "raw", ROOT / "data"

MV_FREE_HW = {"cycleway", "path", "track", "bridleway", "footway", "pedestrian", "steps"}
SKIP_SERVICE = {"driveway", "parking_aisle", "drive-through"}


def classify(tags, include_service):
    hw = tags.get("highway")
    if hw is None:
        return None
    ref = tags.get("ref", "")
    if hw in ("motorway", "motorway_link"):
        return None
    if hw in ("trunk", "primary", "secondary", "tertiary", "trunk_link", "primary_link",
              "secondary_link", "tertiary_link", "unclassified"):
        if tags.get("bicycle") == "no" and hw in ("trunk", "trunk_link"):
            return None
        first = ref.split(";")[0].strip()
        if first[:1] == "A" and first[1:2].isdigit():
            return "A"
        if first[:1] == "B" and first[1:2].isdigit():
            return "B"
        return "Minor"
    if hw in ("residential", "living_street"):
        return "Local"
    if hw == "service":
        if include_service and tags.get("service") not in SKIP_SERVICE and tags.get("access") not in ("private", "no"):
            return "Local"
        return None
    if hw in MV_FREE_HW:
        bike = tags.get("bicycle")
        if hw == "steps":
            return None
        if hw in ("footway", "pedestrian"):
            return "Path" if bike in ("yes", "designated", "permissive") else None
        if bike == "no":
            return None
        if hw in ("path", "track") and tags.get("access") in ("private", "no"):
            return None
        return "Path"
    return None


class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.seg = []  # lon1, lat1, lon2, lat2, cls_service, cls_noservice

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        if "highway" not in tags:
            return
        c_with = classify(tags, True)
        if c_with is None:
            return
        c_wo = classify(tags, False)
        try:
            pts = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
            self.seg.append((x1, y1, x2, y2, c_with, c_wo or ""))


h = Collector()
h.apply_file(str(RAW / "greater-london.osm.pbf"), locations=True)
df = pd.DataFrame(h.seg, columns=["x1", "y1", "x2", "y2", "cls", "cls_noservice"])
print("segments", len(df))

R = 6371008.8
lat1, lat2 = np.radians(df.y1), np.radians(df.y2)
dlat, dlon = lat2 - lat1, np.radians(df.x2 - df.x1)
a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
df["km"] = 2 * R * np.arcsin(np.sqrt(a)) / 1000

tr = Transformer.from_crs(4326, 27700, always_xy=True)
mx, my = tr.transform(((df.x1 + df.x2) / 2).values, ((df.y1 + df.y2) / 2).values)

loc = pd.read_csv(RAW / "1 Monitoring locations.csv")
sx, sy = loc["Easting (UK Grid)"].values, loc["Northing (UK Grid)"].values
area = loc["Functional area for monitoring"].str[3:].values  # Central / Inner / Outer
dist, idx = cKDTree(np.c_[sx, sy]).query(np.c_[mx, my])
df["area"] = area[idx]
df["site_dist_m"] = dist

rows = []
for variant, col in (("with_service", "cls"), ("without_service", "cls_noservice")):
    g = df[df[col] != ""].groupby(["area", col]).km.sum().reset_index()
    g.columns = ["area", "road_type", "km"]
    g["variant"] = variant
    rows.append(g)
res = pd.concat(rows)
res.to_csv(OUT / "osm_network_lengths.csv", index=False)
print(res.pivot_table(index=["variant", "road_type"], columns="area", values="km", aggfunc="sum").round(0))
print(res.groupby("variant").km.sum())
print("median distance to nearest site (m):", np.median(dist).round(0))
