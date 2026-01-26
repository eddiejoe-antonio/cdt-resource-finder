#!/usr/bin/env python3
from pathlib import Path
import pandas as pd

INPUT  = Path("Master DE Resource Finder Data 1.20.26.xlsx")   # change if needed
OUTPUT = Path("master_12126_statewide_counties_filled.xlsx")

SERVICE_AREA_COL = "5. What is your entity/organization’s service area?"
COUNTY_PREFIX = "6.\tPlease indicate all the counties in which you provide services.:"

# Read Excel as strings (important)
df = pd.read_excel(INPUT, dtype=str).fillna("")

# Identify county columns
county_cols = [c for c in df.columns if c.startswith(COUNTY_PREFIX)]
if not county_cols:
    raise ValueError(f"No county columns found starting with prefix: {COUNTY_PREFIX!r}")

# Extract county name from column header
def county_name_from_col(col: str) -> str:
    return col[len(COUNTY_PREFIX):].strip()

county_map = {col: county_name_from_col(col) for col in county_cols}

# Identify Statewide rows (case-insensitive)
statewide_mask = df[SERVICE_AREA_COL].str.strip().str.lower() == "statewide"

# Fill ONLY blanks for Statewide rows
for col, cname in county_map.items():
    blank_mask = statewide_mask & (df[col].str.strip() == "")
    df.loc[blank_mask, col] = cname

# Save result
df.to_excel(OUTPUT, index=False)

print(f"Done. Wrote: {OUTPUT}")
print(f"Statewide rows: {int(statewide_mask.sum())}")
print(f"County columns processed: {len(county_cols)}")
