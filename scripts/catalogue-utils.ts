import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CompiledCatalogue } from "../src/catalogue/types";
import type { VerificationRecord } from "../src/domain/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOGUE = path.join(ROOT, "data", "catalogue");
const VERIFICATION = path.join(ROOT, "data", "verification");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function validateId(kind: string, value: string, errors: string[]): void {
  if (!SAFE_ID.test(value) || CONTROL_CHARACTERS.test(value)) errors.push(`${kind}: unsafe id ${JSON.stringify(value)}`);
}

function validateHttpsUrl(kind: string, value: string | null, errors: string[]): void {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") errors.push(`${kind}: URL must use https: ${value}`);
    if (url.username || url.password) errors.push(`${kind}: URL must not contain credentials: ${value}`);
  } catch {
    errors.push(`${kind}: invalid URL ${value}`);
  }
}

function gatePassedOrNotApplicable(value: string): boolean {
  return value === "pass" || value === "not-applicable";
}

async function readJsonDir<T>(directory: string): Promise<T[]> {
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    const values = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8")) as T));
    return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function loadCatalogueFiles(): Promise<CompiledCatalogue> {
  return {
    generatedAt: "2026-08-14T00:00:00.000Z",
    jurisdictions: await readJsonDir(path.join(CATALOGUE, "jurisdictions")),
    registries: await readJsonDir(path.join(CATALOGUE, "registries")),
    accessMethods: await readJsonDir(path.join(CATALOGUE, "access-methods")),
    sources: await readJsonDir(path.join(CATALOGUE, "sources")),
    identifierSchemes: await readJsonDir(path.join(CATALOGUE, "identifier-schemes")),
    licences: await readJsonDir(path.join(CATALOGUE, "licences")),
    constraints: await readJsonDir(path.join(CATALOGUE, "constraints")),
    evidence: await readJsonDir(path.join(CATALOGUE, "evidence")),
    assessments: await readJsonDir(path.join(CATALOGUE, "assessments")),
    adapters: await readJsonDir(path.join(CATALOGUE, "adapters")),
    adapterManifests: await readJsonDir(path.join(ROOT, "data", "production", "adapter-manifests")),
    exposureProfiles: await readJsonDir(path.join(CATALOGUE, "exposure-profiles")),
    eligibilityAssessments: await readJsonDir(path.join(VERIFICATION, "candidates")),
    verificationRecords: [
      ...(await readJsonDir<VerificationRecord>(path.join(VERIFICATION, "sources"))),
      ...(await readJsonDir<VerificationRecord>(path.join(VERIFICATION, "licences"))),
    ],
  };
}

export function validateCatalogue(data: CompiledCatalogue): string[] {
  const errors: string[] = [];
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) errors.push(`${kind}: empty id`);
      if (seen.has(id)) errors.push(`${kind}: duplicate id ${id}`);
      seen.add(id);
    }
  };
  unique("jurisdiction", data.jurisdictions.map((x) => x.id));
  unique("jurisdiction slug", data.jurisdictions.map((x) => x.slug));
  unique("registry", data.registries.map((x) => x.id));
  unique("access method", data.accessMethods.map((x) => x.id));
  unique("source", data.sources.map((x) => x.id));
  unique("identifier scheme", data.identifierSchemes.map((x) => x.id));
  unique("licence", data.licences.map((x) => x.id));
  unique("adapter", data.adapters.map((x) => x.id));
  unique("adapter manifest", data.adapterManifests.map((x) => x.adapterId));
  unique("exposure profile", data.exposureProfiles.map((x) => x.id));

  for (const x of data.jurisdictions) {
    validateId("jurisdiction", x.id, errors);
    if (!SAFE_SLUG.test(x.slug)) errors.push(`jurisdiction ${x.id}: unsafe slug ${JSON.stringify(x.slug)}`);
    if (x.iso2 && !/^[A-Z]{2}$/.test(x.iso2)) errors.push(`jurisdiction ${x.id}: invalid ISO2 ${x.iso2}`);
    if (x.iso3 && !/^[A-Z]{3}$/.test(x.iso3)) errors.push(`jurisdiction ${x.id}: invalid ISO3 ${x.iso3}`);
  }
  for (const x of data.registries) validateId("registry", x.id, errors);
  for (const x of data.sources) { validateId("source", x.id, errors); validateHttpsUrl(`source ${x.id}`, x.url, errors); }
  for (const x of data.accessMethods) { validateId("access method", x.id, errors); validateHttpsUrl(`access method ${x.id}`, x.endpoint, errors); }
  for (const x of data.identifierSchemes) validateId("identifier scheme", x.id, errors);
  for (const x of data.licences) { validateId("licence", x.id, errors); validateHttpsUrl(`licence ${x.id}`, x.sourceUrl, errors); }
  for (const x of data.constraints) validateHttpsUrl(`constraint ${x.id}`, x.sourceUrl, errors);
  for (const x of data.evidence) validateHttpsUrl(`evidence ${x.id}`, x.sourceUrl, errors);
  for (const x of data.adapters) validateId("adapter", x.id, errors);

  const jurisdictions = new Set(data.jurisdictions.map((x) => x.id));
  const registries = new Set(data.registries.map((x) => x.id));
  const sources = new Set(data.sources.map((x) => x.id));
  const accessMethods = new Set(data.accessMethods.map((x) => x.id));
  const constraints = new Set(data.constraints.map((x) => x.id));
  const schemes = new Set(data.identifierSchemes.map((x) => x.id));
  const licences = new Set(data.licences.map((x) => x.id));
  const profiles = new Set(data.exposureProfiles.map((x) => x.id));
  const evidenceIds = new Set(data.evidence.map((x) => x.id));
  const verificationRecordIds = new Set(data.verificationRecords.map((x) => x.id));

  for (const x of data.jurisdictions) {
    if (x.parentJurisdictionId && !jurisdictions.has(x.parentJurisdictionId)) errors.push(`jurisdiction ${x.id}: invalid parent ${x.parentJurisdictionId}`);
    if (x.defaultIdentifierSchemeId && !schemes.has(x.defaultIdentifierSchemeId)) errors.push(`jurisdiction ${x.id}: invalid default scheme ${x.defaultIdentifierSchemeId}`);
  }
  for (const x of data.registries) if (!jurisdictions.has(x.jurisdictionId)) errors.push(`registry ${x.id}: invalid jurisdiction ${x.jurisdictionId}`);
  for (const x of data.sources) {
    if (!registries.has(x.registryId)) errors.push(`source ${x.id}: invalid registry ${x.registryId}`);
    if (x.licenceId && !licences.has(x.licenceId)) errors.push(`source ${x.id}: invalid licence ${x.licenceId}`);
    for (const accessMethodId of x.accessMethodIds) if (!accessMethods.has(accessMethodId)) errors.push(`source ${x.id}: invalid access method ${accessMethodId}`);
    for (const constraintId of x.constraintIds) if (!constraints.has(constraintId)) errors.push(`source ${x.id}: invalid constraint ${constraintId}`);
  }
  for (const x of data.accessMethods) if (!sources.has(x.sourceId)) errors.push(`access method ${x.id}: invalid source ${x.sourceId}`);
  for (const x of data.identifierSchemes) {
    if (!jurisdictions.has(x.jurisdictionId)) errors.push(`scheme ${x.id}: invalid jurisdiction ${x.jurisdictionId}`);
    for (const sourceId of x.searchableSourceIds) if (!sources.has(sourceId)) errors.push(`scheme ${x.id}: invalid source ${sourceId}`);
  }
  for (const x of data.adapters) {
    if (!jurisdictions.has(x.jurisdictionId)) errors.push(`adapter ${x.id}: invalid jurisdiction ${x.jurisdictionId}`);
    for (const sourceId of x.sourceIds) if (!sources.has(sourceId)) errors.push(`adapter ${x.id}: invalid source ${sourceId}`);
    for (const schemeId of x.supportedIdentifierSchemeIds) if (!schemes.has(schemeId)) errors.push(`adapter ${x.id}: invalid scheme ${schemeId}`);
  }
  const adapterIds = new Set(data.adapters.map((x) => x.id));
  for (const manifest of data.adapterManifests) {
    if (!adapterIds.has(manifest.adapterId)) errors.push(`adapter manifest ${manifest.adapterId}: missing AdapterDefinition`);
    if (!jurisdictions.has(manifest.jurisdictionId)) errors.push(`adapter manifest ${manifest.adapterId}: invalid jurisdiction ${manifest.jurisdictionId}`);
    if (!profiles.has(manifest.exposureProfileId)) errors.push(`adapter manifest ${manifest.adapterId}: invalid exposure profile ${manifest.exposureProfileId}`);
    for (const sourceId of manifest.sourceIds) if (!sources.has(sourceId)) errors.push(`adapter manifest ${manifest.adapterId}: invalid source ${sourceId}`);
    for (const schemeId of manifest.identifierSchemeIds) if (!schemes.has(schemeId)) errors.push(`adapter manifest ${manifest.adapterId}: invalid scheme ${schemeId}`);
    const definition = data.adapters.find((item) => item.id === manifest.adapterId);
    if (definition) {
      if (definition.jurisdictionId !== manifest.jurisdictionId) errors.push(`adapter manifest ${manifest.adapterId}: jurisdiction does not match AdapterDefinition`);
      for (const sourceId of manifest.sourceIds) if (!definition.sourceIds.includes(sourceId)) errors.push(`adapter manifest ${manifest.adapterId}: source ${sourceId} is not declared by AdapterDefinition`);
      for (const schemeId of manifest.identifierSchemeIds) if (!definition.supportedIdentifierSchemeIds.includes(schemeId)) errors.push(`adapter manifest ${manifest.adapterId}: scheme ${schemeId} is not declared by AdapterDefinition`);
    }
    for (const recordId of manifest.technicalVerification.verificationRecordIds) if (!verificationRecordIds.has(recordId)) errors.push(`adapter ${manifest.adapterId}: missing technical verification record ${recordId}`);
    for (const recordId of manifest.policyVerification.verificationRecordIds) if (!verificationRecordIds.has(recordId)) errors.push(`adapter ${manifest.adapterId}: missing policy verification record ${recordId}`);

    if (manifest.promotionState === "PRODUCTION") {
      const eligibility = data.eligibilityAssessments.find((item) => item.adapterId === manifest.adapterId && item.decision === "eligible");
      if (!eligibility) {
        errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires an eligible ProductionEligibilityAssessment`);
      } else {
        const requiredGates = [
          eligibility.sourceScope, eligibility.identifier, eligibility.technical, eligibility.automation,
          eligibility.commercialUse, eligibility.responseRedistribution, eligibility.attribution,
          eligibility.exposureSafety, eligibility.provenance, eligibility.adapterQuality, eligibility.operational,
        ];
        if (!requiredGates.every(gatePassedOrNotApplicable)) errors.push(`adapter ${manifest.adapterId}: PRODUCTION eligibility contains non-passing gates`);
        if (eligibility.blockers.length) errors.push(`adapter ${manifest.adapterId}: PRODUCTION eligibility contains blockers`);
        for (const evidenceId of eligibility.evidenceIds) if (!evidenceIds.has(evidenceId)) errors.push(`adapter ${manifest.adapterId}: missing eligibility evidence ${evidenceId}`);
      }
      if (manifest.sourceIds.length === 0) errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires at least one source`);
      if (manifest.technicalVerification.status !== "pass") errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires technical verification pass`);
      if (manifest.policyVerification.status !== "pass") errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires policy verification pass`);
      if (manifest.cachePolicy.mode !== "no-store") errors.push(`adapter ${manifest.adapterId}: V1 production cache policy must be no-store`);
      const profile = data.exposureProfiles.find((item) => item.id === manifest.exposureProfileId);
      if (profile?.personDataAllowed) errors.push(`adapter ${manifest.adapterId}: V1 production exposure profile must not allow person data`);
    }
  }
  return errors;
}
