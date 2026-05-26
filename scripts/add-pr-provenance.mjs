import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  buildProvenanceQuads,
  mergeNQuads,
} from "./registry-pipeline.mjs";
import { getIssueVariantPath, writeQuadVariantsFromNQuads } from "./profile-storage.mjs";

const issueNumber = Number(process.env.ISSUE_NUMBER || "");
const prNumber = Number(process.env.PR_NUMBER || "");
const repository = process.env.REPOSITORY || "vliz-be-opsci/profile-registry";

if (!issueNumber || !prNumber) {
  console.error("Missing ISSUE_NUMBER or PR_NUMBER.");
  process.exit(1);
}

const issueUrl = process.env.ISSUE_URL || `https://github.com/${repository}/issues/${issueNumber}`;
const prUrl = process.env.PR_URL || `https://github.com/${repository}/pull/${prNumber}`;

const nqPath = getIssueVariantPath(issueNumber, "nq");

try {
  const content = await readFile(nqPath, "utf8");

  let prProvenance = "";
  prProvenance += buildProvenanceQuads({
    issueUrl,
    prUrl,
  });

  if (prProvenance) {
    const updatedContent = mergeNQuads(content, prProvenance);
    const issueBasePath = path.join(path.dirname(nqPath.pathname), String(issueNumber));
    await writeQuadVariantsFromNQuads(issueBasePath, updatedContent);
    console.log(`Successfully added PR provenance to profiles/by-issue/${issueNumber}.nq`);
  } else {
    console.log("No PR provenance to add.");
  }
} catch (error) {
  console.error(`Error adding PR provenance: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
