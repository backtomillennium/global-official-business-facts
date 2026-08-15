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

function compactStatusSourceValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.value === "string" || typeof record.value === "number" || typeof record.value === "boolean") return record.value;
  if (typeof record.value === "object" && record.value !== null && !Array.isArray(record.value)) {
    const nested = record.value as Record<string, unknown>;
    if (typeof nested.code === "string") return nested.code;
    if (typeof nested.value === "string") return nested.value;
  }
  return null;
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
    facts.status = {
      canonical: status.value.canonical,
      sourceValue: compactStatusSourceValue(status.sourceValue),
      sourceLabel: status.value.sourceLabel,
    };
  }
  const optional: Array<[string, unknown]> = [
    ["entityType", publicFact(record.facts.entityType)],
    ["registrationDate", publicFact(record.facts.registrationDate)],
    ["registeredAddress", publicFact(record.facts.registeredAddress)],
    ["industryCodes", publicFact(record.facts.industryCodes)],
  ];
  for (const [key, value] of optional) if (allowed.has(key) && value !== undefined) facts[key] = value;

  if (!jurisdiction.iso2) throw new Error("Production jurisdiction is missing ISO2");
  const sourceId = record.provenance.sourceIds[0];
  if (!sourceId) throw new Error("BusinessFactRecord has no source");
  const source = catalogue.getSource(sourceId);
  if (!source) throw new Error(`Catalogue source missing: ${sourceId}`);
  const licence = source.licenceId ? catalogue.data.licences.find((item) => item.id === source.licenceId) : undefined;
  if (!licence?.attributionText) throw new Error(`Verified attribution missing for source: ${sourceId}`);
  const accessDate = record.provenance.retrievedAt.slice(0, 10);
  const attributionText = licence.attributionText.replaceAll("{date}", accessDate);
  const licenceLabel = [licence.name, licence.version].filter(Boolean).join(" ");

  return {
    schemaVersion: "1",
    jurisdiction: { id: jurisdiction.id, iso2: jurisdiction.iso2, name: jurisdiction.name.canonical },
    identifier: { scheme: primary.schemeId, kind: primary.kind, value: primary.value },
    facts,
    source: {
      authority: record.provenance.authority,
      sourceId,
      sourceUrl: record.provenance.recordUrl ?? source.url,
      retrievedAt: record.provenance.retrievedAt,
    },
    warnings: record.warnings,
    attribution: {
      required: licence.attributionRequired === true,
      text: attributionText,
      licence: licenceLabel,
    },
  };
}
