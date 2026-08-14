export type JurisdictionType =
  | "sovereign"
  | "territory_or_dependency"
  | "special_administrative_region"
  | "constituent_country"
  | "crown_dependency"
  | "autonomous_territory"
  | "disputed_territory"
  | "de_facto_jurisdiction"
  | "parent_administered"
  | "not_applicable"
  | "unknown";

export interface Jurisdiction {
  id: string;
  slug: string;
  iso2: string | null;
  iso3: string | null;
  m49: string | null;
  name: { canonical: string; local: string | null };
  jurisdictionType: JurisdictionType;
  parentJurisdictionId: string | null;
  registryStructure: string;
  researchStatus: string;
  lastReviewedAt: string | null;
  defaultIdentifierSchemeId: string | null;
}

export interface Registry {
  id: string;
  jurisdictionId: string;
  authority: { name: string; type: string };
  name: string;
  registryRole: string;
  scope: {
    geographic: string;
    entityScope: string;
    isPrimaryCompanyRegister: boolean;
  };
}

export interface AccessMethod {
  id: string;
  sourceId: string;
  type:
    | "REST"
    | "SOAP"
    | "GraphQL"
    | "OData"
    | "SPARQL"
    | "bulk-file"
    | "CKAN"
    | "direct-download"
    | "HTML-search"
    | "document-download"
    | "other";
  endpoint: string | null;
  authentication: {
    type:
      | "none"
      | "api-key"
      | "application-id"
      | "oauth2"
      | "account"
      | "contract"
      | "static-ip"
      | "certificate"
      | "session"
      | "other"
      | "unknown";
    required: boolean | null;
    registration: "none" | "free" | "paid" | "manual-approval" | "contract" | "unknown";
    credentialRef: string | null;
  };
  formats: string[];
  rateLimit: { status: "stated" | "not-stated" | "unknown"; requests: number | null; windowSeconds: number | null };
}

export type SourceKind =
  | "registry-api"
  | "government-open-data-api"
  | "bulk"
  | "web-search"
  | "document-download"
  | "authorised-intermediary"
  | "commercial-api"
  | "other";

export type SourceForm =
  | "state-snapshot"
  | "bulk-snapshot"
  | "per-entity-query"
  | "event-stream"
  | "event-stream-derived"
  | "mixed"
  | "unknown";

export interface Source {
  id: string;
  registryId: string;
  authority: string;
  name: string;
  sourceKind: SourceKind;
  sourceForm: SourceForm;
  official: boolean;
  machineReadable: boolean;
  recordScope: string;
  url: string;
  accessMethodIds: string[];
  licenceId: string | null;
  constraintIds: string[];
  lastVerifiedAt: string | null;
}

export type IdentifierKind =
  | "company"
  | "business"
  | "commercial-register"
  | "legal-entity"
  | "tax"
  | "vat"
  | "establishment"
  | "statistical"
  | "branch"
  | "other";

export interface IdentifierScheme {
  id: string;
  jurisdictionId: string;
  name: string;
  localName: string | null;
  kind: IdentifierKind;
  format: {
    type: "numeric" | "alphanumeric" | "other";
    length: number | null;
    pattern: string | null;
  };
  issuingAuthority: string | null;
  searchableSourceIds: string[];
}

export type PermissionState =
  | "allowed"
  | "conditional"
  | "restricted"
  | "prohibited"
  | "unclear"
  | "not-stated";

export interface Licence {
  id: string;
  name: string;
  version: string | null;
  status:
    | "verified-open-licence"
    | "open-data-regime-text-not-verified"
    | "conditional"
    | "restricted"
    | "no-licence-found"
    | "unclear";
  commercialReuse: PermissionState;
  redistribution: PermissionState;
  caching: PermissionState;
  attributionRequired: boolean | null;
  attributionText: string | null;
  attributionStatus: "verified" | "not-verified" | "not-applicable";
  sourceUrl: string | null;
  verifiedAt: string | null;
}

export interface AccessConstraint {
  id: string;
  type: string;
  scopeType: "jurisdiction" | "registry" | "source" | "field" | "person-data" | "document";
  scopeId: string;
  description: string;
  severity: "informational" | "operational" | "policy-blocking";
  sourceUrl: string | null;
  verifiedAt: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
}

export interface Evidence {
  id: string;
  claimType: string;
  subjectType: string;
  subjectId: string;
  value: unknown;
  sourceUrl: string;
  sourceAuthority: string;
  checkedAt: string;
  confidence: "high" | "medium" | "low" | "unknown";
  evidenceClass: "first-party" | "first-party-partial" | "secondary" | "conflicting" | "unverified";
}

