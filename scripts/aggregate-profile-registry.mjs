import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  mergeNQuads,
  parseNQuads,
  buildPredicateCsvFromQuads,
  buildRfc7284RegistryMetadataNQuads,
  categorizeTypedResources,
} from "./registry-pipeline.mjs";
import { getErrorMessage } from "./error-utils.mjs";
import {
  ALL_DIR,
  BY_ISSUE_DIR,
  ensureProfilesDirectories,
  getAggregateVariantPath,
  writeQuadVariantsFromNQuads,
} from "./profile-storage.mjs";

const ISSUE_QUADS_DIR = BY_ISSUE_DIR;
const ALL_PROFILES_PATH = getAggregateVariantPath("all_profiles_quads", "nq");
const PROFILE_REGISTRY_TRIPLES_PATH = getAggregateVariantPath("profile-registry-triples", "nq");
const REGISTRY_CSV_PATH = new URL("registry.csv", ALL_DIR);
const DESCRIBEDBY_PATH = new URL("describedby.ttl", ALL_DIR);
const LINKSET_JSON_PATH = new URL("linkset.json", ALL_DIR);
const LINKSET_TXT_PATH = new URL("linkset", ALL_DIR);

await ensureProfilesDirectories();

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
const publishedNQuads = mergeNQuads(merged, registryMetadata);
const publishedQuads = parseNQuads(publishedNQuads);
const csv = buildPredicateCsvFromQuads(publishedQuads);

// Extract profiles to generate signposting and linkset files
const { profiles } = categorizeTypedResources(quads);

function generateDescribedByTtl(profilesSet) {
  const profileList = Array.from(profilesSet).sort((a, b) => a.localeCompare(b));
  let ttl = `@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix prof: <http://www.w3.org/ns/dx/prof/> .

<https://github.com/vliz-be-opsci/profile-registry> a dcat:Catalog ;
    dcterms:title "cpurr: cpurr Profile URI Resource Registry" ;
    dcterms:description "A recursive, machine-actionable open-science registry designed to index, validate, audit, and traverse semantic RDF profiles and catalogs." ;
    dcterms:publisher <https://open-science.vliz.be/> ;
    rdfs:seeAlso <https://github.com/vliz-be-opsci/profile-registry> .
`;

  for (const profileUri of profileList) {
    ttl += `\n<https://github.com/vliz-be-opsci/profile-registry> dcat:resource <${profileUri}> .\n`;
    ttl += `<https://github.com/vliz-be-opsci/profile-registry> dcat:dataset <${profileUri}> .\n`;
  }
  return ttl;
}

function generateLinksetJson(profilesSet) {
  const profileList = Array.from(profilesSet).sort((a, b) => a.localeCompare(b));
  const linkset = {
    linkset: [
      {
        anchor: "https://github.com/vliz-be-opsci/profile-registry",
        describedby: [
          {
            href: "https://github.com/vliz-be-opsci/profile-registry/profiles/all/describedby.ttl",
            type: "text/turtle"
          }
        ],
        item: profileList.map((uri) => ({ href: uri }))
      }
    ]
  };
  return JSON.stringify(linkset, null, 2);
}

function generateLinksetText(profilesSet) {
  const profileList = Array.from(profilesSet).sort((a, b) => a.localeCompare(b));
  const links = [
    `<https://github.com/vliz-be-opsci/profile-registry/profiles/all/describedby.ttl>; rel="describedby"; type="text/turtle"; anchor="https://github.com/vliz-be-opsci/profile-registry"`
  ];
  for (const uri of profileList) {
    links.push(`<${uri}>; rel="item"; anchor="https://github.com/vliz-be-opsci/profile-registry"`);
  }
  return links.join(",\n");
}

await Promise.all([
  writeQuadVariantsFromNQuads(path.join(path.dirname(fileURLToPath(ALL_PROFILES_PATH)), "all_profiles_quads"), publishedNQuads),
  writeQuadVariantsFromNQuads(path.join(path.dirname(fileURLToPath(PROFILE_REGISTRY_TRIPLES_PATH)), "profile-registry-triples"), registryMetadata),
  writeFile(REGISTRY_CSV_PATH, csv, "utf8"),
  writeFile(DESCRIBEDBY_PATH, generateDescribedByTtl(profiles), "utf8"),
  writeFile(LINKSET_JSON_PATH, generateLinksetJson(profiles), "utf8"),
  writeFile(LINKSET_TXT_PATH, generateLinksetText(profiles), "utf8"),
]);

console.log(
  JSON.stringify(
    {
      filesProcessed: nqFiles.length,
      mergedTriples: publishedQuads.length,
      csvRows: csv.split("\n").filter(Boolean).length - 1,
      profilesCataloged: profiles.size,
    },
    null,
    2,
  ),
);
