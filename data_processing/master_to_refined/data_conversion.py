#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Convert master_resources.csv into the same column format as resources.csv.

Keeps master row granularity (one row per location).

Fix A (Encoding-safe):
  --encoding cp1252
  --errors strict|replace|ignore

Also handles:
  - (For ISP only) low-cost offer/subsidy (alias to master 4a low–cost)
  - Phone Number.1 .. Phone Number.4 (map to master Phone: fallback Business Phone No:)
  - Q10 special mapping (Yes/No + 10a multi-select)

NEW: FAST Mapbox Geocoding (unique addresses + cache + concurrency)
  - Adds columns: lat, long
  - Geocodes resolved address per row (your existing Virtual/Physical/Org resolution)
  - Skips "Virtual"
  - Geocodes UNIQUE addresses only, then maps back to rows
  - Threaded requests for speed
  - Uses JSON cache for cheap reruns

NEW: Google Maps URL column
  - Adds column: google_maps_url (configurable)
  - latlong mode: https://www.google.com/maps?q=lat,long (fallback to address search if missing)
  - address mode: https://www.google.com/maps/search/?api=1&query=<address>
  - Skips Virtual/blank addresses

NEW: Physical county assignment (point-in-polygon)
  - Adds column: physical_county (configurable)
  - Uses counties GeoJSON (default: california_counties.geojson) with county name property NAME
  - Assigns county for rows with valid lat/long
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import warnings
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any

import pandas as pd
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

import geopandas as gpd
from shapely.geometry import Point


FALSEY = {
    "", "0", "false", "no", "n", "none", "null", "nan",
    "unchecked", "not selected", "off"
}
TRUTHY = {"yes", "y", "true", "1", "checked", "on"}


def norm_header(s: str) -> str:
    s = "" if s is None else str(s)
    s = s.replace("\xa0", " ").replace("\t", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("::", ":")
    s = re.sub(r":\s*$", "", s)
    s = s.replace("...", "").replace("…", "")
    return s.lower()


def is_selected(v) -> bool:
    if v is None:
        return False
    try:
        if pd.isna(v):
            return False
    except Exception:
        pass
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v) != 0.0
    s = str(v).strip()
    if s == "":
        return False
    return s.lower() not in FALSEY


def is_yes(v) -> bool:
    if v is None:
        return False
    try:
        if pd.isna(v):
            return False
    except Exception:
        pass
    s = str(v).strip().lower()
    if s == "":
        return False
    if s in TRUTHY:
        return True
    return s.startswith("yes")


def is_no(v) -> bool:
    if v is None:
        return False
    try:
        if pd.isna(v):
            return False
    except Exception:
        pass
    s = str(v).strip().lower()
    if s == "":
        return False
    return s in {"no", "n", "false", "0", "off"} or s.startswith("no")


def best_fuzzy_match(
    target_norm: str,
    candidate_norms: List[str],
    cutoff: float = 0.80
) -> Tuple[Optional[str], float]:
    best = None
    best_score = 0.0
    for cand in candidate_norms:
        score = SequenceMatcher(None, target_norm, cand).ratio()
        if score > best_score:
            best_score = score
            best = cand
    if best_score < cutoff:
        return None, best_score
    return best, best_score


def build_breakout_map(cols: List[str]) -> Dict[str, List[Tuple[str, str]]]:
    breakout: Dict[str, List[Tuple[str, str]]] = {}
    for c in cols:
        if ": " not in c:
            continue
        left, right = c.rsplit(": ", 1)
        if re.match(r"^\s*\d+[a-z]?\.", left.strip(), flags=re.IGNORECASE):
            base = norm_header(left)
            opt = right.strip()
            breakout.setdefault(base, []).append((c, opt))
    return breakout


def combine_breakout(df: pd.DataFrame, cols_opts: List[Tuple[str, str]], joiner: str) -> pd.Series:
    def combine_row(row) -> str:
        picked: List[str] = []
        for col, opt in cols_opts:
            if is_selected(row.get(col)):
                picked.append(opt)
        return joiner.join(picked) if picked else ""
    return df.apply(combine_row, axis=1)


