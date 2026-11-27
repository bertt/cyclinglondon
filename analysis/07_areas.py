"""Build Central / Inner / Outer area polygons for the strata map (DuckDB spatial).

TfL's zone polygons are not in the open data folder, so (as in 03_network.py,
where each road segment takes the area of its nearest monitoring site) every
cell of a regular grid takes the area of its nearest monitoring site. Cells
further than ~1.8 km from any site are dropped; the cells of each area are
dissolved and simplified.
"""
import pathlib
import duckdb

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "data"
STEP = 0.004  # grid size in degrees (~300 m x 450 m)
MAXD = 0.016  # max distance to nearest site in degrees

con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial;")
con.execute(f"""
CREATE TABLE sites AS
SELECT area, geom AS g FROM ST_Read('{(DOCS / "sites.geojson").as_posix()}')
""")
con.execute(f"""
CREATE TABLE grid AS
SELECT x, y, ST_Point(x + {STEP}/2, y + {STEP}/2) AS c,
       ST_MakeEnvelope(x, y, x + {STEP}, y + {STEP}) AS cell
FROM (SELECT -0.55 + i * {STEP} AS x, 51.25 + j * {STEP} AS y
      FROM range(0, 200) a(i), range(0, 140) b(j))
""")
con.execute(f"""
CREATE TABLE cells AS
SELECT cell, area FROM (
  SELECT g.cell, s.area,
         row_number() OVER (PARTITION BY g.x, g.y ORDER BY ST_Distance(g.c, s.g)) AS rn
  FROM grid g JOIN sites s ON ST_DWithin(g.c, s.g, {MAXD})
) WHERE rn = 1
""")
rows = con.execute("""
SELECT area, ST_AsGeoJSON(ST_Simplify(ST_Union_Agg(cell), 0.002)) FROM cells GROUP BY area
""").fetchall()

order = ["Outer", "Inner", "Central"]
feats = ",".join(
    f'{{"type":"Feature","properties":{{"area":"{a}"}},"geometry":{g}}}'
    for a, g in sorted(rows, key=lambda r: order.index(r[0]))
)
(DOCS / "areas.geojson").write_text(f'{{"type":"FeatureCollection","features":[{feats}]}}')
print({a: len(g) for a, g in rows})
