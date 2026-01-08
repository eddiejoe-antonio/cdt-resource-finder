import React, { useEffect, useMemo, useState } from "react";
import { fetchResourcesLocal } from "./utils/fetchResources";
import type { Resource } from "./types/resourceTypes";
import { ResourceCard } from "./components/ResourceCard";
import ResourceFinder from "./components/ResourceFinder";

export default function App() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    fetchResourcesLocal()
      .then((data) => setResources(data))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const count = useMemo(() => resources.length, [resources]);

  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-700">Error: {err}</div>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold">Resource Finder</h1>
      <div className="opacity-80 mt-1">{count.toLocaleString()} resources</div>
      <ResourceFinder />
    </div>
  );
}
