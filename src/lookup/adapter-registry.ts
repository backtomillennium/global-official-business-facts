import type { BusinessAdapter } from "./types";

export class AdapterRegistry {
  private readonly adapters: BusinessAdapter[];

  constructor(adapters: BusinessAdapter[]) {
    this.adapters = [...adapters];
  }

  find(input: { jurisdictionId: string; identifierSchemeId: string; capability: "exactLookup" }): BusinessAdapter[] {
    return this.adapters.filter(
      (adapter) =>
        adapter.jurisdictionId === input.jurisdictionId &&
        adapter.supportedIdentifierSchemeIds.includes(input.identifierSchemeId) &&
        adapter.capabilities[input.capability],
    );
  }
}
