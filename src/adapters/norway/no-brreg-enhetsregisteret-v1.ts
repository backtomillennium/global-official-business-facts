import { DomainError } from "../../domain/errors";
import type { AddressValue, BusinessFactRecord, Fact } from "../../domain/types";
import type { AdapterContext, AdapterResult, BusinessAdapter, LookupRequest } from "../../lookup/types";
import {
  isJsonObject,
  optionalBoolean,
  optionalObject,
  optionalString,
  optionalStringArray,
  readJsonObject,
  requiredString,
  type JsonObject,
} from "../shared/json";

export const NORWAY_ADAPTER_ID = "no-brreg-enhetsregisteret-v1";
export const NORWAY_SOURCE_ID = "no-brreg-enhetsregisteret";
export const NORWAY_IDENTIFIER_SCHEME = "no-organisasjonsnummer";
export const NORWAY_ACCEPT = "application/vnd.brreg.enhetsregisteret.enhet.v2+json";
const BASE_URL = "https://data.brreg.no/enhetsregisteret/api/enheter/";
const SCOPE_WARNING = "Enhetsregisteret is Norway's national legal-entity register and is not limited to companies.";

type CanonicalStatus = "bankruptcy" | "in-liquidation" | "compulsory-liquidation" | "dissolved" | "active";

function fact<T>(value: T, sourceValue: unknown, asOf: string | null = null): Fact<T> {
  return {
    value,
    availability: "available-open-machine",
    origin: "official-source",
    sourceValue,
    sourceId: NORWAY_SOURCE_ID,
    asOf,
    mappingConfidence: "high",
  };
}

function statusFrom(entity: JsonObject): { canonical: CanonicalStatus; sourceValue: Record<string, unknown> } {
  const konkurs = optionalBoolean(entity, "konkurs", NORWAY_SOURCE_ID);
  const underAvvikling = optionalBoolean(entity, "underAvvikling", NORWAY_SOURCE_ID);
  const compulsory = optionalBoolean(entity, "underTvangsavviklingEllerTvangsopplosning", NORWAY_SOURCE_ID);
  const slettedato = optionalString(entity, "slettedato", NORWAY_SOURCE_ID, 32);
  const sourceValue = { konkurs, underAvvikling, underTvangsavviklingEllerTvangsopplosning: compulsory, slettedato };
  if (konkurs === true) return { canonical: "bankruptcy", sourceValue };
  if (underAvvikling === true) return { canonical: "in-liquidation", sourceValue };
  if (compulsory === true) return { canonical: "compulsory-liquidation", sourceValue };
  if (slettedato !== null) return { canonical: "dissolved", sourceValue };
  return { canonical: "active", sourceValue };
}

function addressFrom(entity: JsonObject): Fact<AddressValue> | undefined {
  const address = optionalObject(entity, "forretningsadresse", NORWAY_SOURCE_ID);
  if (!address) return undefined;
  const lines = optionalStringArray(address, "adresse", NORWAY_SOURCE_ID) ?? [];
  const postnummer = optionalString(address, "postnummer", NORWAY_SOURCE_ID, 32);
  const poststed = optionalString(address, "poststed", NORWAY_SOURCE_ID, 256);
  const landkode = optionalString(address, "landkode", NORWAY_SOURCE_ID, 8);
  const land = optionalString(address, "land", NORWAY_SOURCE_ID, 256);
  const municipalityName = optionalString(address, "kommune", NORWAY_SOURCE_ID, 256);
  const municipalityCode = optionalString(address, "kommunenummer", NORWAY_SOURCE_ID, 32);
  const structured: Record<string, string> = {};
  if (lines.length > 0) structured.addressLines = lines.join("\n");
  if (postnummer) structured.postalCode = postnummer;
  if (poststed) structured.locality = poststed;
  if (landkode) structured.countryCode = landkode;
  if (land) structured.country = land;
  if (municipalityCode) structured.municipalityCode = municipalityCode;
  if (municipalityName) structured.municipality = municipalityName;
  const locality = [postnummer, poststed].filter((item): item is string => item !== null).join(" ");
  const rawParts = [...lines, locality, land].filter((item): item is string => Boolean(item));
  return fact(
    {
      raw: rawParts.length > 0 ? rawParts.join(", ") : null,
      precision: lines.length > 0 ? "full" : locality ? "partial" : "unknown",
      structured: Object.keys(structured).length > 0 ? structured : null,
    },
    address,
  );
}

