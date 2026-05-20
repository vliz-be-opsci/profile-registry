import { readdir, readFile, writeFile } from "node:fs/promises";
import { mergeNQuads, parseNQuads, buildPredicateCsvFromQuads } from "./registry-pipeline.mjs";

const ISSUE_QUADS_DIR = new URL("../profiles/", import.meta.url);
const ALL_PROFILES_PATH = new URL("../all_profiles_quads.nq", import.meta.url);
const REGISTRY_CSV_PATH = new URL("../registry.csv", import.meta.url);

const entries = await readdir(ISSUE_QUADS_DIR, { withFileTypes: true }).catch(() => []);
const nqFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".nq"))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

let merged = "";
for (const fileName of nqFiles) {
  const content = await readFile(new URL(fileName, ISSUE_QUADS_DIR), "utf8");
  merged = mergeNQuads(merged, content);
}

const quads = parseNQuads(merged);
const csv = buildPredicateCsvFromQuads(quads);

await Promise.all([
  writeFile(ALL_PROFILES_PATH, merged, "utf8"),
  writeFile(REGISTRY_CSV_PATH, csv, "utf8"),
]);

console.log(
  JSON.stringify(
    {
      filesProcessed: nqFiles.length,
      mergedTriples: merged.split("\n").filter(Boolean).length,
      csvRows: csv.split("\n").filter(Boolean).length - 1,
    },
    null,
    2,
  ),
);
