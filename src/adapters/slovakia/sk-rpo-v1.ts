import { DomainError } from "../../domain/errors";
import type { AddressValue, BusinessFactRecord, Fact } from "../../domain/types";
import type { AdapterContext, AdapterResult, BusinessAdapter, LookupRequest, UpstreamResponse } from "../../lookup/types";
import {
  isJsonObject,
  optionalObject,
  optionalString,
  readJsonObject,
  type JsonObject,
} from "../shared/json";

export const SLOVAKIA_ADAPTER_ID = "sk-rpo-v1";
export const SLOVAKIA_SOURCE_ID = "sk-rpo";
export const SLOVAKIA_IDENTIFIER_SCHEME = "sk-ico";
const BASE_URL = "https://api.statistics.sk/rpo/v1";
const FRESHNESS_WARNING = "Official RPO API is refreshed nightly and may lag the live register by up to 24 hours.";
const SCOPE_WARNING = "RPO is an aggregation register over multiple source registers, not a single commercial register.";

function fact<T>(value: T, sourceValue: unknown, asOf: string | null = null, mappingConfidence: "high" | "medium" = "high"): Fact<T> {
  return {
    value,
    availability: "available-open-machine",
    origin: "official-source",
    sourceValue,
    sourceId: SLOVAKIA_SOURCE_ID,
    asOf,
    mappingConfidence,
  };
}

function requiredArray(object: JsonObject, key: string, maxItems = 1_000): unknown[] {
  const value = object[key];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official RPO field is missing or invalid: ${key}`, { sourceId: SLOVAKIA_SOURCE_ID });
  }
  return value;
}

function optionalArray(object: JsonObject, key: string, maxItems = 1_000): unknown[] | null {
  const value = object[key];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official RPO field has an unexpected type: ${key}`, { sourceId: SLOVAKIA_SOURCE_ID });
  }
  return value;
}

function timedObjects(items: unknown[], fieldName: string): JsonObject[] {
  return items.map((item) => {
    if (!isJsonObject(item)) {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official RPO timed value is invalid: ${fieldName}`, { sourceId: SLOVAKIA_SOURCE_ID });
    }
    const validTo = item.validTo;
    if (validTo !== undefined && validTo !== null && typeof validTo !== "string") {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official RPO validTo value is invalid: ${fieldName}`, { sourceId: SLOVAKIA_SOURCE_ID });
    }
    return item;
  });
}

function currentTimed(items: unknown[], fieldName: string): JsonObject | null {
  const current = timedObjects(items, fieldName).filter((item) => item.validTo === undefined || item.validTo === null);
  return current[0] ?? null;
}

function currentTimedMatching(items: unknown[], fieldName: string, expected: string): JsonObject | null {
  const current = timedObjects(items, fieldName).filter((item) => item.validTo === undefined || item.validTo === null);
  for (const item of current) {
    if (optionalString(item, "value", SLOVAKIA_SOURCE_ID, 1_024) === expected) return item;
  }
  return null;
}

