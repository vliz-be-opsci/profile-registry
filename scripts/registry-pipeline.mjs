import { Parser, Writer } from "n3";
import jsonld from "jsonld";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const PROF_PROFILE = "http://www.w3.org/ns/dx/prof/Profile";
const RDFS_SEE_ALSO = "http://www.w3.org/2000/01/rdf-schema#seeAlso";
const RFC7284_DOCUMENT = "https://datatracker.ietf.org/doc/html/rfc7284";
const RFC7284_IRD_CLASS = "https://datatracker.ietf.org/doc/html/rfc7284#ProfileURIsRegistry";
const RFC7284_URI_PREDICATE = "https://datatracker.ietf.org/doc/html/rfc7284#uri";
const REGISTRY_RESOURCE_URI = "https://github.com/vliz-be-opsci/profile-registry#registry";
const PROVENANCE_GRAPH_URI = "https://github.com/vliz-be-opsci/profile-registry#provenance";
const PROFILE_TYPES = new Set([
  PROF_PROFILE,
  "http://www.w3.org/2000/01/rdf-schema#Profile",
  "http://www.w3.org/ns/dx/prof/profile",
]);
const CATALOG_TYPES = new Set([
  "http://www.w3.org/ns/dcat#Catalog",
  "http://www.w3.org/ns/dcat#catalog",
]);
const CSV_MULTI_VALUE_SEPARATOR = " | ";

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
  } catch (error) {
    // Invalid URLs are rejected.
    const message = error instanceof Error ? error.message : String(error);
    console.debug(`Rejected invalid profile URI: ${value}. Error: ${message}`);
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
  if (
    format === "jsonld" ||
    format === "json-ld" ||
    format.includes("json") ||
    format.includes("ld+json") ||
    mime.includes("json") ||
    mime.includes("ld+json")
  ) {
    return "application/ld+json";
  }
  return null;
}

export async function parseExtractedDocument(doc, fallbackUri) {
  const parserFormat = guessParserFormat(doc);
  if (!parserFormat || !doc?.content) {
    return [];
  }

  try {
    let contentToParse = doc.content;
    let actualFormat = parserFormat;

    if (parserFormat === "application/ld+json") {
      const parsed = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
      const targetId = doc.uri || fallbackUri || "";
      if (targetId) {
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === "object" && !item["@id"]) {
              item["@id"] = targetId;
            }
          }
        } else if (parsed && typeof parsed === "object" && !parsed["@id"]) {
          parsed["@id"] = targetId;
        }
      }
      contentToParse = await jsonld.toRDF(parsed, { format: "application/n-quads" });
      actualFormat = "application/n-quads";
    }

    const parser = new Parser({ format: actualFormat });
    return parser.parse(contentToParse);
  } catch (error) {
    // Unsupported or malformed RDF payloads are skipped.
    const message = error instanceof Error ? error.message : String(error);
    console.debug(
      `Skipping unparsable RDF content from ${doc?.uri || "unknown source"}: ${message}`,
    );
    return [];
  }
}

export function createFallbackProfileTypeTriple(profileUri) {
  return `<${profileUri}> <${RDF_TYPE}> <${PROF_PROFILE}> .\n`;
}

