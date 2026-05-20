# Profile URI Registry Conventions

This registry follows a lightweight, RFC 7284-inspired model focused on practical interoperability.

## Minimum requirements for a valid submission

A profile registration is valid when it includes at least:

1. A **Profile URI** (for example: `urn:example:profile-uri` or `http://www.w3.org/ns/json-ld#expanded`)
2. An **`rdfs:type` declaration** describing the profile type

Submissions missing either the Profile URI or the `rdfs:type` declaration are considered incomplete and should not be registered.
