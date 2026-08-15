import type { Catalogue } from "./catalogue";

export function serializeJurisdictionList(catalogue: Catalogue) {
  return catalogue.data.jurisdictions.map((jurisdiction) => {
    const productionManifests = catalogue.data.adapterManifests.filter(
      (manifest) => manifest.jurisdictionId === jurisdiction.id && manifest.promotionState === "PRODUCTION",
    );
    return {
      id: jurisdiction.id,
      slug: jurisdiction.slug,
      iso2: jurisdiction.iso2,
      iso3: jurisdiction.iso3,
      name: jurisdiction.name,
      jurisdictionType: jurisdiction.jurisdictionType,
      parentJurisdictionId: jurisdiction.parentJurisdictionId,
      researchStatus: jurisdiction.researchStatus,
      lastReviewedAt: jurisdiction.lastReviewedAt,
      machineLookup: productionManifests.length > 0 ? "available" : "unavailable",
    };
  });
}

export function serializeJurisdictionDetail(catalogue: Catalogue, jurisdictionIdOrSlug: string) {
  const jurisdiction = catalogue.requireJurisdiction(jurisdictionIdOrSlug);
  const registries = catalogue.data.registries.filter((registry) => registry.jurisdictionId === jurisdiction.id);
  const registryIds = new Set(registries.map((registry) => registry.id));
  const sources = catalogue.data.sources.filter((source) => registryIds.has(source.registryId));
  const productionManifests = catalogue.data.adapterManifests.filter(
    (manifest) => manifest.jurisdictionId === jurisdiction.id && manifest.promotionState === "PRODUCTION",
  );
  const productionAdapterIds = new Set(productionManifests.map((manifest) => manifest.adapterId));
  const adapters = catalogue.data.adapters.filter((adapter) => productionAdapterIds.has(adapter.id));

  return {
    jurisdiction: {
      id: jurisdiction.id,
      slug: jurisdiction.slug,
      iso2: jurisdiction.iso2,
      iso3: jurisdiction.iso3,
      m49: jurisdiction.m49,
      name: jurisdiction.name,
      jurisdictionType: jurisdiction.jurisdictionType,
      parentJurisdictionId: jurisdiction.parentJurisdictionId,
      registryStructure: jurisdiction.registryStructure,
      researchStatus: jurisdiction.researchStatus,
      lastReviewedAt: jurisdiction.lastReviewedAt,
      defaultIdentifierSchemeId: jurisdiction.defaultIdentifierSchemeId,
    },
    registries: registries.map((registry) => ({
      id: registry.id,
      authority: registry.authority,
      name: registry.name,
      registryRole: registry.registryRole,
      scope: registry.scope,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      authority: source.authority,
      name: source.name,
      sourceKind: source.sourceKind,
      sourceForm: source.sourceForm,
      official: source.official,
      machineReadable: source.machineReadable,
      recordScope: source.recordScope,
      url: source.url,
      licenceId: source.licenceId,
      lastVerifiedAt: source.lastVerifiedAt,
    })),
    identifierSchemes: catalogue.getIdentifierSchemesForJurisdiction(jurisdiction.id).map((scheme) => ({
      id: scheme.id,
      name: scheme.name,
      localName: scheme.localName,
      kind: scheme.kind,
      format: scheme.format,
      issuingAuthority: scheme.issuingAuthority,
    })),
    productionAdapters: adapters.map((adapter) => ({
      id: adapter.id,
      version: adapter.version,
      normalizationVersion: adapter.normalizationVersion,
      supportedIdentifierSchemeIds: adapter.supportedIdentifierSchemeIds,
      capabilities: adapter.capabilities,
      scopeWarnings: adapter.scopeWarnings,
    })),
  };
}

export function serializePublicMachineCatalogue(catalogue: Catalogue) {
  return {
    schemaVersion: "1",
    generatedAt: catalogue.data.generatedAt,
    jurisdictions: serializeJurisdictionList(catalogue),
  };
}
