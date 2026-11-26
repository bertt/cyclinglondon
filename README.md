# Can London really have 1.66 million daily cycle journeys in 2026?

A static website (`docs/`) and a reproducible analysis pipeline (`analysis/`) that audit a headline figure: TfL's claim, repeated by [ianVisits](https://www.ianvisits.co.uk/articles/london-reaches-2030-cycling-target-four-years-early-94389/), that Londoners made **1.66 million cycle journeys a day in 2026**, up 10.1% from 1.50 million in 2025.

## Introduction

TfL does not count 1.66 million bikes. The figure is a *modelled estimate* built from spring traffic counts at ~1,450 panel sites, scaled to the whole road network and converted into "stages" (one stage = one ride on one vehicle, so a trip can have several). This project rebuilds as much of that chain as the public data allows and asks whether the number is plausible.

**Live site: https://bertt.github.io/cyclinglondon/** (GitHub Pages, served from the `docs/` folder).

## Sources

- TfL Cycling Data, Active Travel Counts Programme: https://cycling.data.tfl.gov.uk/ (count CSVs 2015–2025, monitoring locations, availability matrix, *Strategic cycling estimates – methodology note*)
- TfL *Travel in London 2025* (active travel and LTDS chapters)
- OpenStreetMap via Geofabrik Greater London extract (road network lengths)
- OpenFreeMap vector tiles (basemap, via MapLibre GL JS)
- ONS mid-2024 population estimates; published figures for Paris, Berlin and Copenhagen (cited on the site)

## Method

1. Download spring (wave 1) counts and compute weekday 06:00–22:00 cycle totals per site and year.
2. Take the strategic panel (1,451 sites, 15 area × road-type strata) and compute mean flow per stratum.
3. Multiply by OSM network length per stratum → weekday **cycle-km** = Σ L·q̄.
4. TfL converts to stages: stages = cycle-km ÷ stage length, weekend adjustment, 7-day average: (5·weekday + 2·weekend)/7.
5. Calibrate our own factor κ (stages per cycle-km) against TfL's published totals and compare.
6. Estimate growth on matched sites with stratum weights and a bootstrap 95% CI.
7. Test what 2026 would need: +10.1% cycle-km growth if κ is constant, about +6.6% if κ keeps drifting up as it did in 2024→25.

TfL's group lengths and stage-length factors are not public, so the conversion cannot be reproduced exactly.

## Key findings

- Matched-site flow growth 2024→25: **+9.6%** (95% CI +7.0 to +11.7). Our counts-only series reproduces the 2025 level to within sampling error (about ±6%).
- Published stages rose +43% from 2019 to 2025, but counts rose only +32%: ~8% of the rise comes from the conversion step.
- Spring 2025 was unusually dry (5.7% of count slots wet vs 14.6% in 2024), which flatters the 2025 base.
- No 2026 count data is published, so 1.66 million cannot be verified.
- LTDS survey data implies ~0.06 cycle trips per resident per day, well below what counts imply (~0.15); TfL acknowledges the gap.

## Conclusion

**Plausible, directionally credible, not independently verifiable.** The trend is real and the 2025 level is consistent with the public counts. But the 2026 figure beats the 1.6 million target by only 3.8%, which is well inside the ±6% sampling error, rests on a dry 2025 baseline and closed conversion inputs, and has no public 2026 counts behind it. A fair description is "roughly 1.5 to 1.8 million daily cycle stages, with a clear upward trend". Per resident, London is still behind Paris, Berlin and Copenhagen.

## Possible improvements

- Obtain TfL's group lengths and LTDS stage-length factors (FOI request) to replicate exactly.
- Add 2026 counts when published; test weather-adjusted flows.
- Use a better network model (OSM cycleability tags, TfL road classification).
- Add Dutch cities once a verifiable comparable figure is found.
- Include autumn (wave 2) counts and cycle-hire/e-bike splits.

## Reproduce

Python is run with [uv](https://docs.astral.sh/uv/):

```powershell
uv run --with pandas --with duckdb python analysis/01_download.py
uv run --with pandas --with duckdb python analysis/02_site_totals.py
uv run --with pandas --with osmium --with pyproj --with scipy --with numpy python analysis/03_network.py
uv run --with pandas --with numpy --with scipy --with pyproj python analysis/04_model.py
cd docs; uv run python -m http.server 8000
```

`raw/` (downloads, ~hundreds of MB) is git-ignored; `docs/data/` holds the generated JSON used by the site.