export function categorizeTypedResources(quads) {
  const profiles = new Set();
  const catalogs = new Set();

  for (const quad of quads) {
    if (quad.graph && quad.graph.value === PROVENANCE_GRAPH_URI) {
      if (quad.predicate.value === "http://purl.org/dc/terms/source" || quad.predicate.value === "http://www.w3.org/ns/prov#wasDerivedFrom") {
        profiles.add(quad.subject.value);
      }
    }

    if (quad.predicate.value === RFC7284_URI_PREDICATE && quad.object.termType === "NamedNode") {
      profiles.add(quad.object.value);
    }

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

export function serializeQuadsToTurtle(quads) {
  if (!quads.length) {
    return "";
  }
  const writer = new Writer({ format: "Turtle" });
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

export function serializeQuadsToTriG(quads) {
  if (!quads.length) {
    return "";
  }
  const writer = new Writer({ format: "TriG" });
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

export async function serializeQuadsToJsonLd(quads) {
  if (!quads.length) {
    return "[]\n";
  }
  const nquads = serializeQuadsToNQuads(quads);
  const jsonldDocument = await jsonld.fromRDF(nquads, { format: "application/n-quads" });
  return `${JSON.stringify(jsonldDocument, null, 2)}\n`;
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

export function countNQuadStatements(content = "") {
  return parseNQuads(content).length;
}

export function updateRegistryCsv(existingCsv, newEntries) {
  const parseCsvRow = (row) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    values.push(current);
    return values;
  };

  const escapeCsvValue = (value = "") => {
    if (!value.includes(",") && !value.includes('"') && !value.includes("\n")) {
      return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
  };

  const rows = (existingCsv || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const header = rows[0] || "URI,type";
  const entries = new Map();
  for (const row of rows.slice(1)) {
    const [uri, type] = parseCsvRow(row);
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
  return [
    header,
    ...sorted.map(([uri, type]) => `${escapeCsvValue(uri)},${escapeCsvValue(type)}`),
  ].join("\n") + "\n";
}

export function parseNQuads(content = "") {
  if (!content.trim()) {
    return [];
  }

  const parser = new Parser({ format: "application/n-quads" });
  return parser.parse(content);
}

export function buildPredicateCsvFromQuads(quads) {
  const { profiles } = categorizeTypedResources(quads);
  const predicateUris = new Set();
  const rowMap = new Map();

  for (const quad of quads) {
    if (quad.subject.termType !== "NamedNode" || quad.predicate.termType !== "NamedNode") {
      continue;
    }

    const subject = quad.subject.value;
    if (!profiles.has(subject)) {
      continue;
    }

    const predicate = quad.predicate.value;
    const object = quad.object.value;
    predicateUris.add(predicate);

    if (!rowMap.has(subject)) {
      rowMap.set(subject, new Map());
    }
    const row = rowMap.get(subject);
    if (!row.has(predicate)) {
      row.set(predicate, new Set());
    }
    row.get(predicate).add(object);
  }

  const predicates = [...predicateUris].sort((a, b) => a.localeCompare(b));

  const escapeCsv = (value = "") => {
    if (!value.includes(",") && !value.includes('"') && !value.includes("\n")) {
      return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
  };

  const lines = [
    ["URI", ...predicates].map(escapeCsv).join(","),
  ];

  const subjects = [...rowMap.keys()].sort((a, b) => a.localeCompare(b));
  for (const subject of subjects) {
    const row = rowMap.get(subject);
    const values = predicates.map((predicate) => {
      const objects = row.get(predicate);
      return objects
        ? [...objects].sort((a, b) => a.localeCompare(b)).join(CSV_MULTI_VALUE_SEPARATOR)
        : "";
    });
    lines.push([subject, ...values].map(escapeCsv).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export function buildProvenanceQuads({
  profileUri,
  sourceUri,
  parentUri,
  issueNumber,
  issueCreator,
  issueUrl,
  prUrl,
}) {
  const graph = PROVENANCE_GRAPH_URI;
  const lines = [];

  if (profileUri && sourceUri) {
    lines.push(`<${profileUri}> <http://purl.org/dc/terms/source> <${sourceUri}> <${graph}> .`);
    lines.push(`<${profileUri}> <http://www.w3.org/ns/prov#wasDerivedFrom> <${sourceUri}> <${graph}> .`);
  }

  if (profileUri && parentUri) {
    lines.push(`<${profileUri}> <http://www.w3.org/ns/prov#wasInfluencedBy> <${parentUri}> <${graph}> .`);
  }

  if (profileUri && issueUrl) {
    lines.push(`<${profileUri}> <http://www.w3.org/ns/prov#wasGeneratedBy> <${issueUrl}> <${graph}> .`);
  }

  if (issueUrl) {
    lines.push(`<${issueUrl}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/prov#Activity> <${graph}> .`);
    if (issueCreator) {
      const creatorUri = `https://github.com/${issueCreator}`;
      lines.push(`<${issueUrl}> <http://www.w3.org/ns/prov#wasAssociatedWith> <${creatorUri}> <${graph}> .`);
      lines.push(`<${creatorUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/prov#Agent> <${graph}> .`);
    }
    if (prUrl) {
      lines.push(`<${issueUrl}> <http://www.w3.org/ns/prov#used> <${prUrl}> <${graph}> .`);
      lines.push(`<${prUrl}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/prov#Entity> <${graph}> .`);
    }
  }

  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function buildRfc7284RegistryMetadataNQuads(quads) {
  const { profiles } = categorizeTypedResources(quads);
  const registryTriples = [
    `<${REGISTRY_RESOURCE_URI}> <${RDF_TYPE}> <${RFC7284_IRD_CLASS}> .`,
    `<${REGISTRY_RESOURCE_URI}> <${RDFS_SEE_ALSO}> <${RFC7284_DOCUMENT}> .`,
  ];

  for (const profileUri of Array.from(profiles).sort((a, b) => a.localeCompare(b))) {
    registryTriples.push(`<${REGISTRY_RESOURCE_URI}> <${RFC7284_URI_PREDICATE}> <${profileUri}> .`);
  }

  return registryTriples.join("\n") + "\n";
}

export async function detectProfilesFromResource(rootUri, loadDocuments) {
  const discoveredProfiles = new Set();

  let responseText = "";
  let linkHeader = "";
  try {
    const res = await fetch(rootUri, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/ld+json,text/turtle,*/*;q=0.8'
      }
    });
    if (res.ok) {
      linkHeader = res.headers.get("link") || "";
      responseText = await res.text();
    }
  } catch (err) {
    console.debug(`Failed to fetch ${rootUri} for resource check: ${err.message}`);
  }

  // Parse HTTP Link header
  if (linkHeader) {
    const parts = linkHeader.split(",");
    for (let part of parts) {
      part = part.trim();
      const urlMatch = part.match(/<([^>]+)>/);
      if (!urlMatch) continue;
      const url = urlMatch[1];
      const relMatch = part.match(/rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;]+))/i);
      const rel = relMatch ? (relMatch[1] || relMatch[2] || relMatch[3]) : null;
      if (rel) {
        const isProfile = rel.split(/\s+/).some(token => 
          token.toLowerCase() === 'profile' || 
          token.toLowerCase() === 'conformsto' || 
          token.toLowerCase() === 'dct:conformsto' ||
          token === 'http://purl.org/dc/terms/conformsTo'
        );
        if (isProfile) {
          try {
            discoveredProfiles.add(new URL(url, rootUri).toString());
          } catch (e) {}
        }
      }
    }
  }

  // Parse HTML Link tags (rel or property)
  if (responseText) {
    const linkRegex = /<link\b[^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(responseText)) !== null) {
      const tag = match[0];
      const hrefMatch = tag.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch ? (hrefMatch[1] || hrefMatch[2] || hrefMatch[3]) : null;
      if (!href) continue;

      const relMatch = tag.match(/rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const rel = relMatch ? (relMatch[1] || relMatch[2] || relMatch[3]) : null;

      const propMatch = tag.match(/property\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const property = propMatch ? (propMatch[1] || propMatch[2] || propMatch[3]) : null;

      const isProfileRel = rel && rel.split(/\s+/).some(token => 
        token.toLowerCase() === 'profile' || 
        token.toLowerCase() === 'conformsto' || 
        token.toLowerCase() === 'dct:conformsto' ||
        token === 'http://purl.org/dc/terms/conformsTo'
      );
      const isProfileProp = property && property.split(/\s+/).some(token => 
        token.toLowerCase() === 'profile' || 
        token.toLowerCase() === 'conformsto' || 
        token.toLowerCase() === 'dct:conformsto' ||
        token === 'http://purl.org/dc/terms/conformsTo'
      );

      if (isProfileRel || isProfileProp) {
        try {
          discoveredProfiles.add(new URL(href, rootUri).toString());
        } catch (e) {}
      }
    }
  }

  const normalizeUri = (uri) => {
    if (!uri) return "";
    try {
      const url = new URL(uri);
      let path = url.pathname;
      if (path.endsWith("/")) {
        path = path.slice(0, -1);
      }
      return `${url.protocol}//${url.host}${path}`;
    } catch (e) {
      let u = uri.trim();
      if (u.endsWith("/")) {
        u = u.slice(0, -1);
      }
      const hashIndex = u.indexOf("#");
      if (hashIndex !== -1) {
        u = u.slice(0, hashIndex);
      }
      return u;
    }
  };

  const normRoot = normalizeUri(rootUri);

  // Parse RDF / JSON-LD conformsTo predicates
  try {
    const documents = await loadDocuments(rootUri);
    const quads = (await Promise.all(documents.map((doc) => parseExtractedDocument(doc, rootUri)))).flat();
    for (const quad of quads) {
      const normSubject = normalizeUri(quad.subject.value);
      if (
        (normSubject === normRoot || normSubject.startsWith(normRoot + "/")) &&
        (quad.predicate.value === "http://purl.org/dc/terms/conformsTo" ||
         quad.predicate.value === "conformsTo") &&
        quad.object.termType === "NamedNode"
      ) {
        discoveredProfiles.add(quad.object.value);
      }
    }
  } catch (err) {
    console.debug(`Failed to parse RDF for ${rootUri} conformsTo check: ${err.message}`);
  }

  return discoveredProfiles;
}

