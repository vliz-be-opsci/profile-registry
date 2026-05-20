import { readFile, writeFile } from "node:fs/promises";
import {
  parseNQuads,
  categorizeTypedResources,
  buildProvenanceQuads,
  mergeNQuads,
} from "./registry-pipeline.mjs";

const issueNumber = Number(process.env.ISSUE_NUMBER || "");
const prNumber = Number(process.env.PR_NUMBER || "");
const repository = process.env.REPOSITORY || "vliz-be-opsci/profile-registry";

if (!issueNumber || !prNumber) {
  console.error("Missing ISSUE_NUMBER or PR_NUMBER.");
  process.exit(1);
}

const issueUrl = process.env.ISSUE_URL || `https://github.com/${repository}/issues/${issueNumber}`;
const prUrl = process.env.PR_URL || `https://github.com/${repository}/pull/${prNumber}`;

const nqPath = new URL(`../profiles/issue-${issueNumber}.nq`, import.meta.url);

try {
  const content = await readFile(nqPath, "utf8");
  const quads = parseNQuads(content);
  const { profiles } = categorizeTypedResources(quads);

  let prProvenance = "";
  prProvenance += buildProvenanceQuads({
    issueUrl,
    prUrl,
  });

  if (prProvenance) {
    const updatedContent = mergeNQuads(content, prProvenance);
    await writeFile(nqPath, updatedContent, "utf8");
    console.log(`Successfully added PR provenance to profiles/issue-${issueNumber}.nq`);
  } else {
    console.log("No PR provenance to add.");
  }
} catch (error) {
  console.error(`Error adding PR provenance: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
