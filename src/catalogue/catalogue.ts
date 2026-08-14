import { DomainError } from "../domain/errors";
import type { AdapterDefinition, AdapterManifest, ExposureProfile, IdentifierScheme, Jurisdiction, Source } from "../domain/types";
import type { CompiledCatalogue } from "./types";

export class Catalogue {
  constructor(public readonly data: CompiledCatalogue) {}

  getJurisdiction(idOrSlug: string): Jurisdiction | undefined {
    const needle = idOrSlug.toLowerCase();
    return this.data.jurisdictions.find(
      (item) => item.id.toLowerCase() === needle || item.slug.toLowerCase() === needle || item.iso2?.toLowerCase() === needle,
    );
  }

  requireJurisdiction(idOrSlug: string): Jurisdiction {
    const jurisdiction = this.getJurisdiction(idOrSlug);
    if (!jurisdiction) throw new DomainError("UNKNOWN_JURISDICTION", `Unknown jurisdiction: ${idOrSlug}`);
    return jurisdiction;
  }

  getIdentifierScheme(id: string): IdentifierScheme | undefined {
    return this.data.identifierSchemes.find((item) => item.id === id);
  }

  getIdentifierSchemesForJurisdiction(jurisdictionId: string): IdentifierScheme[] {
    return this.data.identifierSchemes.filter((item) => item.jurisdictionId === jurisdictionId);
  }

  getSource(id: string): Source | undefined {
    return this.data.sources.find((item) => item.id === id);
  }

  getAdapterDefinitions(jurisdictionId: string, schemeId: string): AdapterDefinition[] {
    return this.data.adapters.filter(
      (item) => item.jurisdictionId === jurisdictionId && item.supportedIdentifierSchemeIds.includes(schemeId),
    );
  }

  getAdapterManifest(adapterId: string): AdapterManifest | undefined {
    return this.data.adapterManifests.find((item) => item.adapterId === adapterId);
  }

  getExposureProfile(id: string): ExposureProfile | undefined {
    return this.data.exposureProfiles.find((item) => item.id === id);
  }
}
