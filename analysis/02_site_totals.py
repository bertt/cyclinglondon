"""Aggregate the TfL spring count files to one weekday flow (06:00-22:00, all
directions, all cycle classes) per monitoring site and year."""
import pathlib
import duckdb

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)

files = sorted(p for p in RAW.glob("20* spring*.csv")) + sorted(p for p in RAW.glob("20* Q2 spring*.csv"))
files = sorted(set(files))
glob_list = ", ".join("'" + p.as_posix() + "'" for p in files)

con = duckdb.connect()
con.execute(
    f"""
    create table raw as
    select
      cast(substr(Wave, 1, 4) as int) as year,
      SiteID as site, Round as round, Direction as dir, Path as path,
      Time as time, Mode as mode, Day as day, Weather as weather, try_cast("Count" as int) as n
    from read_csv([{glob_list}], all_varchar=true, union_by_name=true)
    """
)
print(con.sql("select mode, count(*) from raw group by 1 order by 2 desc").fetchall())

# classification families: a site is counted with exactly one scheme, check overlap
con.execute(
    """
    create table fam as
    select year, site, round,
      case when mode in ('Private cycles','Cycle hire bikes') then 'ownership'
           when mode in ('Male cyclists','Female cyclists','Unknown cyclists') then 'gender'
           when mode in ('Conventional cycles','Cargo bikes') then 'class'
           else null end as family,
      n, time, dir, path, day
    from raw where day = 'Weekday'
    """
)
overlap = con.sql(
    """select year, count(*) as sites from (
         select year, site from fam where family is not null group by 1,2 having count(distinct family) > 1
       ) group by 1 order by 1"""
).fetchall()
print("sites with >1 classification family per year:", overlap)

# per site, year, round: sum of all cycle counts; keep the family with the largest total if several
con.execute(
    """
    create table site_round as
    select year, site, round, family, sum(n) as total, count(distinct time) as slots,
           count(*) as rows
    from fam where family is not null group by all
    """
)
con.execute(
    """
    create table site_year as
    with best as (
      select *, row_number() over (partition by year, site, round order by total desc) rk from site_round
    )
    select year, site, count(*) as rounds, avg(total) as flow, min(slots) as min_slots
    from best where rk = 1 group by year, site
    """
)
con.sql("select year, count(*) sites, round(avg(flow),0) mean_flow, min(min_slots) mn, max(min_slots) mx from site_year group by 1 order by 1").show()
con.execute(f"copy site_year to '{(OUT / 'site_year_flows.csv').as_posix()}' (header, delimiter ',')")

# share of 15-minute count slots recorded as wet (rain/drizzle/wet) per spring wave
con.execute(
    """
    create table wx as
    select year, avg(case when lower(weather) similar to '.*(wet|rain|drizzle|shower|storm).*' then 1.0 else 0.0 end) as wet_share
    from raw where mode in ('Private cycles','Conventional cycles','Male cyclists') and day = 'Weekday' group by year
    """
)
con.sql("select * from wx order by 1").show()
con.execute(f"copy wx to '{(OUT / 'wet_share.csv').as_posix()}' (header, delimiter ',')")