function sourceLabel(item: JsonObject | null): string | null {
  if (!item) return null;
  if (isJsonObject(item.value)) {
    const nestedLabel = optionalString(item.value, "value", SLOVAKIA_SOURCE_ID, 1_024);
    if (nestedLabel) return nestedLabel;
  }
  for (const key of ["label", "name", "description", "valueLabel"]) {
    const value = item[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || value.length > 1_024) {
      throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official RPO label field has an unexpected type: ${key}`, { sourceId: SLOVAKIA_SOURCE_ID });
    }
    return value;
  }
  return null;
}

function codeValue(item: JsonObject): { code: string | null; label: string | null } {
  if (isJsonObject(item.value)) {
    return {
      code: optionalString(item.value, "code", SLOVAKIA_SOURCE_ID, 128),
      label: optionalString(item.value, "value", SLOVAKIA_SOURCE_ID, 1_024),
    };
  }
  return {
    code: optionalString(item, "value", SLOVAKIA_SOURCE_ID, 128),
    label: sourceLabel(item),
  };
}

function internalIdFromSearch(search: JsonObject): string {
  const results = requiredArray(search, "results", 500);
  if (results.length === 0) throw new DomainError("NOT_FOUND", "No RPO entity was found for this IČO");
  const first = results[0];
  if (!isJsonObject(first)) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official RPO search result is not an object", { sourceId: SLOVAKIA_SOURCE_ID });
  }
  const id = first.id;
  if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) return String(id);
  if (typeof id === "string" && /^[0-9]{1,32}$/.test(id)) return id;
  throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official RPO search result has an invalid internal id", { sourceId: SLOVAKIA_SOURCE_ID });
}

function addressFrom(entity: JsonObject): Fact<AddressValue> | undefined {
  const addresses = optionalArray(entity, "addresses", 100);
  if (!addresses) return undefined;
  // The request explicitly excludes historical data. If an upstream response
  // nevertheless contains only ended addresses, do not relabel one as current.
  const address = currentTimed(addresses, "addresses");
  if (!address) return undefined;
  const formatted = optionalString(address, "formatedAddress", SLOVAKIA_SOURCE_ID, 2_048);
  if (!formatted) return undefined;
  return fact({ raw: formatted, precision: "full", structured: null }, address);
}

function statusFrom(entity: JsonObject): Fact<{ canonical: string; sourceLabel: string | null }> | undefined {
  const termination = optionalString(entity, "termination", SLOVAKIA_SOURCE_ID, 32);
  const statuses = optionalArray(entity, "legalStatuses", 100);
  const current = statuses ? currentTimed(statuses, "legalStatuses") : null;
  if (!termination && !current) return undefined;
  const label = sourceLabel(current);
  return {
    value: { canonical: termination ? "dissolved" : "other", sourceLabel: label },
    availability: "available-open-machine",
    origin: "derived",
    sourceValue: current,
    sourceId: SLOVAKIA_SOURCE_ID,
    asOf: null,
    mappingConfidence: termination ? "high" : "medium",
    derivedFrom: termination ? ["termination", "legalStatuses"] : ["legalStatuses"],
    derivationMethod: termination ? "termination-precedence-map" : "source-status-preservation",
    derivationVersion: "1",
  };
}

function parseEntity(entity: JsonObject, requestedIco: string, retrievedAt: string): BusinessFactRecord {
  const identifiers = requiredArray(entity, "identifiers", 100);
  const identifierEntry = currentTimedMatching(identifiers, "identifiers", requestedIco);
  if (!identifierEntry) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official RPO entity has no current matching IČO", { sourceId: SLOVAKIA_SOURCE_ID });
  }
  const currentName = currentTimed(requiredArray(entity, "fullNames", 100), "fullNames");
  if (!currentName) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official RPO entity has no current legal name", { sourceId: SLOVAKIA_SOURCE_ID });
  }
  const legalName = optionalString(currentName, "value", SLOVAKIA_SOURCE_ID, 1_024);
  if (!legalName) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official RPO current legal name is invalid", { sourceId: SLOVAKIA_SOURCE_ID });
  }

  const facts: BusinessFactRecord["facts"] = { legalName: fact(legalName, currentName) };
  const status = statusFrom(entity);
  if (status) facts.status = status;
  const forms = optionalArray(entity, "legalForms", 100);
  const currentForm = forms ? currentTimed(forms, "legalForms") : null;
  if (currentForm) {
    const { code, label } = codeValue(currentForm);
    if (code || label) facts.entityType = fact({ code, label }, currentForm);
  }
  const establishment = optionalString(entity, "establishment", SLOVAKIA_SOURCE_ID, 32);
  if (establishment) facts.registrationDate = fact(establishment, establishment);
  const address = addressFrom(entity);
  if (address) facts.registeredAddress = address;
  const statisticalCodes = optionalObject(entity, "statisticalCodes", SLOVAKIA_SOURCE_ID);
  const mainActivity = statisticalCodes ? optionalObject(statisticalCodes, "mainActivity", SLOVAKIA_SOURCE_ID) : null;
  const industryCode = mainActivity
    ? optionalString(mainActivity, "code", SLOVAKIA_SOURCE_ID, 128) ?? optionalString(mainActivity, "value", SLOVAKIA_SOURCE_ID, 128)
    : null;
  if (industryCode) facts.industryCodes = fact([industryCode], mainActivity);

  const entityId = entity.id;
  const recordUrl = (typeof entityId === "number" && Number.isSafeInteger(entityId)) || (typeof entityId === "string" && /^[0-9]+$/.test(entityId))
    ? `${BASE_URL}/entity/${String(entityId)}`
    : null;
  return {
    jurisdictionId: "SVK",
    identifiers: [{ schemeId: SLOVAKIA_IDENTIFIER_SCHEME, kind: "company", value: requestedIco, primaryForLookup: true }],
    facts,
    sourceSpecific: {
      [SLOVAKIA_SOURCE_ID]: {
        identifierTimedValue: identifierEntry,
        legalNameTimedValue: currentName,
        legalStatusTimedValue: status?.sourceValue ?? null,
        termination: optionalString(entity, "termination", SLOVAKIA_SOURCE_ID, 32),
      },
    },
    provenance: {
      sourceIds: [SLOVAKIA_SOURCE_ID],
      authority: "Ministry of Interior of the Slovak Republic",
      registry: "Register právnických osôb (RPO)",
      recordUrl,
      retrievedAt,
      dataAsOf: null,
      sourceForm: "per-entity-query",
      origin: "official-source",
      adapterId: SLOVAKIA_ADAPTER_ID,
      adapterVersion: "1.0.0",
      normalizationVersion: "1",
    },
    warnings: [FRESHNESS_WARNING, SCOPE_WARNING],
  };
}

function assertSuccessful(response: UpstreamResponse, stage: "search" | "entity"): void {
  if (response.status === 404) throw new DomainError("NOT_FOUND", "No RPO entity was found for this IČO");
  if (response.status < 200 || response.status >= 300) {
    throw new DomainError("SOURCE_BAD_RESPONSE", `Official RPO ${stage} returned an unexpected status`, {
      sourceId: SLOVAKIA_SOURCE_ID,
      upstreamStatus: response.status,
    });
  }
}

export const slovakiaAdapter: BusinessAdapter = {
  id: SLOVAKIA_ADAPTER_ID,
  version: "1.0.0",
  normalizationVersion: "1",
  jurisdictionId: "SVK",
  supportedIdentifierSchemeIds: [SLOVAKIA_IDENTIFIER_SCHEME],
  sourceIds: [SLOVAKIA_SOURCE_ID],
  capabilities: {
    exactLookup: true,
    nameSearch: false,
    bulkSync: false,
    incrementalSync: false,
    documentFetch: false,
    historicalLookup: false,
  },
  validateIdentifier(input) {
    if (input.schemeId !== SLOVAKIA_IDENTIFIER_SCHEME) return { ok: false, reason: "Expected sk-ico" };
    const value = input.value.trim();
    if (!/^[0-9 ]+$/.test(value)) return { ok: false, reason: "Slovak IČO contains unsupported characters" };
    const normalizedValue = value.replace(/ /g, "");
    return /^[0-9]{8}$/.test(normalizedValue)
      ? { ok: true, normalizedValue }
      : { ok: false, reason: "Slovak IČO must contain exactly 8 digits" };
  },
  async lookup(request: LookupRequest, context: AdapterContext): Promise<AdapterResult> {
    const startedAt = context.clock.now().toISOString();
    const searchResponse = await context.fetcher.request(SLOVAKIA_SOURCE_ID, {
      method: "GET",
      url: `${BASE_URL}/search?identifier=${encodeURIComponent(request.identifier.value)}`,
      headers: { accept: "application/json" },
    });
    assertSuccessful(searchResponse, "search");
    const search = await readJsonObject(searchResponse, SLOVAKIA_SOURCE_ID);
    const internalId = internalIdFromSearch(search);
    const entityResponse = await context.fetcher.request(SLOVAKIA_SOURCE_ID, {
      method: "GET",
      url: `${BASE_URL}/entity/${internalId}?showHistoricalData=false&showOrganizationUnits=false`,
      headers: { accept: "application/json" },
    });
    assertSuccessful(entityResponse, "entity");
    const entity = await readJsonObject(entityResponse, SLOVAKIA_SOURCE_ID);
    const record = parseEntity(entity, request.identifier.value, context.clock.now().toISOString());
    return {
      record,
      execution: {
        requestId: context.requestId,
        adapterId: SLOVAKIA_ADAPTER_ID,
        adapterVersion: "1.0.0",
        normalizationVersion: "1",
        sourceIds: [SLOVAKIA_SOURCE_ID],
        startedAt,
        completedAt: context.clock.now().toISOString(),
        cacheStatus: "bypass-no-store",
        warnings: [FRESHNESS_WARNING, SCOPE_WARNING],
      },
    };
  },
};