export interface ResearchAssessment {
  jurisdictionId: string;
  publicness: { total: number | null; tier: string | null };
  integrationGrade: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
  researchCompleteness: string;
  checkedAt: string;
}

export type AdapterPromotionState =
  | "RESEARCH_ONLY"
  | "IMPLEMENTATION_CANDIDATE"
  | "TECHNICALLY_VERIFIED"
  | "POLICY_VERIFIED"
  | "STAGING"
  | "PRODUCTION"
  | "DEFERRED"
  | "BLOCKED"
  | "DISABLED"
  | "DEPRECATED";

export interface AdapterCapabilities {
  exactLookup: boolean;
  nameSearch: boolean;
  bulkSync: boolean;
  incrementalSync: boolean;
  documentFetch: boolean;
  historicalLookup: boolean;
}

export interface AdapterDefinition {
  id: string;
  version: string;
  normalizationVersion: string;
  jurisdictionId: string;
  supportedIdentifierSchemeIds: string[];
  sourceIds: string[];
  capabilities: AdapterCapabilities;
  scopeWarnings: string[];
}

export interface AdapterManifest {
  adapterId: string;
  jurisdictionId: string;
  sourceIds: string[];
  identifierSchemeIds: string[];
  exposureProfileId: string;
  promotionState: AdapterPromotionState;
  enabledCapabilities: Array<keyof AdapterCapabilities>;
  technicalVerification: {
    status: GateResult;
    verifiedAt: string | null;
    verificationRecordIds: string[];
  };
  policyVerification: {
    status: GateResult;
    verifiedAt: string | null;
    verificationRecordIds: string[];
  };
  cachePolicy: { mode: "no-store" } | { mode: "ttl"; ttlSeconds: number; reason: string };
}

export interface ExposureProfile {
  id: string;
  version: string;
  allowedCanonicalFields: string[];
  prohibitedFieldClasses: string[];
  personDataAllowed: boolean;
}

export type GateResult = "pass" | "fail" | "pending" | "not-applicable";

export interface ProductionEligibilityAssessment {
  adapterId: string;
  assessedAt: string;
  sourceScope: GateResult;
  identifier: GateResult;
  technical: GateResult;
  automation: GateResult;
  commercialUse: GateResult;
  responseRedistribution: GateResult;
  attribution: GateResult;
  exposureSafety: GateResult;
  provenance: GateResult;
  adapterQuality: GateResult;
  operational: GateResult;
  cache: "no-store" | "verified-cacheable" | "blocked" | "pending";
  decision: "eligible" | "deferred" | "blocked";
  blockers: string[];
  warnings: string[];
  evidenceIds: string[];
}

export interface VerificationRecord {
  id: string;
  subjectId: string;
  checkedAt: string;
  claims: Array<{ claim: string; result: GateResult; evidenceIds: string[] }>;
  verdict: "pass" | "deferred" | "blocked";
}

export type FieldAvailability =
  | "available-open-machine"
  | "available-machine-auth-required"
  | "available-human-only"
  | "available-paid"
  | "available-separate-register"
  | "withheld-by-law-or-privacy"
  | "not-in-open-channel"
  | "not-published"
  | "not-found"
  | "known-null"
  | "unknown"
  | "not-applicable";

export type FactOrigin = "official-source" | "derived";

export interface Fact<T> {
  value: T | null;
  availability: FieldAvailability;
  origin: FactOrigin;
  sourceValue: unknown;
  sourceId: string;
  asOf: string | null;
  mappingConfidence?: "high" | "medium" | "low" | "unknown";
  derivedFrom?: string[];
  derivationMethod?: string;
  derivationVersion?: string;
}

export interface AddressValue {
  raw: string | null;
  precision:
    | "full"
    | "partial"
    | "postcode"
    | "postcode-prefix"
    | "locality-only"
    | "identifier-only"
    | "unknown";
  structured: Record<string, string> | null;
}

export interface Provenance {
  sourceIds: string[];
  authority: string;
  registry: string;
  recordUrl: string | null;
  retrievedAt: string;
  dataAsOf: string | null;
  sourceForm: SourceForm;
  origin: FactOrigin;
}

export interface BusinessFactRecord {
  jurisdictionId: string;
  identifiers: Array<{
    schemeId: string;
    kind: IdentifierKind;
    value: string;
    primaryForLookup: boolean;
  }>;
  facts: {
    legalName: Fact<string>;
    status?: Fact<{ canonical: string; sourceLabel: string | null }>;
    entityType?: Fact<string>;
    registrationDate?: Fact<string>;
    registeredAddress?: Fact<AddressValue>;
    industryCodes?: Fact<string[]>;
  };
  sourceSpecific: Record<string, Record<string, unknown>>;
  provenance: Provenance;
  warnings: string[];
}
