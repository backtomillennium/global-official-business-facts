import { DomainError } from "../../domain/errors";
import type { AddressValue, BusinessFactRecord, Fact } from "../../domain/types";
import type { AdapterContext, AdapterResult, BusinessAdapter, LookupRequest } from "../../lookup/types";
import {
  isJsonObject,
  optionalString,
  readJsonObject,
  requiredString,
  type JsonObject,
} from "../shared/json";

export const SINGAPORE_ADAPTER_ID = "sg-acra-opendata-v1";
export const SINGAPORE_SOURCE_ID = "sg-acra-datagovsg";
export const SINGAPORE_IDENTIFIER_SCHEME = "sg-uen";
export const SINGAPORE_RESOURCE_ID = "d_3f960c10fed6145404ca7b821f263b87";
const ENDPOINT = "https://data.gov.sg/api/action/datastore_search";
const REQUIRED_FIELDS = [
  "uen",
  "entity_name",
  "uen_status_desc",
  "entity_type_desc",
  "uen_issue_date",
  "reg_street_name",
  "reg_postal_code",
] as const;
const FRESHNESS_WARNING = "The Entities Registered with ACRA open-data resource is refreshed monthly and may lag BizFile+.";
const SCOPE_WARNING = "This is the Entities Registered with ACRA open-data publication through data.gov.sg, not a current or certified BizFile+ profile.";

function fact<T>(value: T, sourceValue: unknown, mappingConfidence: "high" | "medium" = "high"): Fact<T> {
  return {
    value,
    availability: "available-open-machine",
    origin: "official-source",
    sourceValue,
    sourceId: SINGAPORE_SOURCE_ID,
    asOf: null,
    mappingConfidence,
  };
}

function requireArray(object: JsonObject, key: string, maxItems: number): unknown[] {
  const value = object[key];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `data.gov.sg field is missing or invalid: ${key}`, { sourceId: SINGAPORE_SOURCE_ID });
  }
  return value;
}

function validateFieldBinding(result: JsonObject): void {
  const fields = requireArray(result, "fields", 256);
  const ids = new Set<string>();
  for (const field of fields) {
    if (!isJsonObject(field) || typeof field.id !== "string" || field.id.length > 128) {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", "data.gov.sg returned an invalid field definition", { sourceId: SINGAPORE_SOURCE_ID });
    }
    ids.add(field.id);
  }
  for (const required of REQUIRED_FIELDS) {
    if (!ids.has(required)) {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", `Verified ACRA field binding is no longer present: ${required}`, {
        sourceId: SINGAPORE_SOURCE_ID,
      });
    }
  }
}

function parseRecord(record: JsonObject, requestedUen: string, sourceUrl: string, retrievedAt: string): BusinessFactRecord {
  const uen = requiredString(record, "uen", SINGAPORE_SOURCE_ID, 32).toUpperCase();
  if (uen !== requestedUen) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "data.gov.sg returned a record for a different UEN", { sourceId: SINGAPORE_SOURCE_ID });
  }
  const legalName = requiredString(record, "entity_name", SINGAPORE_SOURCE_ID, 1_024);
  const statusLabel = optionalString(record, "uen_status_desc", SINGAPORE_SOURCE_ID, 256);
  const entityTypeLabel = optionalString(record, "entity_type_desc", SINGAPORE_SOURCE_ID, 512);
  const registrationDate = optionalString(record, "uen_issue_date", SINGAPORE_SOURCE_ID, 32);
  const street = optionalString(record, "reg_street_name", SINGAPORE_SOURCE_ID, 1_024);
  const postalCode = optionalString(record, "reg_postal_code", SINGAPORE_SOURCE_ID, 32);
  const facts: BusinessFactRecord["facts"] = { legalName: fact(legalName, legalName) };
  if (statusLabel) {
    facts.status = {
      value: { canonical: "other", sourceLabel: statusLabel },
      availability: "available-open-machine",
      origin: "derived",
      sourceValue: statusLabel,
      sourceId: SINGAPORE_SOURCE_ID,
      asOf: null,
      mappingConfidence: "medium",
      derivedFrom: ["uen_status_desc"],
      derivationMethod: "source-status-preservation",
      derivationVersion: "1",
    };
  }
  if (entityTypeLabel) facts.entityType = fact({ code: null, label: entityTypeLabel }, entityTypeLabel);
  if (registrationDate) facts.registrationDate = fact(registrationDate, registrationDate);
  if (street || postalCode) {
    const structured: Record<string, string> = {};
    if (street) structured.streetName = street;
    if (postalCode) structured.postalCode = postalCode;
    const address: AddressValue = {
      raw: [street, postalCode].filter((item): item is string => item !== null).join(", "),
      precision: "partial",
      structured,
    };
    facts.registeredAddress = fact(address, { reg_street_name: street, reg_postal_code: postalCode });
  }
  return {
    jurisdictionId: "SGP",
    identifiers: [{ schemeId: SINGAPORE_IDENTIFIER_SCHEME, kind: "business", value: uen, primaryForLookup: true }],
    facts,
    sourceSpecific: {
      [SINGAPORE_SOURCE_ID]: {
        fieldBinding: Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, field])),
        sourceStatus: statusLabel,
      },
    },
    provenance: {
      sourceIds: [SINGAPORE_SOURCE_ID],
      authority: "Accounting and Corporate Regulatory Authority (ACRA)",
      registry: "Entities Registered with ACRA",
      recordUrl: sourceUrl,
      retrievedAt,
      dataAsOf: null,
      sourceForm: "per-entity-query",
      origin: "official-source",
      adapterId: SINGAPORE_ADAPTER_ID,
      adapterVersion: "1.0.0",
      normalizationVersion: "1",
    },
    warnings: [FRESHNESS_WARNING, SCOPE_WARNING],
  };
}

