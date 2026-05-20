import { mkdir, copyFile } from "node:fs/promises";
import { getErrorMessage } from "./error-utils.mjs";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await mkdir(dist, { recursive: true });

await Promise.all([
  copyFile(new URL("index.html", root), new URL("index.html", dist)),
  copyFile(new URL("registry.csv", root), new URL("registry.csv", dist)).catch(
    (error) => {
      const message = getErrorMessage(error);
      console.warn(`Skipping optional registry.csv copy: ${message}`);
    },
  ),
  copyFile(
    new URL("profile-registry-triples.nq", root),
    new URL("profile-registry-triples.nq", dist),
  ).catch(
    (error) => {
      const message = getErrorMessage(error);
      console.warn(`Skipping optional profile-registry-triples.nq copy: ${message}`);
    },
  ),
  copyFile(new URL("all_profiles_quads.nq", root), new URL("all_profiles_quads.nq", dist)).catch(
    (error) => {
      const message = getErrorMessage(error);
      console.warn(`Skipping optional all_profiles_quads.nq copy: ${message}`);
    },
  ),
  copyFile(new URL("conventions.MD", root), new URL("conventions.MD", dist)),
]);

console.log("Build complete: dist/ generated with site and registry assets.");
