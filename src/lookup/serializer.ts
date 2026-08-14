import type { Catalogue } from "../catalogue/catalogue";
import type { BusinessFactRecord, ExposureProfile, Fact } from "../domain/types";
import type { PublicBusinessResponse } from "./types";

function publicFact<T>(fact: Fact<T> | undefined): unknown {
  if (!fact || fact.availability === "unknown" || fact.availability === "not-in-open-channel" || fact.availability === "not-published") {
    return undefined;
  }
  if (fact.value === null) return null;
  return fact.value;
}

export function serializeBusinessRecord(record: BusinessFactRecord, catalogue: Catalogue, profile?: ExposureProfile): PublicBusinessResponse {
  const jurisdiction = catalogue.requireJurisdiction(record.jurisdictionId);
  const primary = record.identifiers.find((item) => item.primaryForLookup) ?? record.identifiers[0];
  if (!primary) throw new Error("BusinessFactRecord has no identifier");

  const allowed = new Set(profile?.allowedCanonicalFields ?? ["legalName", "status", "entityType", "registrationDate", "registeredAddress", "industryCodes"]);
  const facts: Record<string, unknown> = {};
  if (allowed.has("legalName")) facts.legalName = publicFact(record.facts.legalName);
  const status = record.facts.status;
  if (allowed.has("status") && status && status.value !== null) {
    facts.status = { value: status.value.canonical, sourceValue: status.sourceValue };
  }
  const optional: Array<[string, unknown]> = [
    ["entityType", publicFact(record.facts.entityType)],
    ["registrationDate", publicFact(record.facts.registrationDate)],
    ["registeredAddress", publicFact(record.facts.registeredAddress)],
    ["industryCodes", publicFact(record.facts.industryCodes)],
  ];
  for (const [key, value] of optional) if (allowed.has(key) && value !== undefined) facts[key] = value;

  return {
    jurisdiction: { id: jurisdiction.id, iso2: jurisdiction.iso2 },
    identifier: { scheme: primary.schemeId, kind: primary.kind, value: primary.value },
    facts,
    source: {
      authority: record.provenance.authority,
      registry: record.provenance.registry,
      sourceIds: record.provenance.sourceIds,
      retrievedAt: record.provenance.retrievedAt,
      dataAsOf: record.provenance.dataAsOf,
    },
    warnings: record.warnings,
  };
}
