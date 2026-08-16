# GOBF — simple directory + manual review workbench

Target repository: `backtomillennium/global-official-business-facts`

Prepared against current main observed at:

`d8d56608b850b71097c3e86eeb7d8a6b9bbea782`

This package deliberately restructures the **public/static layer only**. It does not change the existing Worker API, payment code, production adapters, catalogue engine, `package.json`, or `package-lock.json`.

## New public shape

After `npm run build`, static output is only:

- `/index.html`
- `/styles.css`
- `/review.js`
- `/jurisdictions.json`
- `/_headers`

The old generated `/business/`, `/business/<jurisdiction>/`, `/privacy/`, `/support/`, and `/terms/` static pages are no longer generated.

The existing Worker continues serving `/api/*` exactly as before.

## Homepage

The homepage is one alphabetical A–Z jurisdiction list.

Each row contains:

- `確認可查`
- `有狀況`
- country + ISO code
- editable `查詢格式`
- official registry/source link when a URL was already available from the research seed

Review controls are local-only. They do not write to GitHub or Cloudflare.

## Local review persistence

Every checkbox change and query-format edit is immediately stored in browser `localStorage` under:

`gobf-jurisdiction-review-v1`

Editing a query format automatically marks its `formatSource` as `manual`.

A row counts as reviewed when either `確認可查` or `有狀況` is checked.

## Export / import

`Export JSON` creates:

`gobf-jurisdictions-reviewed.json`

with all 250 jurisdiction rows and the manual review results.

`Import JSON` restores that file into browser-local state, so review can move between devices without adding a backend.

## Seed coverage

- Jurisdictions: 250
- Official URLs seeded in this package: 187
- Query-format fields seeded from existing research: 48
- Remaining URL/format gaps are intentionally blank instead of invented.
- Current production `lookupAvailable=true`: Norway, Slovakia, Singapore only.

The seed is a working list, not a claim that every seeded URL is a working public company-search page. The point of this build is to let a human open each one and record the result.

## Files

### REPLACE

- `README.md`
- `scripts/build-static.ts`
- `src/static/styles.css`

### ADD

- `src/static/review.js`
- `data/directory/jurisdictions.seed.json`

### DO NOT CHANGE IN THIS RESTRUCTURE

- `src/index.ts`
- `src/http/**`
- `src/payment/**`
- `src/adapters/**`
- `src/sources/**`
- `data/catalogue/**`
- `data/production/**`
- `package.json`
- `package-lock.json`
- `wrangler.jsonc`

## Optional repository cleanup

See `DELETE-FILES.txt`.

Those files are old implementation/review reports. They are not required for the runtime. `SECURITY.md` should remain.

## Install from iPhone / Working Copy / GitHub

Copy the package files into the same repository paths, commit, and push.

Do not edit generated `dist/**` by hand. Cloudflare/GitHub build should regenerate it from `scripts/build-static.ts`.

Because no dependency was added, there is no lockfile update in this package.
