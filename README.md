# cpurr (cpurr Profile URI Resource Registry)
A recursive, machine-actionable open-science registry designed to index, validate, audit, and traverse semantic RDF profiles and catalogs.

`cpurr == cpurr profile-uri-resource-registry`

## Development

This project is configured for Bun-based workflows:

- `bun install`
- `bun run build`
- `bun run process-registration-issue`
- `bun run aggregate-profile-registry`

## Profiles storage layout

- `profiles/by-issue/{issue-number}.{nq|ttl|trig|jsonld}`: canonical per-issue harvested output
- `profiles/by-name/*.{nq|ttl|trig|jsonld}`: human-readable symlinks to per-issue files
- `profiles/all/*`: aggregated registry outputs
