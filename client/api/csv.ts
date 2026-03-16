import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const upstream = await fetch(
    "https://broadbandforall.cdt.ca.gov/wp-content/uploads/sites/19/2026/03/converted.csv"
  );
  const body = await upstream.text();
  res.setHeader("Content-Type", "text/csv");
  res.send(body);
}