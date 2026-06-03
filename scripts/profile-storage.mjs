import { mkdir, lstat, readlink, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseNQuads,
  serializeQuadsToJsonLd,
  serializeQuadsToNQuads,
  serializeQuadsToTriG,
  serializeQuadsToTurtle,
} from "./registry-pipeline.mjs";

export const PROFILES_DIR = new URL("../profiles/", import.meta.url);
export const BY_ISSUE_DIR = new URL("../profiles/by-issue/", import.meta.url);
export const BY_NAME_DIR = new URL("../profiles/by-name/", import.meta.url);
export const ALL_DIR = new URL("../profiles/all/", import.meta.url);

const VARIANT_EXTENSIONS = ["nq", "ttl", "trig", "jsonld"];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function deriveCommonName(profileUri, issueNumber) {
  if (!profileUri) {
    return `profile-${issueNumber}`;
  }
  if (/^urn:/i.test(profileUri)) {
    const urnName = slugify(profileUri.replace(/^urn:/i, "urn-"));
    return urnName || `profile-${issueNumber}`;
  }
  try {
    const uri = new URL(profileUri);
    const uriName = slugify(`${uri.hostname}${uri.pathname}`);
    return uriName || `profile-${issueNumber}`;
  } catch {
    return slugify(profileUri) || `profile-${issueNumber}`;
  }
}

import { fileURLToPath } from "node:url";

function toPath(url) {
  return fileURLToPath(url);
}

export function getIssueVariantPath(issueNumber, extension) {
  return new URL(`${issueNumber}.${extension}`, BY_ISSUE_DIR);
}

export function getAggregateVariantPath(baseName, extension) {
  return new URL(`${baseName}.${extension}`, ALL_DIR);
}

export async function ensureProfilesDirectories() {
  await Promise.all([
    mkdir(PROFILES_DIR, { recursive: true }),
    mkdir(BY_ISSUE_DIR, { recursive: true }),
    mkdir(BY_NAME_DIR, { recursive: true }),
    mkdir(ALL_DIR, { recursive: true }),
  ]);
}

export async function writeQuadVariantsFromNQuads(basePathWithoutExtension, nquadsContent) {
  const quads = parseNQuads(nquadsContent);
  const variants = {
    nq: serializeQuadsToNQuads(quads),
    ttl: serializeQuadsToTurtle(quads),
    trig: serializeQuadsToTriG(quads),
    jsonld: await serializeQuadsToJsonLd(quads),
  };

  await Promise.all(
    Object.entries(variants).map(([extension, content]) =>
      writeFile(`${basePathWithoutExtension}.${extension}`, content, "utf8"),
    ),
  );

  return variants;
}

async function ensureSymlink(linkPath, targetPath) {
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath);
  try {
    const stats = await lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      return false;
    }
    const existingTarget = await readlink(linkPath);
    if (existingTarget === relativeTarget) {
      return true;
    }
    await unlink(linkPath);
  } catch {
    // Link does not exist yet.
  }

  try {
    await symlink(relativeTarget, linkPath);
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      console.warn(`Warning: Symbolic link creation failed due to lack of permissions on Windows. Please enable Developer Mode or run as Administrator to create symlinks.`);
      return false;
    }
    throw error;
  }
  return true;
}

export async function updateByNameSymlinks(profileUris, issueNumber) {
  const names = new Set();
  const uris = Array.from(profileUris).sort((a, b) => a.localeCompare(b));

  for (const profileUri of uris) {
    let baseName = deriveCommonName(profileUri, issueNumber);
    if (!baseName) {
      continue;
    }
    let suffix = 1;
    while (names.has(baseName)) {
      suffix += 1;
      baseName = `${deriveCommonName(profileUri, issueNumber)}-${suffix}`;
    }
    names.add(baseName);

    for (const extension of VARIANT_EXTENSIONS) {
      const targetPath = toPath(getIssueVariantPath(issueNumber, extension));
      const linkPath = path.join(toPath(BY_NAME_DIR), `${baseName}.${extension}`);
      await ensureSymlink(linkPath, targetPath);
    }
  }
}
