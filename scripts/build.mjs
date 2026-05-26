import { mkdir, copyFile, cp } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await mkdir(dist, { recursive: true });

await Promise.all([
  copyFile(new URL("index.html", root), new URL("index.html", dist)),
  copyFile(new URL("conventions.MD", root), new URL("conventions.MD", dist)),
  cp(new URL("profiles/", root), new URL("profiles/", dist), { recursive: true }),
]);

console.log("Build complete: dist/ generated with site and registry assets.");
