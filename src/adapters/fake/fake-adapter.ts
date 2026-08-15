import { DomainError } from "../../domain/errors";
import type { BusinessAdapter } from "../../lookup/types";

export const fakeAdapter: BusinessAdapter = {
  id: "test-basic-v1",
  version: "1.0.0",
  normalizationVersion: "1",
  jurisdictionId: "TEST",
  supportedIdentifierSchemeIds: ["test-id"],
  sourceIds: ["test-source"],
  capabilities: {
    exactLookup: true,
    nameSearch: false,
    bulkSync: false,
    incrementalSync: false,
    documentFetch: false,
    historicalLookup: false,
  },
  validateIdentifier(input) {
    const value = input.value.trim().toUpperCase();
    return /^DEMO-[0-9]{3}$/.test(value)
      ? { ok: true, normalizedValue: value }
      : { ok: false, reason: "Expected TEST identifier in DEMO-000 format" };
  },
  async lookup(request, context) {
    const startedAt = context.clock.now().toISOString();
    if (request.identifier.value === "DEMO-404") throw new DomainError("NOT_FOUND", "Fake entity not found");
    const retrievedAt = context.clock.now().toISOString();
    const record = {
      jurisdictionId: "TEST",
      identifiers: [{ schemeId: "test-id", kind: "business" as const, value: request.identifier.value, primaryForLookup: true }],
      facts: {
        legalName: {
          value: "Example Test Entity",
          availability: "available-open-machine" as const,
          origin: "official-source" as const,
          sourceValue: "Example Test Entity",
          sourceId: "test-source",
          asOf: null,
        },
        status: {
          value: { canonical: "active", sourceLabel: "ACTIVE" },
          availability: "available-open-machine" as const,
          origin: "official-source" as const,
          sourceValue: "ACTIVE",
          sourceId: "test-source",
          asOf: null,
          mappingConfidence: "high" as const,
        },
      },
      sourceSpecific: {},
      provenance: {
        sourceIds: ["test-source"],
        authority: "Test Authority",
        registry: "Test Registry",
        recordUrl: null,
        retrievedAt,
        dataAsOf: null,
        sourceForm: "per-entity-query" as const,
        origin: "official-source" as const,
        adapterId: "test-basic-v1",
        adapterVersion: "1.0.0",
        normalizationVersion: "1",
      },
      warnings: ["TEST_DATA_ONLY"],
    };
    return {
      record,
      execution: {
        requestId: context.requestId,
        adapterId: "test-basic-v1",
        adapterVersion: "1.0.0",
        normalizationVersion: "1",
        sourceIds: ["test-source"],
        startedAt,
        completedAt: context.clock.now().toISOString(),
        cacheStatus: "bypass-no-store",
        warnings: ["TEST_DATA_ONLY"],
      },
    };
  },
};
