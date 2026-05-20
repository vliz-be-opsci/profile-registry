import { updateProfileRegistryFromUri } from "./update-profile-registry.mjs";
import {
  extractProfileUriFromIssueBody,
  isAllowedProfileUri,
} from "./registry-pipeline.mjs";

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

const result = await updateProfileRegistryFromUri(profileUri, issueNumber);
console.log(
  JSON.stringify(
    {
      issueNumber,
      profileUri,
      registeredProfiles: result.registeredProfiles,
      writtenTriples: result.writtenTriples,
      outputFile: result.outputFile,
    },
    null,
    2,
  ),
);
