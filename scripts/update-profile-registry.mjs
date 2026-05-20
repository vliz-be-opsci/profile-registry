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
  buildProvenanceQuads,
  mergeNQuads,
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

  // Fallback: If no documents were found and URI has no trailing slash, try with a trailing slash
  if (!uri.endsWith("/")) {
    try {
      const overviewTrailing = await extractAllRDF(uri + "/");
      const docsTrailing = normalizeExtractedDocuments(overviewTrailing);
      if (docsTrailing.length > 0) {
        return docsTrailing;
      }
    } catch (error) {
      // Ignore retry failure and proceed to extractRDF fallback
    }
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
  const queue = [{ uri: rootUri, parentUri: null }];
  const visited = new Set();
  const allQuads = [];
  const profileUris = new Set([rootUri]);
  const discoveryParents = new Map();
  const sourceUris = new Map();

  sourceUris.set(rootUri, rootUri);

  while (queue.length) {
    const { uri: currentUri, parentUri } = queue.shift();
    if (!currentUri || visited.has(currentUri)) {
      continue;
    }
    visited.add(currentUri);

    const documents = await loadDocuments(currentUri);
    const quads = (await Promise.all(documents.map((doc) => parseExtractedDocument(doc, currentUri)))).flat();
    if (!quads.length) {
      continue;
    }
    allQuads.push(...quads);

    const { profiles, catalogs } = categorizeTypedResources(quads);
    for (const profileUri of profiles) {
      profileUris.add(profileUri);
      if (!sourceUris.has(profileUri)) {
        sourceUris.set(profileUri, currentUri);
      }
      if (!discoveryParents.has(profileUri) && currentUri !== profileUri) {
        discoveryParents.set(profileUri, currentUri);
      }
      if (!visited.has(profileUri)) {
        queue.push({ uri: profileUri, parentUri: currentUri });
      }
    }

    for (const catalogUri of catalogs) {
      const linkedUris = getCatalogLinkedUris(quads, catalogUri);
      for (const linkedUri of linkedUris) {
        if (!discoveryParents.has(linkedUri)) {
          discoveryParents.set(linkedUri, currentUri);
        }
        if (!visited.has(linkedUri)) {
          queue.push({ uri: linkedUri, parentUri: currentUri });
        }
      }
    }
  }

  const profileQuads = collectSurroundingProfileQuads(allQuads, profileUris);
  let discoveredNQuads = serializeQuadsToNQuads(profileQuads);
  if (!discoveredNQuads.trim()) {
    discoveredNQuads = createFallbackProfileTypeTriple(rootUri);
  }

  const issueCreator = process.env.ISSUE_CREATOR || options.issueCreator || "";
  const issueUrl = process.env.ISSUE_URL || options.issueUrl || (issueNumber ? (process.env.REPOSITORY ? `https://github.com/${process.env.REPOSITORY}/issues/${issueNumber}` : `https://github.com/vliz-be-opsci/profile-registry/issues/${issueNumber}`) : "");

  let provenanceNQuads = "";
  for (const profileUri of profileUris) {
    provenanceNQuads += buildProvenanceQuads({
      profileUri,
      sourceUri: sourceUris.get(profileUri) || rootUri,
      parentUri: discoveryParents.get(profileUri),
      issueNumber,
      issueCreator,
      issueUrl,
    });
  }

  if (provenanceNQuads) {
    discoveredNQuads = mergeNQuads(discoveredNQuads, provenanceNQuads);
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
