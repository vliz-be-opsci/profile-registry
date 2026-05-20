import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRfc7284RegistryMetadataNQuads,
  buildPredicateCsvFromQuads,
  categorizeTypedResources,
  collectSurroundingProfileQuads,
  createFallbackProfileTypeTriple,
  extractProfileUriFromIssueBody,
  getCatalogLinkedUris,
  isAllowedProfileUri,
  mergeNQuads,
  parseNQuads,
  parseExtractedDocument,
  updateRegistryCsv,
} from "./registry-pipeline.mjs";

test("extracts profile URI from issue body", () => {
  const issueBody =
    "## Profile registration request\n\n- Profile URI: https://example.org/profile/demo\n- rdfs:type:";
  assert.equal(
    extractProfileUriFromIssueBody(issueBody),
    "https://example.org/profile/demo",
  );
});

test("accepts HTTP(S) and URN profile URIs", () => {
  assert.equal(isAllowedProfileUri("https://example.org/profile"), true);
  assert.equal(isAllowedProfileUri("urn:example:profile-uri"), true);
  assert.equal(isAllowedProfileUri("ftp://example.org/profile"), false);
});

test("identifies profiles and catalogs from extracted triples", () => {
  const quads = parseExtractedDocument({
    format: "nquads",
    content: `<https://example.org/p1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> .\n<https://example.org/c1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dcat#Catalog> .\n<https://example.org/c1> <http://www.w3.org/ns/dcat#dataset> <https://example.org/p1> .\n`,
  });

  const { profiles, catalogs } = categorizeTypedResources(quads);
  assert.equal(profiles.has("https://example.org/p1"), true);
  assert.equal(catalogs.has("https://example.org/c1"), true);

  const links = getCatalogLinkedUris(quads, "https://example.org/c1");
  assert.equal(links.has("https://example.org/p1"), true);

  const surrounding = collectSurroundingProfileQuads(quads, profiles);
  assert.equal(surrounding.length > 0, true);
});

test("updates registry CSV and merges N-Quads without duplicates", () => {
  const csv = "URI,type\nhttps://example.org/old,http://www.w3.org/ns/dx/prof/Profile\n";
  const updated = updateRegistryCsv(csv, [
    { uri: "https://example.org/new", type: "http://www.w3.org/ns/dx/prof/Profile" },
  ]);
  assert.equal(
    updated.includes("https://example.org/new,http://www.w3.org/ns/dx/prof/Profile"),
    true,
  );

  const merged = mergeNQuads(
    "<https://example.org/s> <https://example.org/p> <https://example.org/o> .\n",
    "<https://example.org/s> <https://example.org/p> <https://example.org/o> .\n<https://example.org/s2> <https://example.org/p2> <https://example.org/o2> .\n",
  );
  assert.equal(merged.split("\n").filter(Boolean).length, 2);
});

test("creates fallback profile typing triple for URI", () => {
  assert.equal(
    createFallbackProfileTypeTriple("https://example.org/profile/fallback"),
    "<https://example.org/profile/fallback> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> .\n",
  );
});

test("builds aggregate CSV with URI and discovered predicate columns", () => {
  const quads = parseNQuads(
    `<https://example.org/p1> <https://example.org/title> "Profile One" .
<https://example.org/p1> <https://example.org/type> <https://example.org/kind> .
<https://example.org/p2> <https://example.org/title> "Profile Two" .
`,
  );
  const csv = buildPredicateCsvFromQuads(quads);
  const lines = csv.trim().split("\n");
  assert.equal(
    lines[0],
    "URI,https://example.org/title,https://example.org/type",
  );
  assert.equal(lines[1], "https://example.org/p1,Profile One,https://example.org/kind");
  assert.equal(lines[2], "https://example.org/p2,Profile Two,");
});

test("builds RFC7284 registry metadata triples for discovered profiles", () => {
  const quads = parseNQuads(
    `<https://example.org/profile/a> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> .
<https://example.org/catalog/1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dcat#Catalog> .
`,
  );

  const metadata = buildRfc7284RegistryMetadataNQuads(quads);
  assert.equal(
    metadata.includes(
      "<https://github.com/vliz-be-opsci/profile-registry#registry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://datatracker.ietf.org/doc/html/rfc7284#InformationResourceDirectory> .",
    ),
    true,
  );
  assert.equal(
    metadata.includes(
      "<https://github.com/vliz-be-opsci/profile-registry#registry> <https://datatracker.ietf.org/doc/html/rfc7284#uri> <https://example.org/profile/a> .",
    ),
    true,
  );
});