def is_blank(v) -> bool:
    if v is None:
        return True
    try:
        if pd.isna(v):
            return True
    except Exception:
        pass
    return str(v).strip() == ""


def row_has_any(row: pd.Series, cols: List[str]) -> bool:
    for c in cols:
        if c in row.index and not is_blank(row[c]):
            return True
    return False


def find_output_col(out_df: pd.DataFrame, *candidates: str) -> Optional[str]:
    norm_map = {norm_header(c): c for c in out_df.columns}
    for cand in candidates:
        key = norm_header(cand)
        if key in norm_map:
            return norm_map[key]
    return None


# ---------------------------
# FAST Mapbox geocoding helpers
# ---------------------------

MAPBOX_ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"


def _load_json_cache(path: Optional[Path]) -> Dict[str, Dict[str, Optional[float]]]:
    if path is None or not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        out: Dict[str, Dict[str, Optional[float]]] = {}
        for k, v in data.items():
            if isinstance(k, str) and isinstance(v, dict):
                lat = v.get("lat")
                lon = v.get("long")
                out[k] = {
                    "lat": float(lat) if isinstance(lat, (int, float)) else None,
                    "long": float(lon) if isinstance(lon, (int, float)) else None,
                }
        return out
    except Exception:
        return {}


def _save_json_cache(path: Optional[Path], cache: Dict[str, Dict[str, Optional[float]]]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def format_address_for_geocode(a1: str, a2: str, city: str, state: str, zip_code: str) -> str:
    parts = [a1, a2, city, state, zip_code]
    parts = [str(p).strip() for p in parts if p is not None and str(p).strip()]
    return ", ".join(parts)


def geocode_address_mapbox(
    address: str,
    token: str,
    *,
    country: str = "US",
    timeout: int = 20,
) -> Optional[Tuple[float, float]]:
    """
    Returns (lat, lon) or None.
    Mapbox returns center: [lon, lat]
    """
    address = address.strip()
    if not address:
        return None

    url = MAPBOX_ENDPOINT.format(query=requests.utils.quote(address, safe=""))
    params = {
        "access_token": token,
        "limit": "1",
        "country": country,
        "types": "address,place,poi",
    }
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    data: Any = r.json()

    feats = data.get("features", [])
    if not isinstance(feats, list) or not feats:
        return None

    center = feats[0].get("center")
    if not (isinstance(center, list) and len(center) >= 2):
        return None

    lon, lat = center[0], center[1]
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        return float(lat), float(lon)
    return None


# ---------------------------
# Google Maps URL helpers
# ---------------------------

def _safe_float(s: Any) -> Optional[float]:
    if s is None:
        return None
    try:
        if pd.isna(s):
            return None
    except Exception:
        pass
    try:
        return float(str(s).strip())
    except Exception:
        return None


def google_maps_url_from_latlon(lat: Any, lon: Any) -> str:
    lat_f = _safe_float(lat)
    lon_f = _safe_float(lon)
    if lat_f is None or lon_f is None:
        return ""
    return f"https://www.google.com/maps?q={lat_f},{lon_f}"


def google_maps_url_from_address(address: str) -> str:
    address = (address or "").strip()
    if not address:
        return ""
    q = requests.utils.quote(address, safe="")
    return f"https://www.google.com/maps/search/?api=1&query={q}"


# ---------------------------
# County assignment helpers (GeoJSON polygon contains)
# ---------------------------

def assign_county_from_geojson(
    out_df: pd.DataFrame,
    *,
    lat_col: str,
    lon_col: str,
    counties_geojson: Path,
    county_name_prop: str,
    predicate: str = "within",
) -> pd.Series:
    """
    Assign county name to each row via spatial join between point coords and county polygons.

    predicate:
      - "within" (default): point strictly inside polygon
      - "intersects": more forgiving for boundary points

    Returns a Series aligned to out_df.index containing county names or "".
    """
    if counties_geojson is None or not counties_geojson.exists():
        return pd.Series([""] * len(out_df), index=out_df.index)

    lats = pd.to_numeric(out_df[lat_col], errors="coerce")
    lons = pd.to_numeric(out_df[lon_col], errors="coerce")
    valid = lats.notna() & lons.notna()

    out = pd.Series([""] * len(out_df), index=out_df.index, dtype="object")
    if valid.sum() == 0:
        return out

    pts = gpd.GeoDataFrame(
        {"__idx": out_df.index[valid]},
        geometry=[Point(xy) for xy in zip(lons[valid], lats[valid])],
        crs="EPSG:4326",
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        counties = gpd.read_file(counties_geojson)

    if counties.empty or "geometry" not in counties.columns:
        return out

    # Ensure CRS is WGS84
    if counties.crs is None:
        counties = counties.set_crs("EPSG:4326", allow_override=True)
    else:
        counties = counties.to_crs("EPSG:4326")

    if county_name_prop not in counties.columns:
        raise KeyError(
            f"County name property '{county_name_prop}' not found in counties GeoJSON columns: {list(counties.columns)}"
        )

    joined = gpd.sjoin(
        pts,
        counties[[county_name_prop, "geometry"]],
        how="left",
        predicate=predicate,  # "within" or "intersects"
    )

    for _, row in joined.iterrows():
        idx = row["__idx"]
        val = row.get(county_name_prop)
        out.at[idx] = "" if val is None else str(val).strip()

    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True, type=Path, help="Path to master_resources.csv")
    ap.add_argument("--template", required=True, type=Path, help="Path to resources.csv (defines target columns/order)")
    ap.add_argument("--out", required=True, type=Path, help="Output CSV path")
    ap.add_argument("--join", default=", ", help="Join string for multi-select options")
    ap.add_argument("--fuzzy-cutoff", type=float, default=0.80, help="Fuzzy match cutoff for direct columns")

    # ✅ Fix A: encoding safety
    ap.add_argument("--encoding", default="utf-8", help="Input encoding (utf-8, cp1252, latin1, etc.)")
    ap.add_argument("--errors", default="strict", help="Encoding errors: strict|replace|ignore")

    # ✅ Mapbox geocoding options (optional)
    ap.add_argument("--mapbox-token", default="", help="Mapbox token (if set, adds lat/long)")
    ap.add_argument("--geocode-cache", type=Path, default=None, help="JSON cache for geocoding results")
    ap.add_argument("--geocode-workers", type=int, default=16, help="Thread count for geocoding")
    ap.add_argument("--geocode-country", default="US", help="Country code filter for geocoding (e.g., US)")

    # ✅ Google Maps URL options
    ap.add_argument("--gmaps-col", default="google_maps_url", help="Output column name for Google Maps link")
    ap.add_argument(
        "--gmaps-mode",
        choices=["latlong", "address"],
        default="latlong",
        help="latlong = prefer lat/long; address = always use address search URL",
    )

    # ✅ County assignment options (defaults match your file + field)
    ap.add_argument(
        "--counties-geojson",
        type=Path,
        default=Path("data_processing/master_to_refined/inputs/california_counties.geojson"),
        help="Path to counties GeoJSON (default: california_counties.geojson)",
    )
    ap.add_argument(
        "--county-name-prop",
        default="NAME",
        help="County name property in GeoJSON (default: NAME)",
    )
    ap.add_argument(
        "--county-col",
        default="physical_county",
        help="Output column name for physical county (default: physical_county)",
    )
    ap.add_argument(
        "--county-predicate",
        choices=["within", "intersects"],
        default="within",
        help="Spatial join predicate (within is strict; intersects includes boundary points).",
    )

    args = ap.parse_args()

    if not args.master.exists():
        raise FileNotFoundError(f"Master not found: {args.master}")
    if not args.template.exists():
        raise FileNotFoundError(f"Template not found: {args.template}")
    if args.counties_geojson and not args.counties_geojson.exists():
        print(f"[WARN] Counties GeoJSON not found: {args.counties_geojson} (county assignment will be blank)")

    master = pd.read_csv(args.master, encoding=args.encoding, encoding_errors=args.errors)
    template = pd.read_csv(args.template, encoding=args.encoding, encoding_errors=args.errors)

    # Lookups for direct matches
    master_norm_to_cols: Dict[str, List[str]] = {}
    for c in master.columns:
        master_norm_to_cols.setdefault(norm_header(c), []).append(c)
    master_norm_keys = list(master_norm_to_cols.keys())

    breakout = build_breakout_map(list(master.columns))

    # Aliases for common wording/punctuation differences
    ALIASES = {
        norm_header("Date Submitted"): norm_header("Entry Date"),
        norm_header("Business Phone No"): norm_header("Business Phone No:"),
        norm_header("Phone Number"): norm_header("Phone:"),
        norm_header("(For ISP only) Do you have a low-cost home internet service offer or subsidy?"):
            norm_header("4a. Do you have a low–cost home internet service offer?"),
    }

    # ✅ Special Q10 mapping (template output col)
    RES_Q10 = "10. To which of the following are your service available?"
    MASTER_Q10_YESNO = "10. Does your entity/organization serve individuals at or below 150% of the Federal Poverty Level?"
    MASTER_Q10A_BASE = "10a. If yes, does your entity/organization serve any additional populations? Please select all that apply."

    res_q10_norm = norm_header(RES_Q10)
    master_q10_yesno_norm = norm_header(MASTER_Q10_YESNO)
    master_q10a_norm = norm_header(MASTER_Q10A_BASE)

    # Q8 Virtually trigger
    VIRTUAL_COL = "8. How does your entity/organization provide its services? Select all that apply.: Virtually"

    # Address sources in master
    PHYS_ADDR1 = "What is the physical location address where your entity/organization provides in-person services?: Address Line 1"
    PHYS_ADDR2 = "What is the physical location address where your entity/organization provides in-person services?: Address Line 2"
    PHYS_CITY  = "What is the physical location address where your entity/organization provides in-person services?: City"
    PHYS_STATE = "What is the physical location address where your entity/organization provides in-person services?: State"
    PHYS_ZIP   = "What is the physical location address where your entity/organization provides in-person services?: Zip/Postal Code"

    ORG_IN_ADDR1 = "Organization Address:: Address Line 1"
    ORG_IN_ADDR2 = "Organization Address:: Address Line 2"
    ORG_IN_CITY  = "Organization Address:: City"
    ORG_IN_STATE = "Organization Address:: State"
    ORG_IN_ZIP   = "Organization Address:: Zip/Postal Code"

    phys_cols = [PHYS_ADDR1, PHYS_ADDR2, PHYS_CITY, PHYS_STATE, PHYS_ZIP]

    # Address targets in output (resources-style)
    ORG_OUT_ADDR1 = "Organization Address: Address Line 1"
    ORG_OUT_ADDR2 = "Organization Address: Address Line 2"
    ORG_OUT_CITY  = "Organization Address: City"
    ORG_OUT_STATE = "Organization Address: State"
    ORG_OUT_ZIP   = "Organization Address: Zip/Postal Code"

    # --- Main mapping: build all output columns from template ---
    out_df = pd.DataFrame(index=master.index)
    unmatched: List[str] = []

    for target_col in template.columns:
        tnorm = norm_header(target_col)

        # ✅ Q10 special case
        if tnorm == res_q10_norm:
            yesno_src_col = master_norm_to_cols.get(master_q10_yesno_norm, [None])[0]
            q10a_cols_opts = breakout.get(master_q10a_norm, [])
            q10a_joined = (
                combine_breakout(master, q10a_cols_opts, args.join)
                if q10a_cols_opts
                else pd.Series([""] * len(master), index=master.index)
            )

            def build_q10_value(i: int) -> str:
                opts = q10a_joined.iat[i]
                v_yesno = master.at[i, yesno_src_col] if yesno_src_col else None
                if is_no(v_yesno):
                    return "No"
                if is_yes(v_yesno):
                    return "Yes" + (args.join + opts if isinstance(opts, str) and opts.strip() else "")
                if isinstance(opts, str) and opts.strip():
                    return "Yes" + args.join + opts
                return ""

            out_df[target_col] = [build_q10_value(i) for i in range(len(master))]
            continue

        # Alias mapping
        if tnorm in ALIASES and ALIASES[tnorm] in master_norm_to_cols:
            src = master_norm_to_cols[ALIASES[tnorm]][0]
            out_df[target_col] = master[src]
            continue

        # Direct match
        if tnorm in master_norm_to_cols:
            src = master_norm_to_cols[tnorm][0]
            out_df[target_col] = master[src]
            continue

        # Breakout combine
        if tnorm in breakout:
            out_df[target_col] = combine_breakout(master, breakout[tnorm], args.join)
            continue

        # Fuzzy match
        best_norm, _ = best_fuzzy_match(tnorm, master_norm_keys, cutoff=args.fuzzy_cutoff)
        if best_norm is not None:
            src = master_norm_to_cols[best_norm][0]
            out_df[target_col] = master[src]
            continue

        out_df[target_col] = ""
        unmatched.append(target_col)

    # --- Apply updated address resolution into OUTPUT org address fields ---
    resolved = None
    need_addr = any(
        c in out_df.columns for c in [ORG_OUT_ADDR1, ORG_OUT_ADDR2, ORG_OUT_CITY, ORG_OUT_STATE, ORG_OUT_ZIP]
    )
    if need_addr:
        def resolve_addr(row: pd.Series) -> Tuple[str, str, str, str, str]:
            if VIRTUAL_COL in row.index and is_selected(row[VIRTUAL_COL]):
                return ("Virtual", "", "", "", "")
            if row_has_any(row, phys_cols):
                return (
                    row.get(PHYS_ADDR1, ""),
                    row.get(PHYS_ADDR2, ""),
                    row.get(PHYS_CITY, ""),
                    row.get(PHYS_STATE, ""),
                    row.get(PHYS_ZIP, ""),
                )
            return (
                row.get(ORG_IN_ADDR1, ""),
                row.get(ORG_IN_ADDR2, ""),
                row.get(ORG_IN_CITY, ""),
                row.get(ORG_IN_STATE, ""),
                row.get(ORG_IN_ZIP, ""),
            )

        resolved = master.apply(resolve_addr, axis=1, result_type="expand")
        resolved.columns = ["_a1", "_a2", "_city", "_state", "_zip"]

        if ORG_OUT_ADDR1 in out_df.columns:
            out_df[ORG_OUT_ADDR1] = resolved["_a1"]
        if ORG_OUT_ADDR2 in out_df.columns:
            out_df[ORG_OUT_ADDR2] = resolved["_a2"]
        if ORG_OUT_CITY in out_df.columns:
            out_df[ORG_OUT_CITY] = resolved["_city"]
        if ORG_OUT_STATE in out_df.columns:
            out_df[ORG_OUT_STATE] = resolved["_state"]
        if ORG_OUT_ZIP in out_df.columns:
            out_df[ORG_OUT_ZIP] = resolved["_zip"]

    # --- Geocode (optional) ---
    out_df["lat"] = ""
    out_df["long"] = ""

    addr_series = pd.Series([""] * len(out_df), index=out_df.index)
    if resolved is not None:
        addr_series = resolved.apply(
            lambda r: format_address_for_geocode(r["_a1"], r["_a2"], r["_city"], r["_state"], r["_zip"]),
            axis=1,
        ).fillna("")
        is_virtual = addr_series.str.strip().str.lower().eq("virtual")
        addr_series = addr_series.where(~is_virtual, "")

    if args.mapbox_token and resolved is not None:
        cache = _load_json_cache(args.geocode_cache)

        unique_addrs = sorted({a.strip() for a in addr_series.tolist() if a and a.strip()})
        to_geocode = [a for a in unique_addrs if a not in cache]

        print(f"[INFO] Geocoding unique addresses: {len(unique_addrs):,}")
        print(f"[INFO] Cache hits: {len(unique_addrs) - len(to_geocode):,}")
        print(f"[INFO] Cache misses: {len(to_geocode):,} (workers={args.geocode_workers})")

        def worker(addr: str) -> Tuple[str, Optional[Tuple[float, float]]]:
            try:
                res = geocode_address_mapbox(addr, args.mapbox_token, country=args.geocode_country)
                return addr, res
            except Exception:
                return addr, None

        if to_geocode:
            done = 0
            with ThreadPoolExecutor(max_workers=max(1, args.geocode_workers)) as ex:
                futures = [ex.submit(worker, a) for a in to_geocode]
                for fut in as_completed(futures):
                    addr, res = fut.result()
                    if res is not None:
                        lat, lon = res
                        cache[addr] = {"lat": float(lat), "long": float(lon)}
                    else:
                        cache[addr] = {"lat": None, "long": None}

                    done += 1
                    if args.geocode_cache and done % 50 == 0:
                        _save_json_cache(args.geocode_cache, cache)
                        print(f"[INFO] Geocoded {done:,}/{len(to_geocode):,}")

            _save_json_cache(args.geocode_cache, cache)

        def get_lat(addr: str) -> str:
            v = cache.get(addr)
            return "" if not v or v.get("lat") is None else str(v["lat"])

        def get_lon(addr: str) -> str:
            v = cache.get(addr)
            return "" if not v or v.get("long") is None else str(v["long"])

        out_df["lat"] = addr_series.map(lambda a: get_lat(a.strip()) if isinstance(a, str) else "")
        out_df["long"] = addr_series.map(lambda a: get_lon(a.strip()) if isinstance(a, str) else "")

    # --- Google Maps URL column ---
    out_df[args.gmaps_col] = ""
    if args.gmaps_mode == "address":
        out_df[args.gmaps_col] = addr_series.map(
            lambda a: google_maps_url_from_address(a) if isinstance(a, str) else ""
        )
    else:
        latlon_urls = [
            google_maps_url_from_latlon(out_df.at[i, "lat"], out_df.at[i, "long"])
            for i in out_df.index
        ]
        addr_urls = addr_series.map(
            lambda a: google_maps_url_from_address(a) if isinstance(a, str) else ""
        ).tolist()
        out_df[args.gmaps_col] = [
            latlon_urls[i] if latlon_urls[i] else addr_urls[i]
            for i in range(len(out_df))
        ]

    # ✅ NEW: Assign physical county from GeoJSON (NAME) using lat/long
    if args.counties_geojson and args.counties_geojson.exists():
        out_df[args.county_col] = assign_county_from_geojson(
            out_df,
            lat_col="lat",
            lon_col="long",
            counties_geojson=args.counties_geojson,
            county_name_prop=args.county_name_prop,  # NAME
            predicate=args.county_predicate,         # within (default) or intersects
        )
        print(f"[OK] Assigned physical county -> column '{args.county_col}' using {args.counties_geojson}")
    else:
        out_df[args.county_col] = ""
        print("[WARN] Counties GeoJSON missing; physical county column left blank.")

    # Write output
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(args.out, index=False)

    print(f"[OK] Wrote: {args.out}")
    print(f"[INFO] Rows: {len(out_df):,}")
    print(f"[INFO] Columns: {out_df.shape[1]:,}")

    if unmatched:
        print(f"[WARN] Unmatched template columns filled as blank ({len(unmatched)}): {len(unmatched)}")
        for c in unmatched:
            print(f"  - {c}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FAIL] {e}", file=sys.stderr)
        sys.exit(1)