export const singaporeAdapter: BusinessAdapter = {
  id: SINGAPORE_ADAPTER_ID,
  version: "1.0.0",
  normalizationVersion: "1",
  jurisdictionId: "SGP",
  supportedIdentifierSchemeIds: [SINGAPORE_IDENTIFIER_SCHEME],
  sourceIds: [SINGAPORE_SOURCE_ID],
  capabilities: {
    exactLookup: true,
    nameSearch: false,
    bulkSync: false,
    incrementalSync: false,
    documentFetch: false,
    historicalLookup: false,
  },
  validateIdentifier(input) {
    if (input.schemeId !== SINGAPORE_IDENTIFIER_SCHEME) return { ok: false, reason: "Expected sg-uen" };
    const normalizedValue = input.value.replace(/ /g, "").toUpperCase();
    if (!/^[A-Z0-9]{1,32}$/.test(normalizedValue)) {
      return { ok: false, reason: "Singapore UEN must be 1-32 ASCII alphanumeric characters after removing spaces" };
    }
    return { ok: true, normalizedValue };
  },
  async lookup(request: LookupRequest, context: AdapterContext): Promise<AdapterResult> {
    const startedAt = context.clock.now().toISOString();
    const url = new URL(ENDPOINT);
    url.searchParams.set("resource_id", SINGAPORE_RESOURCE_ID);
    url.searchParams.set("filters", JSON.stringify({ uen: request.identifier.value }));
    url.searchParams.set("limit", "1");
    const response = await context.fetcher.request(SINGAPORE_SOURCE_ID, {
      method: "GET",
      url: url.toString(),
      headers: { accept: "application/json" },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new DomainError("SOURCE_BAD_RESPONSE", "data.gov.sg returned an unexpected status", {
        sourceId: SINGAPORE_SOURCE_ID,
        upstreamStatus: response.status,
      });
    }
    const root = await readJsonObject(response, SINGAPORE_SOURCE_ID);
    if (root.success !== true) {
      throw new DomainError("SOURCE_BAD_RESPONSE", "data.gov.sg reported an API error", { sourceId: SINGAPORE_SOURCE_ID });
    }
    if (!isJsonObject(root.result)) {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", "data.gov.sg result object is missing", { sourceId: SINGAPORE_SOURCE_ID });
    }
    validateFieldBinding(root.result);
    const records = requireArray(root.result, "records", 1);
    if (records.length === 0) throw new DomainError("NOT_FOUND", "No ACRA open-data record was found for this UEN");
    if (!isJsonObject(records[0])) {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", "data.gov.sg record is not an object", { sourceId: SINGAPORE_SOURCE_ID });
    }
    const record = parseRecord(records[0], request.identifier.value, url.toString(), context.clock.now().toISOString());
    return {
      record,
      execution: {
        requestId: context.requestId,
        adapterId: SINGAPORE_ADAPTER_ID,
        adapterVersion: "1.0.0",
        normalizationVersion: "1",
        sourceIds: [SINGAPORE_SOURCE_ID],
        startedAt,
        completedAt: context.clock.now().toISOString(),
        cacheStatus: "bypass-no-store",
        warnings: [FRESHNESS_WARNING, SCOPE_WARNING],
      },
    };
  },
};
