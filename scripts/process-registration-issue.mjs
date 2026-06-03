import { updateProfileRegistryFromUri } from "./update-profile-registry.mjs";
import {
  extractProfileUriFromIssueBody,
  isAllowedProfileUri,
  extractIsResourceFromIssueBody,
} from "./registry-pipeline.mjs";
import fs from "node:fs/promises";

const issueBody = process.env.ISSUE_BODY || "";
const issueNumber = Number(process.env.ISSUE_NUMBER || "");
const profileUri = extractProfileUriFromIssueBody(issueBody);

if (!profileUri) {
  console.log("No profile URI found in issue body. Skipping.");
  process.exit(0);
}

if (!isAllowedProfileUri(profileUri)) {
  console.error(`Invalid profile URI in issue body: ${profileUri}`);
  process.exit(1);
}

if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
  console.error("Missing or invalid ISSUE_NUMBER for output file naming.");
  process.exit(1);
}

const isResource = extractIsResourceFromIssueBody(issueBody);
const result = await updateProfileRegistryFromUri(profileUri, issueNumber, { isResource });

await fs.writeFile("registration-summary.json", JSON.stringify(result, null, 2), "utf8");

console.log("=== Debug: All Gathered Data by wrx ===");
console.log(JSON.stringify(result.wrxDocuments, null, 2));

console.log(
  JSON.stringify(
    {
      issueNumber,
      profileUri,
      registeredProfiles: result.registeredProfiles,
      writtenTriples: result.writtenTriples,
      outputFile: result.outputFile,
      isResourceSubmission: result.isResourceSubmission,
      discoveredProfiles: result.discoveredProfiles,
    },
    null,
    2,
  ),
);
