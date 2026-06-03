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
  buildProvenanceQuads,
  detectProfilesFromResource,
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

test("identifies profiles and catalogs from extracted triples", async () => {
  const quads = await parseExtractedDocument({
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

test("parses JSON-LD documents", async () => {
  const doc = {
    format: "application/ld+json",
    content: JSON.stringify({
      "@context": {
        "name": "http://schema.org/name",
        "url": { "@id": "http://schema.org/url", "@type": "@id" },
        "about": "http://schema.org/about",
        "WebSite": "http://schema.org/WebSite"
      },
      "@type": "WebSite",
      "name": "Research Object Crate (RO-Crate)",
      "url": "https://www.researchobject.org",
      "about": "RO-Crate description"
    })
  };
  const quads = await parseExtractedDocument(doc);
  assert.equal(quads.length, 4);
  const websiteQuad = quads.find(q => q.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" && q.object.value === "http://schema.org/WebSite");
  assert.ok(websiteQuad);
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
<https://github.com/vliz-be-opsci/profile-registry#registry> <https://datatracker.ietf.org/doc/html/rfc7284#uri> <https://example.org/p1> .
<https://github.com/vliz-be-opsci/profile-registry#registry> <https://datatracker.ietf.org/doc/html/rfc7284#uri> <https://example.org/p2> .
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
  const lines = metadata.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.sort((a, b) => a.localeCompare(b)), [
    "<https://github.com/vliz-be-opsci/profile-registry#registry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://datatracker.ietf.org/doc/html/rfc7284#ProfileURIsRegistry> .",
    "<https://github.com/vliz-be-opsci/profile-registry#registry> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://datatracker.ietf.org/doc/html/rfc7284> .",
    "<https://github.com/vliz-be-opsci/profile-registry#registry> <https://datatracker.ietf.org/doc/html/rfc7284#uri> <https://example.org/profile/a> .",
  ]);
});

test("filters out non-profile subjects from aggregate CSV rows", () => {
  const quads = parseNQuads(
    `<https://example.org/profile/a> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> .
<https://example.org/profile/a> <https://example.org/title> "Profile A" .
<https://example.org/non-profile> <https://example.org/title> "Not A Profile" .
`,
  );
  const csv = buildPredicateCsvFromQuads(quads);
  const lines = csv.trim().split("\n");
  // The header should still include the titles, but only profile/a's row should be generated
  assert.equal(lines[0], "URI,http://www.w3.org/1999/02/22-rdf-syntax-ns#type,https://example.org/title");
  assert.equal(lines[1], "https://example.org/profile/a,http://www.w3.org/ns/dx/prof/Profile,Profile A");
  assert.equal(lines.length, 2); // Header + 1 profile row
});

test("generates W3C PROV-O and Dublin Core provenance triples in named graph", () => {
  const provQuads = buildProvenanceQuads({
    profileUri: "https://example.org/profile",
    sourceUri: "https://example.org/source-document",
    parentUri: "https://example.org/parent-catalog",
    issueNumber: 42,
    issueCreator: "alice",
    issueUrl: "https://github.com/vliz-be-opsci/profile-registry/issues/42",
    prUrl: "https://github.com/vliz-be-opsci/profile-registry/pull/43",
  });

  const lines = provQuads.trim().split("\n");
  assert.ok(lines.length >= 6);

  // Check Dublin Core Source and PROV wasDerivedFrom
  assert.ok(lines.includes("<https://example.org/profile> <http://purl.org/dc/terms/source> <https://example.org/source-document> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));
  assert.ok(lines.includes("<https://example.org/profile> <http://www.w3.org/ns/prov#wasDerivedFrom> <https://example.org/source-document> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));

  // Check parent discovery influence
  assert.ok(lines.includes("<https://example.org/profile> <http://www.w3.org/ns/prov#wasInfluencedBy> <https://example.org/parent-catalog> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));

  // Check generation by issue Activity
  assert.ok(lines.includes("<https://example.org/profile> <http://www.w3.org/ns/prov#wasGeneratedBy> <https://github.com/vliz-be-opsci/profile-registry/issues/42> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));
  assert.ok(lines.includes("<https://github.com/vliz-be-opsci/profile-registry/issues/42> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/prov#Activity> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));

  // Check creator and PR associations
  assert.ok(lines.includes("<https://github.com/vliz-be-opsci/profile-registry/issues/42> <http://www.w3.org/ns/prov#wasAssociatedWith> <https://github.com/alice> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));
  assert.ok(lines.includes("<https://github.com/alice> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/prov#Agent> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));
  assert.ok(lines.includes("<https://github.com/vliz-be-opsci/profile-registry/issues/42> <http://www.w3.org/ns/prov#used> <https://github.com/vliz-be-opsci/profile-registry/pull/43> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));
  assert.ok(lines.includes("<https://github.com/vliz-be-opsci/profile-registry/pull/43> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/prov#Entity> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));
});

test("add-pr-provenance.mjs script adds PR provenance to file", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { spawnSync } = await import("node:child_process");

  const testDir = path.resolve("profiles/by-issue");
  await fs.mkdir(testDir, { recursive: true });

  const testNqFile = path.resolve(testDir, "999.nq");
  await fs.writeFile(testNqFile, "<https://example.org/profile> <http://purl.org/dc/terms/title> \"Test\" .\n", "utf8");

  // Run the script as a subprocess
  const result = spawnSync("node", ["scripts/add-pr-provenance.mjs"], {
    env: {
      ...process.env,
      ISSUE_NUMBER: "999",
      PR_NUMBER: "123",
      REPOSITORY: "vliz-be-opsci/profile-registry",
    },
  });

  assert.equal(result.status, 0, `Script failed: ${(result.stderr || "").toString()}`);

  const updatedContent = await fs.readFile(testNqFile, "utf8");
  assert.ok(updatedContent.includes("<https://github.com/vliz-be-opsci/profile-registry/issues/999> <http://www.w3.org/ns/prov#used> <https://github.com/vliz-be-opsci/profile-registry/pull/123> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));

  const testTtlFile = path.resolve(testDir, "999.ttl");
  const testTrigFile = path.resolve(testDir, "999.trig");
  const testJsonLdFile = path.resolve(testDir, "999.jsonld");
  await Promise.all([
    fs.access(testTtlFile),
    fs.access(testTrigFile),
    fs.access(testJsonLdFile),
  ]);

  // Clean up
  await Promise.all([
    fs.unlink(testNqFile),
    fs.unlink(testTtlFile),
    fs.unlink(testTrigFile),
    fs.unlink(testJsonLdFile),
  ]);
});

test("detectProfilesFromResource extracts profiles from headers, HTML, and RDF conformsTo", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (url === "https://example.org/resource") {
        return {
          ok: true,
          headers: {
            get: (name) => {
              if (name.toLowerCase() === "link") {
                return '<https://example.org/profile-from-header>; rel="profile"';
              }
              return null;
            }
          },
          text: async () => `
            <html>
              <head>
                <link rel="profile" href="https://example.org/profile-from-rel">
                <link property="dct:conformsTo" href="/profile-from-prop">
              </head>
            </html>
          `
        };
      }
      return { ok: false };
    };

    const mockLoadDocuments = async (uri) => {
      return [
        {
          format: "nquads",
          content: `<https://example.org/resource> <http://purl.org/dc/terms/conformsTo> <https://example.org/profile-from-rdf> .\n`
        }
      ];
    };

    const profiles = await detectProfilesFromResource("https://example.org/resource", mockLoadDocuments);

    assert.equal(profiles.size, 4);
    assert.ok(profiles.has("https://example.org/profile-from-header"));
    assert.ok(profiles.has("https://example.org/profile-from-rel"));
    assert.ok(profiles.has("https://example.org/profile-from-prop")); // absolute URL resolved against base
    assert.ok(profiles.has("https://example.org/profile-from-rdf"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateProfileRegistryFromUri integrates resource-to-profile discovery and logs wasDerivedFrom provenance", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { updateProfileRegistryFromUri } = await import("./update-profile-registry.mjs");

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (url === "https://example.org/resource-submission") {
        return {
          ok: true,
          headers: { get: () => null },
          text: async () => `
            <html>
              <head>
                <link rel="profile" href="https://example.org/discovered-profile">
              </head>
            </html>
          `
        };
      }
      return { ok: false };
    };

    const mockLoadDocuments = async (uri) => {
      if (uri === "https://example.org/discovered-profile") {
        return [
          {
            format: "nquads",
            content: `<https://example.org/discovered-profile> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> .\n`
          }
        ];
      }
      return [];
    };

    const result = await updateProfileRegistryFromUri("https://example.org/resource-submission", 888, {
      extractDocumentsForUri: mockLoadDocuments,
    });

    assert.equal(result.registeredProfiles, 1);
    
    const testDir = path.resolve("profiles/by-issue");
    const testNqFile = path.resolve(testDir, "888.nq");
    const testTtlFile = path.resolve(testDir, "888.ttl");
    const testTrigFile = path.resolve(testDir, "888.trig");
    const testJsonLdFile = path.resolve(testDir, "888.jsonld");

    const content = await fs.readFile(testNqFile, "utf8");
    
    // Check that the profile itself is registered
    assert.ok(content.includes("<https://example.org/discovered-profile> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> ."));
    
    // Check that the resource is not registered as a profile itself
    assert.ok(!content.includes("<https://example.org/resource-submission> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> ."));

    // Check that the prov:wasDerivedFrom link is added
    assert.ok(content.includes("<https://example.org/resource-submission> <http://www.w3.org/ns/prov#wasDerivedFrom> <https://example.org/discovered-profile> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));

    // Clean up
    await Promise.all([
      fs.unlink(testNqFile),
      fs.unlink(testTtlFile),
      fs.unlink(testTrigFile),
      fs.unlink(testJsonLdFile),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateProfileRegistryFromUri integrates observatory-bergen-crate conformsTo extraction and registers latest profile", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { updateProfileRegistryFromUri } = await import("./update-profile-registry.mjs");

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (url === "https://data.emobon.embrc.eu/observatory-bergen-crate/") {
        // Return HTML with no profile/conformsTo links in headers or body to simulate normal retrieval finding nothing
        return {
          ok: true,
          headers: { get: () => null },
          text: async () => `
            <html>
              <body>
                <h1>Observatory Bergen Crate</h1>
              </body>
            </html>
          `
        };
      }
      return { ok: false };
    };

    const mockLoadDocuments = async (uri) => {
      if (uri === "https://data.emobon.embrc.eu/observatory-bergen-crate/") {
        // Simulates wrx discovering and harvesting the conformsTo relationship from ro-crate-metadata.json
        return [
          {
            format: "nquads",
            content: `<https://data.emobon.embrc.eu/observatory-bergen-crate/#./> <http://purl.org/dc/terms/conformsTo> <https://data.emobon.embrc.eu/observatory-profile/latest> .\n`
          }
        ];
      }
      if (uri === "https://data.emobon.embrc.eu/observatory-profile/latest") {
        return [
          {
            format: "nquads",
            content: `<https://data.emobon.embrc.eu/observatory-profile/latest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> .\n`
          }
        ];
      }
      return [];
    };

    const result = await updateProfileRegistryFromUri("https://data.emobon.embrc.eu/observatory-bergen-crate/", 999, {
      extractDocumentsForUri: mockLoadDocuments,
    });

    assert.equal(result.registeredProfiles, 1);

    const testDir = path.resolve("profiles/by-issue");
    const testNqFile = path.resolve(testDir, "999.nq");
    const testTtlFile = path.resolve(testDir, "999.ttl");
    const testTrigFile = path.resolve(testDir, "999.trig");
    const testJsonLdFile = path.resolve(testDir, "999.jsonld");

    const content = await fs.readFile(testNqFile, "utf8");

    // Check that the conformsTo target (the profile) is registered
    assert.ok(content.includes("<https://data.emobon.embrc.eu/observatory-profile/latest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> ."));

    // Check that the resource itself is not registered as a profile
    assert.ok(!content.includes("<https://data.emobon.embrc.eu/observatory-bergen-crate/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/dx/prof/Profile> ."));

    // Check that the prov:wasDerivedFrom link is added
    assert.ok(content.includes("<https://data.emobon.embrc.eu/observatory-bergen-crate/> <http://www.w3.org/ns/prov#wasDerivedFrom> <https://data.emobon.embrc.eu/observatory-profile/latest> <https://github.com/vliz-be-opsci/profile-registry#provenance> ."));

    // Clean up
    await Promise.all([
      fs.unlink(testNqFile),
      fs.unlink(testTtlFile),
      fs.unlink(testTrigFile),
      fs.unlink(testJsonLdFile),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

