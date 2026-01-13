#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Convert master_resources.csv (wide breakout columns per option) into the same
column format as resources.csv (single column per question, multi-select joined).

Special handling:
- Excel-style suffix columns like "Phone Number.1" fall back to base "Phone Number".
- Q10 mapping:
    resources: "10. To which of the following are your service available?"
    master:    "10. Does your entity/organization serve individuals at or below 150% of the Federal Poverty Level?"
              + "10a. If yes, does your entity/organization serve any additional populations? Please select all that apply.: <Option>"
  Output: "Yes, <opt1>, <opt2>..." (or "No")

Usage:
  python data_conversion.py \
    --master inputs/master_resources.csv \
    --template inputs/resources.csv \
    --out outputs/converted.csv
"""

from __future__ import annotations

import argparse
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import pandas as pd


FALSEY = {
    "", "0", "false", "no", "n", "none", "null", "nan",
    "unchecked", "not selected", "off"
}

TRUTHY = {"yes", "y", "true", "1", "checked", "on"}


def norm_header(s: str) -> str:
    """Normalize headers to improve matching across exports."""
    s = "" if s is None else str(s)
    s = s.replace("\xa0", " ").replace("\t", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("::", ":")
    s = re.sub(r":\s*$", "", s)  # trailing colon
    s = s.replace("...", "").replace("…", "")
    return s.lower()


def is_selected(v) -> bool:
    """Heuristic: treat non-empty, non-falsey strings / non-zero as selected."""
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
    """Detect 'Yes' from typical survey exports."""
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
    # sometimes exports use "Yes - ..." or similar
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


def best_fuzzy_match(target_norm: str, candidate_norms: List[str], cutoff: float = 0.80) -> Tuple[Optional[str], float]:
    """Return best candidate norm string and similarity score if above cutoff."""
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


def build_breakout_map(master_cols: List[str]) -> Dict[str, List[Tuple[str, str]]]:
    """
    Map:
      normalized_base_question -> [(original_master_col, option_text), ...]
    for columns that look like "12. ...?: Option" or "10a. ...: Option"
    """
    breakout: Dict[str, List[Tuple[str, str]]] = {}
    for c in master_cols:
        if ": " not in c:
            continue
        left, right = c.rsplit(": ", 1)
        # treat question stems that begin with e.g. "10." or "10a."
        if re.match(r"^\s*\d+[a-z]?\.", left.strip(), flags=re.IGNORECASE):
            base = norm_header(left)
            opt = right.strip()
            breakout.setdefault(base, []).append((c, opt))
    return breakout


def combine_breakout(master_df: pd.DataFrame, cols_opts: List[Tuple[str, str]], joiner: str) -> pd.Series:
    """Combine breakout option columns into one joined string column."""
    def combine_row(row) -> str:
        picked = []
        for col, opt in cols_opts:
            if is_selected(row.get(col)):
                picked.append(opt)
        return joiner.join(picked) if picked else ""
    return master_df.apply(combine_row, axis=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True, type=Path, help="Path to master_resources.csv")
    ap.add_argument("--template", required=True, type=Path, help="Path to resources.csv (defines target columns/order)")
    ap.add_argument("--out", required=True, type=Path, help="Output CSV path")
    ap.add_argument("--join", default=", ", help="Join string for multi-select options (default: ', ')")
    ap.add_argument("--fuzzy-cutoff", type=float, default=0.80, help="Fuzzy match cutoff for direct columns")
    args = ap.parse_args()

    if not args.master.exists():
        raise FileNotFoundError(f"Master not found: {args.master}")
    if not args.template.exists():
        raise FileNotFoundError(f"Template not found: {args.template}")

    master = pd.read_csv(args.master)
    template = pd.read_csv(args.template)

    # Build direct header lookup
    master_norm_to_cols: Dict[str, List[str]] = {}
    for c in master.columns:
        master_norm_to_cols.setdefault(norm_header(c), []).append(c)
    master_norm_keys = list(master_norm_to_cols.keys())

    # Build breakout map (multi-select option columns)
    breakout = build_breakout_map(list(master.columns))

    # Aliases for common wording/punctuation differences
    ALIASES = {
        norm_header("Date Submitted"): norm_header("Entry Date"),

        # phone punctuation differences
        norm_header("Business Phone No"): norm_header("Business Phone No:"),
        norm_header("Phone Number"): norm_header("Phone:"),

        # ISP question wording/version differences
        norm_header("(For ISP only) Do you have a low-cost home internet service offer or subsidy?"):
            norm_header("4a. Do you have a low–cost home internet service offer?"),
    }

    # Special Q10 mapping (resources -> master)
    RES_Q10 = "10. To which of the following are your service available?"
    MASTER_Q10_YESNO = "10. Does your entity/organization serve individuals at or below 150% of the Federal Poverty Level?"
    MASTER_Q10A_BASE = "10a. If yes, does your entity/organization serve any additional populations? Please select all that apply."

    res_q10_norm = norm_header(RES_Q10)
    master_q10_yesno_norm = norm_header(MASTER_Q10_YESNO)
    master_q10a_norm = norm_header(MASTER_Q10A_BASE)

    out_df = pd.DataFrame(index=master.index)
    unmatched: List[str] = []

    for target_col in template.columns:
        tnorm = norm_header(target_col)

        # ------------------ SPECIAL CASE: RESOURCES Q10 ------------------
        if tnorm == res_q10_norm:
            # yes/no source column (if present)
            yesno_src_col = None
            if master_q10_yesno_norm in master_norm_to_cols:
                yesno_src_col = master_norm_to_cols[master_q10_yesno_norm][0]

            # 10a options (if present)
            q10a_cols_opts = breakout.get(master_q10a_norm, [])
            q10a_joined = combine_breakout(master, q10a_cols_opts, args.join) if q10a_cols_opts else pd.Series([""] * len(master), index=master.index)

            def build_q10_value(i: int) -> str:
                opts = q10a_joined.iat[i]
                v_yesno = master.at[i, yesno_src_col] if yesno_src_col else None

                # If explicitly "No" => "No"
                if is_no(v_yesno):
                    return "No"

                # If explicitly yes => "Yes" + opts
                if is_yes(v_yesno):
                    return "Yes" + (args.join + opts if opts else "")

                # If blank/unknown but options selected => treat as Yes
                if isinstance(opts, str) and opts.strip():
                    return "Yes" + args.join + opts

                # Otherwise blank
                return ""

            out_df[target_col] = [build_q10_value(i) for i in range(len(master))]
            continue
        # ---------------------------------------------------------------

        # 1) Alias mapping
        if tnorm in ALIASES and ALIASES[tnorm] in master_norm_to_cols:
            src = master_norm_to_cols[ALIASES[tnorm]][0]
            out_df[target_col] = master[src]
            continue

        # 2) Direct normalized header match
        if tnorm in master_norm_to_cols:
            src = master_norm_to_cols[tnorm][0]
            out_df[target_col] = master[src]
            continue

        # 3) Multi-select breakout combine (exact base question match)
        if tnorm in breakout:
            out_df[target_col] = combine_breakout(master, breakout[tnorm], args.join)
            continue

        # 3.5) Handle suffix columns like "Phone Number.1"
        m = re.match(r"^(.*)\.(\d+)$", target_col.strip())
        if m:
            base_col = m.group(1).strip()
            base_norm = norm_header(base_col)

            # try alias on the base name first
            if base_norm in ALIASES:
                aliased = ALIASES[base_norm]
                if aliased in master_norm_to_cols:
                    src = master_norm_to_cols[aliased][0]
                    out_df[target_col] = master[src]
                    continue

            # try direct match for base
            if base_norm in master_norm_to_cols:
                src = master_norm_to_cols[base_norm][0]
                out_df[target_col] = master[src]
                continue

            # try breakout combine for base
            if base_norm in breakout:
                out_df[target_col] = combine_breakout(master, breakout[base_norm], args.join)
                continue

        # 4) Fuzzy match to a single master column (handles minor punctuation differences)
        best_norm, score = best_fuzzy_match(tnorm, master_norm_keys, cutoff=args.fuzzy_cutoff)
        if best_norm is not None:
            src = master_norm_to_cols[best_norm][0]
            out_df[target_col] = master[src]
            continue

        # 5) If no match, create blank column
        out_df[target_col] = ""
        unmatched.append(target_col)

    # Write output
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(args.out, index=False)

    # Console summary
    print(f"[OK] Wrote: {args.out}")
    print(f"[INFO] Rows: {len(out_df):,}")
    print(f"[INFO] Columns (template): {out_df.shape[1]:,}")
    if unmatched:
        print(f"[WARN] Unmatched template columns filled as blank ({len(unmatched)}):")
        for c in unmatched:
            print(f"  - {c}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[FAIL] {e}", file=sys.stderr)
        sys.exit(1)
