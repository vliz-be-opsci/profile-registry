import { mkdir, copyFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await mkdir(dist, { recursive: true });

await Promise.all([
  copyFile(new URL("index.html", root), new URL("index.html", dist)),
  copyFile(new URL("registry.csv", root), new URL("registry.csv", dist)),
  copyFile(
    new URL("profile-registry-triples.nq", root),
    new URL("profile-registry-triples.nq", dist),
  ),
  copyFile(new URL("conventions.MD", root), new URL("conventions.MD", dist)),
]);

console.log("Build complete: dist/ generated with site and registry assets.");
