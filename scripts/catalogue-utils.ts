import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CompiledCatalogue } from "../src/catalogue/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOGUE = path.join(ROOT, "data", "catalogue");
const VERIFICATION = path.join(ROOT, "data", "verification");

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
    generatedAt: new Date().toISOString(),
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
      ...(await readJsonDir(path.join(VERIFICATION, "sources"))),
      ...(await readJsonDir(path.join(VERIFICATION, "licences"))),
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

  const jurisdictions = new Set(data.jurisdictions.map((x) => x.id));
  const registries = new Set(data.registries.map((x) => x.id));
  const sources = new Set(data.sources.map((x) => x.id));
  const accessMethods = new Set(data.accessMethods.map((x) => x.id));
  const constraints = new Set(data.constraints.map((x) => x.id));
  const schemes = new Set(data.identifierSchemes.map((x) => x.id));
  const licences = new Set(data.licences.map((x) => x.id));
  const profiles = new Set(data.exposureProfiles.map((x) => x.id));

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
    if (manifest.promotionState === "PRODUCTION") {
      const eligibility = data.eligibilityAssessments.find((item) => item.adapterId === manifest.adapterId && item.decision === "eligible");
      if (!eligibility) errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires an eligible ProductionEligibilityAssessment`);
      if (manifest.sourceIds.length === 0) errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires at least one source`);
      if (manifest.technicalVerification.status !== "pass") errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires technical verification pass`);
      if (manifest.policyVerification.status !== "pass") errors.push(`adapter ${manifest.adapterId}: PRODUCTION requires policy verification pass`);
    }
  }
  return errors;
}
