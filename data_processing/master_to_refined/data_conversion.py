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

Usage:
  python data_conversion.py \
    --master inputs/master_120.csv \
    --template inputs/resources.csv \
    --out outputs/converted.csv \
    --encoding cp1252
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
        picked = []
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
    args = ap.parse_args()

    if not args.master.exists():
        raise FileNotFoundError(f"Master not found: {args.master}")
    if not args.template.exists():
        raise FileNotFoundError(f"Template not found: {args.template}")

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

        # ✅ Your unmatched ISP question -> map to master 4a (note low–cost en dash in master)
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
    org_in_cols = [ORG_IN_ADDR1, ORG_IN_ADDR2, ORG_IN_CITY, ORG_IN_STATE, ORG_IN_ZIP]

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

        # ✅ Suffix fallback (handles Phone Number.1..4, etc.)
        cleaned_target = re.sub(r"\.\.(\d+)$", r".\1", target_col.strip())
        m = re.match(r"^(.*)\.(\d+)$", cleaned_target)
        if m:
            base_col = m.group(1).strip()
            base_norm = norm_header(base_col)

            # If base has an alias, use it
            if base_norm in ALIASES:
                aliased = ALIASES[base_norm]
                if aliased in master_norm_to_cols:
                    src = master_norm_to_cols[aliased][0]
                    out_df[target_col] = master[src]
                    continue

            # base direct
            if base_norm in master_norm_to_cols:
                src = master_norm_to_cols[base_norm][0]
                out_df[target_col] = master[src]
                continue

            # base breakout
            if base_norm in breakout:
                out_df[target_col] = combine_breakout(master, breakout[base_norm], args.join)
                continue

            # ✅ extra phone-specific fallback:
            # If the template wants Phone Number.1.. but base doesn’t exist,
            # use master Phone: then Business Phone No:
            if base_norm == norm_header("Phone Number"):
                phone_src = None
                if norm_header("Phone:") in master_norm_to_cols:
                    phone_src = master_norm_to_cols[norm_header("Phone:")][0]
                elif norm_header("Business Phone No:") in master_norm_to_cols:
                    phone_src = master_norm_to_cols[norm_header("Business Phone No:")][0]

                if phone_src is not None:
                    out_df[target_col] = master[phone_src]
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
    need_addr = any(c in out_df.columns for c in [ORG_OUT_ADDR1, ORG_OUT_ADDR2, ORG_OUT_CITY, ORG_OUT_STATE, ORG_OUT_ZIP])
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

    # --- Populate "Type of organization" in output from master answers ---
    type_out_col = find_output_col(
        out_df,
        "Type of organization",
        "Type of Organization",
        "Type of organisation",
        "Type of Organisation",
    )

    SRC_BUSINESS_EMAIL = "Business Email Address:"
    SRC_CAI = "Community Anchor Institution"
    SRC_GOV = "Government or Public Organization"
    SRC_PRIVATE = "Private Sector and Non-Governmental Organizations"

    def nonblank(v) -> bool:
        if v is None:
            return False
        try:
            if pd.isna(v):
                return False
        except Exception:
            pass
        return str(v).strip() != ""

    def looks_like_email(v) -> bool:
        if not nonblank(v):
            return False
        s = str(v).strip()
        return "@" in s and "." in s.split("@")[-1]

    if type_out_col is not None:
        def build_type(row: pd.Series) -> str:
            parts: List[str] = []

            if SRC_BUSINESS_EMAIL in row.index and looks_like_email(row[SRC_BUSINESS_EMAIL]):
                parts.append("Business")

            if SRC_CAI in row.index and nonblank(row[SRC_CAI]):
                parts.append("Community Anchor Institution")

            if SRC_GOV in row.index and nonblank(row[SRC_GOV]):
                parts.append("Government or Public Organization")

            if SRC_PRIVATE in row.index and nonblank(row[SRC_PRIVATE]):
                parts.append("Private Sector and Non-Governmental Organizations")

            return ", ".join(parts)

        out_df[type_out_col] = master.apply(build_type, axis=1)

    # Write output
    args.out.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(args.out, index=False)

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
