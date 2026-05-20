import { updateProfileRegistryFromUri } from "./update-profile-registry.mjs";
import {
  extractProfileUriFromIssueBody,
  isAllowedProfileUri,
} from "./registry-pipeline.mjs";

const issueBody = process.env.ISSUE_BODY || "";
const profileUri = extractProfileUriFromIssueBody(issueBody);

if (!profileUri) {
  console.log("No profile URI found in issue body. Skipping.");
  process.exit(0);
}

if (!isAllowedProfileUri(profileUri)) {
  console.error(`Invalid profile URI in issue body: ${profileUri}`);
  process.exit(1);
}

const result = await updateProfileRegistryFromUri(profileUri);
console.log(
  JSON.stringify(
    {
      profileUri,
      registeredProfiles: result.registeredProfiles,
      writtenTriples: result.writtenTriples,
    },
    null,
    2,
  ),
);
