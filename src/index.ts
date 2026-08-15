import { norwayAdapter } from "./adapters/norway/no-brreg-enhetsregisteret-v1";
import { singaporeAdapter } from "./adapters/singapore/sg-acra-opendata-v1";
import { slovakiaAdapter } from "./adapters/slovakia/sk-rpo-v1";
import { Catalogue } from "./catalogue/catalogue";
import { compiledCatalogue } from "./generated/catalogue.generated";
import { createApp, type RuntimeBindings } from "./http/app";
import { API_SECURITY_HEADERS, hostnameIsAllowed } from "./http/security";
import { AdapterRegistry } from "./lookup/adapter-registry";
import { LookupService } from "./lookup/lookup-service";
import { createProductionPaymentGate, type PaymentGate } from "./payment/x402-gate";
import { ProductionPolicyGate } from "./policy/policy-gate";
import { PRODUCTION_SOURCE_POLICIES } from "./sources/production-policies";
import { WorkerSourceFetcher } from "./sources/source-fetcher";

const catalogue = new Catalogue(compiledCatalogue);
const registry = new AdapterRegistry([norwayAdapter, slovakiaAdapter, singaporeAdapter]);
const policyGate = new ProductionPolicyGate(compiledCatalogue.eligibilityAssessments, compiledCatalogue.exposureProfiles);

const sourceFetcher = new WorkerSourceFetcher(PRODUCTION_SOURCE_POLICIES);

const logger = {
  info(event: string, fields: Record<string, unknown>) { console.log(JSON.stringify({ level: "info", event, ...fields })); },
  warn(event: string, fields: Record<string, unknown>) { console.warn(JSON.stringify({ level: "warn", event, ...fields })); },
  error(event: string, fields: Record<string, unknown>) { console.error(JSON.stringify({ level: "error", event, ...fields })); },
};

const lookupService = new LookupService(catalogue, registry, policyGate, (requestId) => ({
  fetcher: sourceFetcher,
  clock: { now: () => new Date() },
  logger,
  requestId,
}));

let productionPaymentGate: PaymentGate | undefined;
function paymentGateFor(bindings: RuntimeBindings): PaymentGate {
  productionPaymentGate ??= createProductionPaymentGate(bindings);
  return productionPaymentGate;
}

const app = createApp({ catalogue, lookupService, paymentGateFactory: paymentGateFor });

function misdirectedResponse(): Response {
  return new Response(JSON.stringify({ error: { code: "INVALID_REQUEST", message: "Request hostname is not served" } }), {
    status: 421,
    headers: { ...API_SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, env, executionContext): Promise<Response> {
    if (!hostnameIsAllowed(request.url, env.PUBLIC_HOSTNAME)) return misdirectedResponse();
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, executionContext);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
