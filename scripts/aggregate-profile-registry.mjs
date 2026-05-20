import { readdir, readFile, writeFile } from "node:fs/promises";
import {
  mergeNQuads,
  parseNQuads,
  buildPredicateCsvFromQuads,
  buildRfc7284RegistryMetadataNQuads,
} from "./registry-pipeline.mjs";
import { getErrorMessage } from "./error-utils.mjs";

const ISSUE_QUADS_DIR = new URL("../profiles/", import.meta.url);
const ALL_PROFILES_PATH = new URL("../all_profiles_quads.nq", import.meta.url);
const REGISTRY_CSV_PATH = new URL("../registry.csv", import.meta.url);

const entries = await readdir(ISSUE_QUADS_DIR, { withFileTypes: true }).catch((error) => {
  const message = getErrorMessage(error);
  console.warn(
    `No profiles directory found or readable; aggregation will produce empty outputs: ${message}`,
  );
  return [];
});
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
const registryMetadata = buildRfc7284RegistryMetadataNQuads(quads);
const mergedWithRegistryMetadata = mergeNQuads(merged, registryMetadata);
const publishedQuads = parseNQuads(mergedWithRegistryMetadata);
const csv = buildPredicateCsvFromQuads(publishedQuads);

await Promise.all([
  writeFile(ALL_PROFILES_PATH, mergedWithRegistryMetadata, "utf8"),
  writeFile(REGISTRY_CSV_PATH, csv, "utf8"),
]);

console.log(
  JSON.stringify(
    {
      filesProcessed: nqFiles.length,
      mergedTriples: publishedQuads.length,
      csvRows: csv.split("\n").filter(Boolean).length - 1,
    },
    null,
    2,
  ),
);
