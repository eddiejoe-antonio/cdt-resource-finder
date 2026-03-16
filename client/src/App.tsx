import ResourceFinder from "./components/ResourceFinder";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <>
      <ResourceFinder />
      <Analytics />
    </>
  );
}