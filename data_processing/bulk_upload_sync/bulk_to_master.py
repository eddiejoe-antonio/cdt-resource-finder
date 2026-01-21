#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Convert bulk_uploads.csv into the column format of master.csv.

- Outputs a CSV with EXACT columns/order as master.csv.
- Fills what it can from bulk:
  * Direct matches + aliases + fuzzy matches
  * Multi-select "lists in one cell" -> master breakout columns ("Question: Option")
  * Special mapping: "In-Person or Virtual Services" -> Q8 breakouts Virtually / In-Person
  * Address components -> Organization Address:: fields

Usage:
  python bulk_to_master.py \
    --bulk /mnt/data/bulk_uploads.csv \
    --master_template /mnt/data/master.csv \
    --out /mnt/data/bulk_as_master.csv
"""

from __future__ import annotations

import argparse
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd


FALSEY = {"", "0", "false", "no", "n", "none", "null", "nan", "unchecked", "not selected", "off"}
TRUTHY = {"yes", "y", "true", "1", "checked", "on"}


# ----------------- Normalization helpers -----------------

def norm_header(s: str) -> str:
    s = "" if s is None else str(s)
    s = s.replace("\xa0", " ").replace("\t", " ")
    s = re.sub(r"\s+", " ", s).strip()

    # normalize master-style "::" and trailing ":" variations
    s = s.replace("::", ":")
    s = re.sub(r":\s*$", "", s)

    # remove ellipses artifacts and unicode quotes/dashes differences lightly
    s = s.replace("...", "").replace("…", "")
    s = s.replace("’", "'").replace("–", "-").replace("—", "-")

    return s.lower()


def is_blank(v) -> bool:
    if v is None:
        return True
    try:
        if pd.isna(v):
            return True
    except Exception:
        pass
    return str(v).strip() == ""


def is_selected(v) -> bool:
    """Interpret checkbox-ish values as selected/unselected."""
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


def best_fuzzy_match(target_norm: str, candidate_norms: List[str], cutoff: float = 0.78) -> Optional[str]:
    best = None
    best_score = 0.0
    for cand in candidate_norms:
        score = SequenceMatcher(None, target_norm, cand).ratio()
        if score > best_score:
            best_score = score
            best = cand
    return best if best_score >= cutoff else None


def parse_multi_select_cell(v) -> List[str]:
    """
    Bulk uploads often stores multi-selects as a single cell:
      - comma-separated
      - semicolon-separated
      - newline-separated
      - pipe-separated
    Return normalized tokens for matching.
    """
    if v is None:
        return []
    try:
        if pd.isna(v):
            return []
    except Exception:
        pass

    s = str(v).strip()
    if not s:
        return []

    # split on common delimiters
    parts = re.split(r"[,\n;|]+", s)
    tokens = []
    for p in parts:
        t = p.strip()
        if t:
            tokens.append(t)
    return tokens


def token_set(v) -> set[str]:
    return {t.strip().lower() for t in parse_multi_select_cell(v) if t.strip()}


# ----------------- Breakout detection -----------------

def is_breakout_col(col: str) -> bool:
    """
    Master breakout columns look like:
      "6.\tPlease indicate all the counties...: Alameda"
      "8. How does your entity...: Virtually"
    """
    if ": " not in col:
        return False
    left, _ = col.rsplit(": ", 1)
    left = left.strip()
    # starts with a question number like "6." or "10a."
    return bool(re.match(r"^\s*\d+[a-z]?\.", left, flags=re.IGNORECASE))


def breakout_base_and_option(col: str) -> Tuple[str, str]:
    left, opt = col.rsplit(": ", 1)
    return norm_header(left), opt.strip()


# ----------------- Main conversion -----------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bulk", required=True, type=Path, help="Path to bulk_uploads.csv")
    ap.add_argument("--master_template", required=True, type=Path, help="Path to master.csv (defines target columns/order)")
    ap.add_argument("--out", required=True, type=Path, help="Output CSV path")
    ap.add_argument("--encoding", default="latin1", help="CSV encoding to use (default: latin1)")
    ap.add_argument("--fuzzy_cutoff", type=float, default=0.78, help="Fuzzy match cutoff (default: 0.78)")
    args = ap.parse_args()

    if not args.bulk.exists():
        raise FileNotFoundError(f"Bulk not found: {args.bulk}")
    if not args.master_template.exists():
        raise FileNotFoundError(f"Master template not found: {args.master_template}")

    bulk = pd.read_csv(args.bulk, encoding=args.encoding)
    master_template = pd.read_csv(args.master_template, encoding=args.encoding)

    # Drop unnamed junk columns from bulk (keep real ones)
    bulk = bulk.loc[:, [c for c in bulk.columns if not str(c).startswith("Unnamed:")]]

    # Build lookup: normalized bulk header -> actual col
    bulk_norm_to_col: Dict[str, str] = {}
    for c in bulk.columns:
        bulk_norm_to_col[norm_header(c)] = c
    bulk_norm_keys = list(bulk_norm_to_col.keys())

    # Build lookup: normalized master header -> actual col (template)
    master_cols = list(master_template.columns)

    # Helpful aliases (bulk -> master-ish)
    # (We key by master normalized name and store bulk normalized name(s) to try)
    ALIASES_MASTER_TO_BULK: Dict[str, List[str]] = {
        norm_header("Name of Organization:"): [norm_header("Name of Organization")],
        norm_header("Webpage:"): [norm_header("Webpage")],
        norm_header("Business Phone No:"): [norm_header("Business Phone Number")],
        norm_header("Business Email Address:"): [norm_header("Business Email Address")],
        norm_header("Name of Point of Contact:"): [norm_header("Name of Point of Contact")],
        norm_header("Position/Title:"): [norm_header("Position/Title")],

        # Bulk has these broken into separate fields, master has components:
        norm_header("Organization Address: Address Line 1"): [norm_header("Organization Address")],
        norm_header("Organization Address: City"): [norm_header("Organization City")],
        norm_header("Organization Address: State"): [norm_header("Organization State (Drop-down options)")],
        norm_header("Organization Address: Zip/Postal Code"): [norm_header("Organization Zip/Postal Code")],

        # Master uses "::" style inputs
        norm_header("Organization Address:: Address Line 1"): [norm_header("Organization Address")],
        norm_header("Organization Address:: City"): [norm_header("Organization City")],
        norm_header("Organization Address:: State"): [norm_header("Organization State (Drop-down options)")],
        norm_header("Organization Address:: Zip/Postal Code"): [norm_header("Organization Zip/Postal Code")],

        # Service area
        norm_header("5. What is your entity/organization's service area?"): [
            norm_header("What is your entity/organization's service area? (Drop-down options)"),
            norm_header("What is your entity/organization's service area?"),
        ],

        # Poverty yes/no
        norm_header("10. Does your entity/organization serve individuals at or below 150% of the Federal Poverty Level?"): [
            norm_header("Does your entity/organization serve individuals at or below 150% of the Federal Poverty Level? (Drop-down options)"),
            norm_header("Does your entity/organization serve individuals at or below 150% of the Federal Poverty Level?"),
        ],

        # Charge for services (bulk has two similarly-named columns; map separately below)
        norm_header("9. Does your entity/organization charge for its services?"): [
            norm_header("Does your entity/organization charge for its services? (Drop-down options)"),
            norm_header("Does your entity/organization charge for its services?"),
        ],
        norm_header("13. Does your entity/organization charge for its services?"): [
            norm_header("Does your entity/organization charge for its services? (Drop-down options).1"),
        ],
    }

    # Build a fast per-question mapping for breakout bases:
    # For any master breakout base, find the best matching bulk column (combined list).
    breakout_bases = sorted({breakout_base_and_option(c)[0] for c in master_cols if is_breakout_col(c)})

    base_to_bulk_col: Dict[str, Optional[str]] = {}
    for base_norm in breakout_bases:
        # exact match first
        if base_norm in bulk_norm_to_col:
            base_to_bulk_col[base_norm] = bulk_norm_to_col[base_norm]
            continue
        # else fuzzy match
        best = best_fuzzy_match(base_norm, bulk_norm_keys, cutoff=args.fuzzy_cutoff)
        base_to_bulk_col[base_norm] = bulk_norm_to_col[best] if best else None

    # Build output with exact template columns
    out = pd.DataFrame(index=bulk.index, columns=master_cols)
    out[:] = ""  # default blanks

    # Precompute token sets for any bulk columns we’ll use as multi-select sources
    multi_token_cache: Dict[str, List[set[str]]] = {}

    def get_tokens_for_bulk_col(colname: str) -> List[set[str]]:
        if colname not in multi_token_cache:
            multi_token_cache[colname] = [token_set(v) for v in bulk[colname]]
        return multi_token_cache[colname]

    # Special: map bulk "In-Person or Virtual Services" -> master Q8 breakouts
    bulk_inperson_virtual_col = None
    for cand in [
        "In-Person or Virtual Services\n(Drop-down options)",
        "In-Person or Virtual Services (Drop-down options)",
        "In-Person or Virtual Services",
    ]:
        key = norm_header(cand)
        if key in bulk_norm_to_col:
            bulk_inperson_virtual_col = bulk_norm_to_col[key]
            break

    # Identify the two master Q8 breakout columns (if present)
    master_q8_virtual = None
    master_q8_inperson = None
    for c in master_cols:
        if norm_header(c) == norm_header("8. How does your entity/organization provide its services? Select all that apply.: Virtually"):
            master_q8_virtual = c
        if norm_header(c) == norm_header("8. How does your entity/organization provide its services? Select all that apply.: In-Person"):
            master_q8_inperson = c

    # Main fill loop
    for mcol in master_cols:
        mnorm = norm_header(mcol)

        # 1) Handle Q8 special mapping
        if bulk_inperson_virtual_col and (mcol == master_q8_virtual or mcol == master_q8_inperson):
            vals = bulk[bulk_inperson_virtual_col].fillna("").astype(str)
            if mcol == master_q8_virtual:
                out[mcol] = vals.apply(lambda s: "Virtually" if "virtual" in s.lower() else "")
            else:
                out[mcol] = vals.apply(lambda s: "In-Person" if "in" in s.lower() and "person" in s.lower() else "")
            continue

        # 2) Breakout columns: set selected if option is in the bulk combined list
        if is_breakout_col(mcol):
            base_norm, option = breakout_base_and_option(mcol)
            src_bulk_col = base_to_bulk_col.get(base_norm)

            if src_bulk_col:
                tokens_per_row = get_tokens_for_bulk_col(src_bulk_col)
                opt_key = option.strip().lower()
                # Mark selected with the option label (SurveyMonkey-style exports typically store the option text)
                out[mcol] = [
                    option if (opt_key in tokens_per_row[i]) else ""
                    for i in range(len(bulk))
                ]
            continue

        # 3) Alias mapping (master->bulk)
        if mnorm in ALIASES_MASTER_TO_BULK:
            filled = False
            for bulk_norm in ALIASES_MASTER_TO_BULK[mnorm]:
                if bulk_norm in bulk_norm_to_col:
                    out[mcol] = bulk[bulk_norm_to_col[bulk_norm]]
                    filled = True
                    break
            if filled:
                continue

        # 4) Direct normalized match
        if mnorm in bulk_norm_to_col:
            out[mcol] = bulk[bulk_norm_to_col[mnorm]]
            continue

        # 5) Fuzzy match (last resort)
        best = best_fuzzy_match(mnorm, bulk_norm_keys, cutoff=args.fuzzy_cutoff)
        if best:
            out[mcol] = bulk[bulk_norm_to_col[best]]
            continue

        # else: leave blank

    # Address cleanup: master has Address Line 1/2/etc; bulk has no Address Line 2
    # Ensure Line 2 stays blank if present
    for line2_col in [c for c in master_cols if norm_header(c) in {norm_header("Organization Address:: Address Line 2")}]:
        out[line2_col] = ""

    # Write
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False, encoding="utf-8")

    print(f"[OK] Wrote: {args.out}")
    print(f"[INFO] Bulk rows: {len(bulk):,}")
    print(f"[INFO] Output columns (master template): {len(master_cols):,}")
    print(f"[INFO] Output rows: {len(out):,}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FAIL] {e}", file=sys.stderr)
        sys.exit(1)
