import { fileURLToPath } from "node:url";
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
  detectProfilesFromResource,
} from "./registry-pipeline.mjs";
import {
  BY_ISSUE_DIR,
  ensureProfilesDirectories,
  updateByNameSymlinks,
  writeQuadVariantsFromNQuads,
} from "./profile-storage.mjs";

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
  const { extractAllRDF, extractRDF } = await import("wrx");
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

function getIssueQuadPath(issueNumber, outputDirectory = BY_ISSUE_DIR) {
  return new URL(`${issueNumber}.nq`, outputDirectory);
}

export async function updateProfileRegistryFromUri(rootUri, issueNumber, options = {}) {
  const loadDocuments = options.extractDocumentsForUri || extractDocumentsForUri;
  const outputDirectory = options.outputDirectory || BY_ISSUE_DIR;
  const isResource = options.isResource === true;

  const discoveredResourceProfiles = await detectProfilesFromResource(rootUri, loadDocuments);
  const isResourceSubmission = isResource || discoveredResourceProfiles.size > 0;

  const initialUris = isResourceSubmission ? Array.from(discoveredResourceProfiles) : [rootUri];
  const queue = initialUris.map((uri) => ({ uri, parentUri: null }));
  const visited = new Set();
  const allQuads = [];
  const profileUris = new Set(initialUris);
  const discoveryParents = new Map();
  const sourceUris = new Map();

  for (const uri of initialUris) {
    sourceUris.set(uri, uri);
  }

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
    let fallback = "";
    for (const uri of profileUris) {
      fallback += createFallbackProfileTypeTriple(uri);
    }
    discoveredNQuads = fallback;
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

  if (isResourceSubmission) {
    for (const profileUri of discoveredResourceProfiles) {
      provenanceNQuads += `<${rootUri}> <http://www.w3.org/ns/prov#wasDerivedFrom> <${profileUri}> <https://github.com/vliz-be-opsci/profile-registry#provenance> .\n`;
    }
  }

  if (provenanceNQuads) {
    discoveredNQuads = mergeNQuads(discoveredNQuads, provenanceNQuads);
  }

  const issuePath = getIssueQuadPath(issueNumber, outputDirectory);
  await ensureProfilesDirectories();
  const issueBasePath = fileURLToPath(issuePath).replace(/\.nq$/, "");
  await writeQuadVariantsFromNQuads(issueBasePath, discoveredNQuads);
  await updateByNameSymlinks(profileUris, issueNumber);

  return {
    registeredProfiles: profileUris.size,
    writtenTriples: countNQuadStatements(discoveredNQuads),
    outputFile: `profiles/by-issue/${issueNumber}.nq`,
    isResourceSubmission,
    submittedUri: rootUri,
    discoveredProfiles: Array.from(profileUris),
  };
}
