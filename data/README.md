# Data boundaries

- `catalogue/` is the curated, version-controlled product catalogue.
- `research/` stores source research snapshots and is never runtime production truth.
- `verification/` stores source/licence/candidate verification artifacts.
- `production/` is reserved for explicit production manifests/decisions.

No research importer may directly promote an adapter to `PRODUCTION`.
