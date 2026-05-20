import test from "node:test";
import assert from "node:assert/strict";
import {
  categorizeTypedResources,
  collectSurroundingProfileQuads,
  extractProfileUriFromIssueBody,
  getCatalogLinkedUris,
  isAllowedProfileUri,
  mergeNQuads,
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
