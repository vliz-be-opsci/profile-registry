import { readFile, writeFile } from "node:fs/promises";
import { extractAllRDF, extractRDF } from "wrx";
import {
  categorizeTypedResources,
  collectSurroundingProfileQuads,
  getCatalogLinkedUris,
  mergeNQuads,
  parseExtractedDocument,
  serializeQuadsToNQuads,
  updateRegistryCsv,
} from "./registry-pipeline.mjs";

const REGISTRY_CSV_PATH = new URL("../registry.csv", import.meta.url);
const TRIPLES_PATH = new URL("../profile-registry-triples.nq", import.meta.url);

function normalizeExtractedDocuments(overview) {
  if (overview && Array.isArray(overview.found)) {
    return overview.found;
  }
  if (overview && overview.content) {
    return [overview];
  }
  return [];
}

async function extractDocumentsForUri(uri) {
  try {
    const overview = await extractAllRDF(uri);
    const docs = normalizeExtractedDocuments(overview);
    if (docs.length > 0) {
      return docs;
    }
  } catch (error) {
    // Discovery failures are expected for some URIs; fallback to first-match extraction below.
    const message = error instanceof Error ? error.message : String(error);
    console.debug(`extractAllRDF failed for ${uri}; fallback to extractRDF. Error: ${message}`);
  }

  const result = await extractRDF(uri);
  return result ? [result] : [];
}

export async function updateProfileRegistryFromUri(rootUri) {
  const queue = [rootUri];
  const visited = new Set();
  const allQuads = [];
  const profileUris = new Set();
  const discoveredEntries = [];

  while (queue.length) {
    const currentUri = queue.shift();
    if (!currentUri || visited.has(currentUri)) {
      continue;
    }
    visited.add(currentUri);

    const documents = await extractDocumentsForUri(currentUri);
    const quads = documents.flatMap(parseExtractedDocument);
    if (!quads.length) {
      continue;
    }
    allQuads.push(...quads);

    const { profiles, catalogs } = categorizeTypedResources(quads);
    for (const profileUri of profiles) {
      profileUris.add(profileUri);
      discoveredEntries.push({
        uri: profileUri,
        type: "http://www.w3.org/ns/dx/prof/Profile",
      });
    }

    for (const catalogUri of catalogs) {
      const linkedUris = getCatalogLinkedUris(quads, catalogUri);
      for (const linkedUri of linkedUris) {
        if (!visited.has(linkedUri)) {
          queue.push(linkedUri);
        }
      }
    }
  }

  const profileQuads = collectSurroundingProfileQuads(allQuads, profileUris);
  const discoveredNQuads = serializeQuadsToNQuads(profileQuads);

  const [existingRegistry, existingTriples] = await Promise.all([
    readFile(REGISTRY_CSV_PATH, "utf8"),
    readFile(TRIPLES_PATH, "utf8").catch(() => ""),
  ]);

  const updatedRegistry = updateRegistryCsv(existingRegistry, discoveredEntries);
  const updatedTriples = mergeNQuads(existingTriples, discoveredNQuads);

  await Promise.all([
    writeFile(REGISTRY_CSV_PATH, updatedRegistry, "utf8"),
    writeFile(TRIPLES_PATH, updatedTriples, "utf8"),
  ]);

  return {
    registeredProfiles: profileUris.size,
    writtenTriples: profileQuads.length,
  };
}