function parseEntity(entity: JsonObject, requestedIdentifier: string, retrievedAt: string): BusinessFactRecord {
  const identifier = requiredString(entity, "organisasjonsnummer", NORWAY_SOURCE_ID, 9);
  if (!/^[0-9]{9}$/.test(identifier) || identifier !== requestedIdentifier) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official source returned an unexpected organisation number", { sourceId: NORWAY_SOURCE_ID });
  }
  const legalName = requiredString(entity, "navn", NORWAY_SOURCE_ID, 1_024);
  const status = statusFrom(entity);
  const entityForm = optionalObject(entity, "organisasjonsform", NORWAY_SOURCE_ID);
  const registrationDate = optionalString(entity, "registreringsdatoEnhetsregisteret", NORWAY_SOURCE_ID, 32);
  const industry = optionalObject(entity, "naeringskode1", NORWAY_SOURCE_ID);
  const industryCode = industry ? optionalString(industry, "kode", NORWAY_SOURCE_ID, 64) : null;
  const facts: BusinessFactRecord["facts"] = {
    legalName: fact(legalName, legalName),
    status: {
      value: { canonical: status.canonical, sourceLabel: null },
      availability: "available-open-machine",
      origin: "derived",
      sourceValue: null,
      sourceId: NORWAY_SOURCE_ID,
      asOf: null,
      mappingConfidence: "high",
      derivedFrom: ["konkurs", "underAvvikling", "underTvangsavviklingEllerTvangsopplosning", "slettedato"],
      derivationMethod: "fixed-precedence-status-map",
      derivationVersion: "1",
    },
  };
  if (entityForm) {
    const code = optionalString(entityForm, "kode", NORWAY_SOURCE_ID, 64);
    const label = optionalString(entityForm, "beskrivelse", NORWAY_SOURCE_ID, 512);
    if (code || label) facts.entityType = fact({ code, label }, entityForm);
  }
  if (registrationDate) facts.registrationDate = fact(registrationDate, registrationDate);
  const address = addressFrom(entity);
  if (address) facts.registeredAddress = address;
  if (industryCode) facts.industryCodes = fact([industryCode], industry);

  const recordUrl = `${BASE_URL}${identifier}`;
  return {
    jurisdictionId: "NOR",
    identifiers: [{ schemeId: NORWAY_IDENTIFIER_SCHEME, kind: "legal-entity", value: identifier, primaryForLookup: true }],
    facts,
    sourceSpecific: {
      [NORWAY_SOURCE_ID]: {
        statusFlags: status.sourceValue,
        responsKlasse: optionalString(entity, "respons_klasse", NORWAY_SOURCE_ID, 128),
        registrertIForetaksregisteret: optionalBoolean(entity, "registrertIForetaksregisteret", NORWAY_SOURCE_ID),
      },
    },
    provenance: {
      sourceIds: [NORWAY_SOURCE_ID],
      authority: "Brønnøysundregistrene",
      registry: "Enhetsregisteret",
      recordUrl,
      retrievedAt,
      dataAsOf: null,
      sourceForm: "per-entity-query",
      origin: "official-source",
      adapterId: NORWAY_ADAPTER_ID,
      adapterVersion: "1.0.0",
      normalizationVersion: "1",
    },
    warnings: [SCOPE_WARNING],
  };
}

export const norwayAdapter: BusinessAdapter = {
  id: NORWAY_ADAPTER_ID,
  version: "1.0.0",
  normalizationVersion: "1",
  jurisdictionId: "NOR",
  supportedIdentifierSchemeIds: [NORWAY_IDENTIFIER_SCHEME],
  sourceIds: [NORWAY_SOURCE_ID],
  capabilities: {
    exactLookup: true,
    nameSearch: false,
    bulkSync: false,
    incrementalSync: false,
    documentFetch: false,
    historicalLookup: false,
  },
  validateIdentifier(input) {
    if (input.schemeId !== NORWAY_IDENTIFIER_SCHEME) return { ok: false, reason: "Expected no-organisasjonsnummer" };
    const value = input.value.trim();
    if (!/^[0-9 .-]+$/.test(value)) return { ok: false, reason: "Norwegian organisation number contains unsupported characters" };
    const normalizedValue = value.replace(/[^0-9]/g, "");
    return /^[0-9]{9}$/.test(normalizedValue)
      ? { ok: true, normalizedValue }
      : { ok: false, reason: "Norwegian organisation number must contain exactly 9 digits" };
  },
  async lookup(request: LookupRequest, context: AdapterContext): Promise<AdapterResult> {
    const startedAt = context.clock.now().toISOString();
    const response = await context.fetcher.request(NORWAY_SOURCE_ID, {
      method: "GET",
      url: `${BASE_URL}${request.identifier.value}`,
      headers: { accept: NORWAY_ACCEPT },
    });
    if (response.status === 404) throw new DomainError("NOT_FOUND", "No entity was found for this Norwegian organisation number");
    if (response.status === 410) {
      throw new DomainError("WITHDRAWN_FOR_LEGAL_REASONS", "The official source withdrew this record for legal reasons");
    }
    if (response.status < 200 || response.status >= 300) {
      throw new DomainError("SOURCE_BAD_RESPONSE", "Official source returned an unexpected status", {
        sourceId: NORWAY_SOURCE_ID,
        upstreamStatus: response.status,
      });
    }
    const entity = await readJsonObject(response, NORWAY_SOURCE_ID);
    const retrievedAt = context.clock.now().toISOString();
    const record = parseEntity(entity, request.identifier.value, retrievedAt);
    return {
      record,
      execution: {
        requestId: context.requestId,
        adapterId: NORWAY_ADAPTER_ID,
        adapterVersion: "1.0.0",
        normalizationVersion: "1",
        sourceIds: [NORWAY_SOURCE_ID],
        startedAt,
        completedAt: context.clock.now().toISOString(),
        cacheStatus: "bypass-no-store",
        warnings: [SCOPE_WARNING],
      },
    };
  },
};

export function isNorwayEntity(value: unknown): value is JsonObject {
  return isJsonObject(value);
}
