# Profile URI Registry Conventions

This registry follows a lightweight, RFC 7284-inspired model focused on practical interoperability.

## Published registry triples

The aggregated `profiles/all/all_profiles_quads.nq` output must include triples about the registry resource itself:

1. A registry resource URI (`https://github.com/vliz-be-opsci/profile-registry#registry`)
2. An RDF type linking the registry to the RFC 7284 Profile URIs Registry concept
3. An `rdfs:seeAlso` link to `https://datatracker.ietf.org/doc/html/rfc7284`
4. RFC 7284 `#uri` links from the registry resource to each discovered profile URI

## Minimum requirements for a valid submission

A profile registration is valid when it includes at least:

1. A **Profile URI** (for example: `urn:example:profile-uri` or `http://www.w3.org/ns/json-ld#expanded`)
2. An **`rdfs:type` declaration** describing the profile type

Submissions missing either the Profile URI or the `rdfs:type` declaration are considered incomplete and should not be registered.
