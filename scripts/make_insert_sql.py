#!/usr/bin/env python3
"""Offline: turn an Overpass `cameras.json` export into a single SQL file of
chunked upserts for public.speed_cameras. No network and no dependencies, for
when the Python seeder can't reach Supabase or Overpass.

Usage:
    python scripts/make_insert_sql.py                      # cameras.json -> insert_cameras.sql
    python scripts/make_insert_sql.py in.json out.sql      # custom paths
    python scripts/make_insert_sql.py --chunk 500          # rows per INSERT

Then open the .sql file and paste it into the Supabase SQL editor. The
statements use ON CONFLICT (osm_id) DO UPDATE, so re-running is safe.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

CHUNK_DEFAULT = 500
COLUMNS = "osm_id, latitude, longitude, direction, maxspeed, ref, updated_at"

COMPASS = {
    "N": 0, "NNE": 22, "NE": 45, "ENE": 68, "E": 90, "ESE": 113, "SE": 135, "SSE": 158,
    "S": 180, "SSW": 203, "SW": 225, "WSW": 248, "W": 270, "WNW": 293, "NW": 315, "NNW": 338,
}


def parse_direction(value):
    if not value:
        return None
    word = COMPASS.get(str(value).strip().upper())
    if word is not None:
        return word
    try:
        return int(float(value)) % 360
    except (TypeError, ValueError):
        return None


def element_to_row(el):
    """One Overpass node to a row dict, or None when unusable (matches the TS/py seeder)."""
    if el.get("type") != "node" or not isinstance(el.get("id"), int):
        return None
    lat, lon = el.get("lat"), el.get("lon")
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if abs(lat) > 90 or abs(lon) > 180:
        return None
    tags = el.get("tags") or {}
    return {
        "osm_id": el["id"],
        "latitude": lat,
        "longitude": lon,
        "direction": parse_direction(tags.get("direction")),
        "maxspeed": tags.get("maxspeed") or tags.get("maxspeed:forward"),
        "ref": tags.get("ref"),
    }


def rows_from(elements):
    """Parsed rows, unusable ones dropped and de-duped by osm_id (required for
    ON CONFLICT: the same id twice in one statement would error)."""
    by_id = {}
    for el in elements:
        row = element_to_row(el)
        if row:
            by_id[row["osm_id"]] = row
    return list(by_id.values())


def sql_text(value):
    """A SQL string literal (single quotes doubled), or NULL."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def value_tuple(row, now):
    direction = "NULL" if row["direction"] is None else str(int(row["direction"]))
    return (
        f"({row['osm_id']}, {row['latitude']!r}, {row['longitude']!r}, "
        f"{direction}, {sql_text(row['maxspeed'])}, {sql_text(row['ref'])}, '{now}')"
    )


ON_CONFLICT = (
    "ON CONFLICT (osm_id) DO UPDATE SET\n"
    "  latitude = excluded.latitude,\n"
    "  longitude = excluded.longitude,\n"
    "  direction = excluded.direction,\n"
    "  maxspeed = excluded.maxspeed,\n"
    "  ref = excluded.ref,\n"
    "  updated_at = excluded.updated_at;"
)


def build_sql(rows, chunk):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    out = [
        f"-- {len(rows)} speed cameras, generated {now} from an Overpass export.",
        f"-- {((len(rows) + chunk - 1) // chunk)} statements, up to {chunk} rows each. Safe to re-run.",
        "",
    ]
    for i in range(0, len(rows), chunk):
        batch = rows[i : i + chunk]
        values = ",\n".join(value_tuple(r, now) for r in batch)
        out.append(f"INSERT INTO public.speed_cameras ({COLUMNS}) VALUES\n{values}\n{ON_CONFLICT}")
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="Generate a chunked upsert SQL file from an Overpass JSON export.")
    ap.add_argument("infile", nargs="?", default="cameras.json", help="Overpass JSON export (default: cameras.json)")
    ap.add_argument("outfile", nargs="?", default="insert_cameras.sql", help="SQL output (default: insert_cameras.sql)")
    ap.add_argument("--chunk", type=int, default=CHUNK_DEFAULT, help=f"rows per INSERT (default: {CHUNK_DEFAULT})")
    args = ap.parse_args()

    try:
        with open(args.infile, encoding="utf-8") as f:
            elements = json.load(f).get("elements", [])
    except FileNotFoundError:
        raise SystemExit(f"Not found: {args.infile}. Export the Overpass query to this file first.")

    rows = rows_from(elements)
    if not rows:
        raise SystemExit("No usable cameras in the export; nothing to write.")

    with open(args.outfile, "w", encoding="utf-8") as f:
        f.write(build_sql(rows, args.chunk))

    statements = (len(rows) + args.chunk - 1) // args.chunk
    print(f"Wrote {args.outfile}: {len(rows)} cameras from {len(elements)} elements, {statements} INSERT statements.", file=sys.stderr)


if __name__ == "__main__":
    main()
