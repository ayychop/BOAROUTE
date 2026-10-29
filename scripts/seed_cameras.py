#!/usr/bin/env python3
"""Seed public.speed_cameras directly from OpenStreetMap, bypassing the Edge
Function. Use this for the initial bulk load, or whenever the Overpass API is
too flaky for the scheduled camera-sync function to succeed.

It mirrors the Edge Function's logic (same tags, same row shape) but runs from
a machine with a reliable connection and writes with the service-role key.

Setup:
    pip install requests supabase
    export SUPABASE_URL="https://<ref>.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # NOT the anon key

Examples:
    # Small area first, to prove the pipeline end to end (default box = High Wycombe):
    python scripts/seed_cameras.py

    # The whole UK once the small area works:
    python scripts/seed_cameras.py --uk

    # Fetch + parse only, no database writes:
    python scripts/seed_cameras.py --uk --dry-run

    # When every Overpass API endpoint is down, export the query from
    # https://overpass-turbo.eu in your browser (Export > raw data / JSON) and
    # seed from that file instead of calling the API:
    python scripts/seed_cameras.py --from-file cameras.json

The service-role key bypasses RLS and is a secret: pass it via the environment,
never on the command line or in the repo.
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import requests

# Mirrors tried in order; overpass-api.de is official but busiest. Override
# with --mirror to pin one.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# south, west, north, east
UK_BBOX = (49.8, -8.65, 61.1, 1.8)
# ~10 miles around High Wycombe: a quick end-to-end test that stays small.
HIGH_WYCOMBE_BBOX = (51.48, -0.98, 51.78, -0.52)

UPSERT_CHUNK = 1000
FETCH_ATTEMPTS = 4
RETRY_DELAY_S = 3

COMPASS = {
    "N": 0, "NNE": 22, "NE": 45, "ENE": 68, "E": 90, "ESE": 113, "SE": 135, "SSE": 158,
    "S": 180, "SSW": 203, "SW": 225, "WSW": 248, "W": 270, "WNW": 293, "NW": 315, "NNW": 338,
}


def parse_direction(value):
    """A numeric bearing or a compass word to degrees in [0, 360), else None."""
    if not value:
        return None
    word = COMPASS.get(str(value).strip().upper())
    if word is not None:
        return word
    try:
        return int(float(value)) % 360
    except (TypeError, ValueError):
        return None


def build_query(bbox):
    s, w, n, e = bbox
    bb = f"({s},{w},{n},{e})"
    return (
        "[out:json][timeout:180];"
        "("
        f'node["highway"="speed_camera"]{bb};'
        f'node["enforcement"="maxspeed"]{bb};'
        ");"
        "out body;"
    )


def element_to_row(el):
    """One Overpass node to a speed_cameras row, or None when unusable."""
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


def elements_to_rows(elements):
    """Map elements to rows, dropping unusable ones and de-duping by osm_id."""
    by_id = {}
    for el in elements:
        row = element_to_row(el)
        if row:
            by_id[row["osm_id"]] = row
    return list(by_id.values())


def fetch_elements(query, mirrors):
    """Fetch Overpass elements, retrying across mirrors with a backoff."""
    last = "no attempts made"
    for attempt in range(FETCH_ATTEMPTS):
        endpoint = mirrors[attempt % len(mirrors)]
        try:
            res = requests.post(
                endpoint,
                data={"data": query},
                headers={"User-Agent": "BOAROUTE-seeder/1.0"},
                timeout=180,
            )
            if res.status_code != 200:
                last = f"{endpoint} -> HTTP {res.status_code} {res.text[:200].strip()}"
                print(f"  attempt {attempt + 1}/{FETCH_ATTEMPTS}: {last}", file=sys.stderr)
            else:
                return res.json().get("elements", [])
        except requests.RequestException as ex:
            last = f"{endpoint} -> {type(ex).__name__}: {ex}"
            print(f"  attempt {attempt + 1}/{FETCH_ATTEMPTS}: {last}", file=sys.stderr)
        if attempt < FETCH_ATTEMPTS - 1:
            time.sleep(RETRY_DELAY_S)
    raise SystemExit(f"Overpass unreachable after {FETCH_ATTEMPTS} attempts. Last: {last}")


def load_elements(args):
    if args.from_file:
        import json
        with open(args.from_file, encoding="utf-8") as f:
            return json.load(f).get("elements", [])
    bbox = UK_BBOX if args.uk else (args.bbox or HIGH_WYCOMBE_BBOX)
    mirrors = [args.mirror] if args.mirror else OVERPASS_MIRRORS
    print(f"Fetching cameras for bbox {bbox} ...", file=sys.stderr)
    return fetch_elements(build_query(bbox), mirrors)


def upsert_rows(rows):
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")
    from supabase import create_client

    client = create_client(url, key)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    written = 0
    for i in range(0, len(rows), UPSERT_CHUNK):
        chunk = [{**r, "updated_at": now} for r in rows[i : i + UPSERT_CHUNK]]
        client.table("speed_cameras").upsert(chunk, on_conflict="osm_id").execute()
        written += len(chunk)
        print(f"  upserted {written}/{len(rows)}", file=sys.stderr)
    # The seeder only adds/updates; the scheduled camera-sync function prunes
    # cameras that later disappear from OSM.
    return written


def parse_bbox_arg(value):
    parts = [float(p) for p in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be south,west,north,east")
    return tuple(parts)


def main():
    ap = argparse.ArgumentParser(description="Seed speed_cameras from OpenStreetMap.")
    ap.add_argument("--uk", action="store_true", help="fetch the whole UK (default: High Wycombe test box)")
    ap.add_argument("--bbox", type=parse_bbox_arg, help="custom box: south,west,north,east")
    ap.add_argument("--mirror", help="force a single Overpass endpoint URL")
    ap.add_argument("--from-file", help="seed from an Overpass JSON export instead of the API")
    ap.add_argument("--dry-run", action="store_true", help="fetch and parse only; no database writes")
    args = ap.parse_args()

    elements = load_elements(args)
    rows = elements_to_rows(elements)
    print(f"Parsed {len(rows)} cameras from {len(elements)} elements.", file=sys.stderr)

    if args.dry_run:
        for r in rows[:10]:
            print(r)
        print(f"(dry run: {len(rows)} rows, not written)", file=sys.stderr)
        return

    if not rows:
        raise SystemExit("No cameras parsed; refusing to write an empty set.")
    written = upsert_rows(rows)
    print(f"Done: {written} cameras upserted into speed_cameras.", file=sys.stderr)


if __name__ == "__main__":
    main()
