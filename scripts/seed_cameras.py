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
    # Just the areas you cover: a box around all your stores (reads the stores
    # table). This is the recommended mode when the UK query is too heavy:
    python scripts/seed_cameras.py --from-stores

    # ...limited to one user's assigned stores, with a wider margin:
    python scripts/seed_cameras.py --from-stores --assignee <user-uuid> --margin-km 10

    # Small fixed area, to prove the pipeline end to end (default = High Wycombe):
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


def get_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")
    from supabase import create_client

    return create_client(url, key)


def pad_bbox(s, w, n, e, margin_km):
    """Grow a box by a margin so cameras just outside the stores are included."""
    import math

    d_lat = margin_km / 111.32
    mid = math.radians((s + n) / 2)
    d_lng = margin_km / max(111.32 * math.cos(mid), 1e-6)
    return (s - d_lat, w - d_lng, n + d_lat, e + d_lng)


def fetch_store_bbox(client, margin_km, assignee=None):
    """A bounding box covering the stores' coordinates, padded by margin_km.

    By default every store with coordinates counts; pass an assignee UUID to
    limit it to the stores assigned to one user (via store_assignees).
    """
    if assignee:
        links = client.table("store_assignees").select("store_id").eq("user_id", assignee).execute().data or []
        ids = [r["store_id"] for r in links]
        if not ids:
            raise SystemExit(f"No stores assigned to {assignee}.")
        rows = client.table("stores").select("latitude,longitude").in_("id", ids).execute().data or []
    else:
        rows = client.table("stores").select("latitude,longitude").execute().data or []

    pts = [
        (float(r["latitude"]), float(r["longitude"]))
        for r in rows
        if r.get("latitude") is not None and r.get("longitude") is not None
    ]
    if not pts:
        raise SystemExit("No stores have coordinates yet; cannot build a box.")
    lats = [p[0] for p in pts]
    lngs = [p[1] for p in pts]
    box = pad_bbox(min(lats), min(lngs), max(lats), max(lngs), margin_km)
    print(f"Store box from {len(pts)} stores (+{margin_km}km): {tuple(round(x, 4) for x in box)}", file=sys.stderr)
    return box


def choose_bbox(args, client):
    if args.uk:
        return UK_BBOX
    if args.bbox:
        return args.bbox
    if args.from_stores:
        return fetch_store_bbox(client, args.margin_km, args.assignee)
    return HIGH_WYCOMBE_BBOX


def load_elements(args, client):
    if args.from_file:
        import json
        with open(args.from_file, encoding="utf-8") as f:
            return json.load(f).get("elements", [])
    bbox = choose_bbox(args, client)
    mirrors = [args.mirror] if args.mirror else OVERPASS_MIRRORS
    print(f"Fetching cameras for bbox {tuple(round(x, 4) for x in bbox)} ...", file=sys.stderr)
    return fetch_elements(build_query(bbox), mirrors)


def upsert_rows(client, rows):
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
    ap.add_argument("--uk", action="store_true", help="fetch the whole UK")
    ap.add_argument("--from-stores", action="store_true", help="box covering your stores' coordinates (reads the stores table)")
    ap.add_argument("--assignee", help="with --from-stores, limit to one user's assigned stores (UUID)")
    ap.add_argument("--margin-km", type=float, default=5.0, help="padding around the store box (default 5)")
    ap.add_argument("--bbox", type=parse_bbox_arg, help="custom box: south,west,north,east")
    ap.add_argument("--mirror", help="force a single Overpass endpoint URL")
    ap.add_argument("--from-file", help="seed from an Overpass JSON export instead of the API")
    ap.add_argument("--dry-run", action="store_true", help="fetch and parse only; no database writes")
    args = ap.parse_args()

    # A client is needed to read the store box and to write; not for a file dry-run.
    client = get_client() if (args.from_stores or not args.dry_run) else None

    elements = load_elements(args, client)
    rows = elements_to_rows(elements)
    print(f"Parsed {len(rows)} cameras from {len(elements)} elements.", file=sys.stderr)

    if args.dry_run:
        for r in rows[:10]:
            print(r)
        print(f"(dry run: {len(rows)} rows, not written)", file=sys.stderr)
        return

    if not rows:
        raise SystemExit("No cameras parsed; refusing to write an empty set.")
    written = upsert_rows(client, rows)
    print(f"Done: {written} cameras upserted into speed_cameras.", file=sys.stderr)


if __name__ == "__main__":
    main()
