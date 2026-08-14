import { Catalogue } from "./catalogue/catalogue";
import { compiledCatalogue } from "./generated/catalogue.generated";
import { createApp } from "./http/app";
import { AdapterRegistry } from "./lookup/adapter-registry";
import { LookupService } from "./lookup/lookup-service";
import { ProductionPolicyGate } from "./policy/policy-gate";
import { WorkerSourceFetcher } from "./sources/source-fetcher";

const catalogue = new Catalogue(compiledCatalogue);
const registry = new AdapterRegistry([]); // Real adapters require explicit verified production registration.
const policyGate = new ProductionPolicyGate(compiledCatalogue.eligibilityAssessments, compiledCatalogue.exposureProfiles);

const logger = {
  info(event: string, fields: Record<string, unknown>) { console.log(JSON.stringify({ level: "info", event, ...fields })); },
  warn(event: string, fields: Record<string, unknown>) { console.warn(JSON.stringify({ level: "warn", event, ...fields })); },
  error(event: string, fields: Record<string, unknown>) { console.error(JSON.stringify({ level: "error", event, ...fields })); },
};

const lookupService = new LookupService(catalogue, registry, policyGate, () => ({
  fetcher: new WorkerSourceFetcher(),
  clock: { now: () => new Date() },
  logger,
  requestId: crypto.randomUUID(),
}));

const app = createApp({ catalogue, lookupService });

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
