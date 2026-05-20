import { mkdir, writeFile } from "node:fs/promises";
import { extractAllRDF, extractRDF } from "wrx";
import {
  categorizeTypedResources,
  countNQuadStatements,
  collectSurroundingProfileQuads,
  createFallbackProfileTypeTriple,
  getCatalogLinkedUris,
  parseExtractedDocument,
  serializeQuadsToNQuads,
} from "./registry-pipeline.mjs";

const ISSUE_QUADS_DIR = new URL("../profiles/", import.meta.url);

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
    console.debug(`extractAllRDF failed for ${uri}; falling back to extractRDF. Error: ${message}`);
  }

  const result = await extractRDF(uri);
  return result ? [result] : [];
}

function getIssueQuadPath(issueNumber, outputDirectory = ISSUE_QUADS_DIR) {
  return new URL(`issue-${issueNumber}.nq`, outputDirectory);
}

export async function updateProfileRegistryFromUri(rootUri, issueNumber, options = {}) {
  const loadDocuments = options.extractDocumentsForUri || extractDocumentsForUri;
  const outputDirectory = options.outputDirectory || ISSUE_QUADS_DIR;
  const queue = [rootUri];
  const visited = new Set();
  const allQuads = [];
  const profileUris = new Set();

  while (queue.length) {
    const currentUri = queue.shift();
    if (!currentUri || visited.has(currentUri)) {
      continue;
    }
    visited.add(currentUri);

    const documents = await loadDocuments(currentUri);
    const quads = documents.flatMap(parseExtractedDocument);
    if (!quads.length) {
      continue;
    }
    allQuads.push(...quads);

    const { profiles, catalogs } = categorizeTypedResources(quads);
    for (const profileUri of profiles) {
      profileUris.add(profileUri);
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
  let discoveredNQuads = serializeQuadsToNQuads(profileQuads);
  if (!discoveredNQuads.trim()) {
    discoveredNQuads = createFallbackProfileTypeTriple(rootUri);
  }

  const issuePath = getIssueQuadPath(issueNumber, outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(issuePath, discoveredNQuads, "utf8");

  return {
    registeredProfiles: profileUris.size,
    writtenTriples: countNQuadStatements(discoveredNQuads),
    outputFile: `profiles/issue-${issueNumber}.nq`,
  };
}
