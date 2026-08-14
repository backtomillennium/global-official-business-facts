import type { CompiledCatalogue } from "../src/catalogue/types";

export const fakeCatalogue: CompiledCatalogue = {
  generatedAt: "2026-08-14T00:00:00.000Z",
  jurisdictions: [{
    id: "TEST", slug: "test", iso2: null, iso3: null, m49: null,
    name: { canonical: "Test Jurisdiction", local: null }, jurisdictionType: "not_applicable",
    parentJurisdictionId: null, registryStructure: "test", researchStatus: "TEST_ONLY",
    lastReviewedAt: "2026-08-14", defaultIdentifierSchemeId: "test-id"
  }],
  accessMethods: [],
  registries: [{ id: "test-registry", jurisdictionId: "TEST", authority: { name: "Test Authority", type: "test" }, name: "Test Registry", registryRole: "test", scope: { geographic: "test", entityScope: "test", isPrimaryCompanyRegister: false } }],
  sources: [{ id: "test-source", registryId: "test-registry", authority: "Test Authority", name: "Test Source", sourceKind: "registry-api", sourceForm: "per-entity-query", official: false, machineReadable: true, recordScope: "test", url: "https://example.invalid/", accessMethodIds: [], licenceId: null, constraintIds: [], lastVerifiedAt: null }],
  identifierSchemes: [{ id: "test-id", jurisdictionId: "TEST", name: "Test ID", localName: null, kind: "business", format: { type: "alphanumeric", length: 8, pattern: "^DEMO-[0-9]{3}$" }, issuingAuthority: "Test Authority", searchableSourceIds: ["test-source"] }],
  licences: [], constraints: [], evidence: [], assessments: [],
  adapters: [{ id: "test-basic-v1", version: "1.0.0", normalizationVersion: "1", jurisdictionId: "TEST", supportedIdentifierSchemeIds: ["test-id"], sourceIds: ["test-source"], capabilities: { exactLookup: true, nameSearch: false, bulkSync: false, incrementalSync: false, documentFetch: false, historicalLookup: false }, scopeWarnings: ["TEST_DATA_ONLY"] }],
  adapterManifests: [{ adapterId: "test-basic-v1", jurisdictionId: "TEST", sourceIds: ["test-source"], identifierSchemeIds: ["test-id"], exposureProfileId: "basic-business-facts-v0", promotionState: "STAGING", enabledCapabilities: ["exactLookup"], technicalVerification: { status: "pass", verifiedAt: "2026-08-14", verificationRecordIds: [] }, policyVerification: { status: "pending", verifiedAt: null, verificationRecordIds: [] }, cachePolicy: { mode: "no-store" } }],
  exposureProfiles: [{ id: "basic-business-facts-v0", version: "0.1.0", allowedCanonicalFields: ["identifiers", "legalName", "status", "provenance", "warnings"], prohibitedFieldClasses: ["people"], personDataAllowed: false }],
  eligibilityAssessments: [], verificationRecords: []
};
