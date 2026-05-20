import { Parser, Writer } from "n3";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const PROFILE_TYPES = new Set([
  "http://www.w3.org/ns/dx/prof/Profile",
  "http://www.w3.org/2000/01/rdf-schema#Profile",
  "http://www.w3.org/ns/dx/prof/profile",
]);
const CATALOG_TYPES = new Set([
  "http://www.w3.org/ns/dcat#Catalog",
  "http://www.w3.org/ns/dcat#catalog",
]);

const DCAT_LINK_PREDICATES = new Set([
  "http://www.w3.org/ns/dcat#dataset",
  "http://www.w3.org/ns/dcat#service",
  "http://www.w3.org/ns/dcat#resource",
  "http://www.w3.org/ns/dcat#catalog",
  "http://www.w3.org/ns/dcat#record",
]);

export function extractProfileUriFromIssueBody(issueBody = "") {
  const match = issueBody.match(/^\s*-\s*Profile URI:\s*(\S+)\s*$/im);
  return match ? match[1].trim() : null;
}

export function isAllowedProfileUri(value) {
  if (!value) {
    return false;
  }
  if (/^urn:[a-z0-9][a-z0-9-]{0,31}:.+/i.test(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function guessParserFormat(doc) {
  const mime = (doc?.mime || "").toLowerCase();
  const format = (doc?.format || "").toLowerCase();
  if (format === "nquads" || mime.includes("n-quads")) {
    return "application/n-quads";
  }
  if (format === "ntriples" || mime.includes("n-triples")) {
    return "application/n-triples";
  }
  if (format === "trig" || mime.includes("trig")) {
    return "application/trig";
  }
  if (format === "turtle" || format === "n3" || mime.includes("turtle")) {
    return "text/turtle";
  }
  return null;
}

export function parseExtractedDocument(doc) {
  const parserFormat = guessParserFormat(doc);
  if (!parserFormat || !doc?.content) {
    return [];
  }

  try {
    const parser = new Parser({ format: parserFormat });
    return parser.parse(doc.content);
  } catch (_) {
    return [];
  }
}

export function categorizeTypedResources(quads) {
  const profiles = new Set();
  const catalogs = new Set();

  for (const quad of quads) {
    if (quad.predicate.value !== RDF_TYPE || quad.object.termType !== "NamedNode") {
      continue;
    }

    const objectValue = quad.object.value;
    if (PROFILE_TYPES.has(objectValue)) {
      profiles.add(quad.subject.value);
      continue;
    }
    if (CATALOG_TYPES.has(objectValue)) {
      catalogs.add(quad.subject.value);
    }
  }

  return { profiles, catalogs };
}

export function getCatalogLinkedUris(quads, catalogUri) {
  const linked = new Set();
  for (const quad of quads) {
    if (quad.subject.value !== catalogUri || quad.object.termType !== "NamedNode") {
      continue;
    }
    if (DCAT_LINK_PREDICATES.has(quad.predicate.value)) {
      linked.add(quad.object.value);
    }
  }
  return linked;
}

export function collectSurroundingProfileQuads(quads, profileUris) {
  const collected = [];
  for (const quad of quads) {
    const subjectMatch = profileUris.has(quad.subject.value);
    const objectMatch = quad.object.termType === "NamedNode" && profileUris.has(quad.object.value);
    if (subjectMatch || objectMatch) {
      collected.push(quad);
    }
  }
  return collected;
}

export function serializeQuadsToNQuads(quads) {
  if (!quads.length) {
    return "";
  }
  const writer = new Writer({ format: "N-Quads" });
  writer.addQuads(quads);
  let output = "";
  writer.end((error, result) => {
    if (error) {
      throw error;
    }
    output = result;
  });
  return output;
}

export function mergeNQuads(existingContent, newContent) {
  const merged = new Set(
    `${existingContent || ""}\n${newContent || ""}`
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  return [...merged].sort().join("\n") + (merged.size ? "\n" : "");
}

export function updateRegistryCsv(existingCsv, newEntries) {
  const rows = (existingCsv || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const header = rows[0] || "URI,type";
  const entries = new Map();
  for (const row of rows.slice(1)) {
    const [uri, type] = row.split(",");
    if (uri) {
      entries.set(uri, type || "");
    }
  }

  for (const entry of newEntries) {
    if (!entry.uri) {
      continue;
    }
    entries.set(entry.uri, entry.type || entries.get(entry.uri) || "");
  }

  const sorted = [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return [header, ...sorted.map(([uri, type]) => `${uri},${type}`)].join("\n") + "\n";
}
