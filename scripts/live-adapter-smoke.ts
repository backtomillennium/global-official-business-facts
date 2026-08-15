import { norwayAdapter } from "../src/adapters/norway/no-brreg-enhetsregisteret-v1";
import { singaporeAdapter } from "../src/adapters/singapore/sg-acra-opendata-v1";
import { slovakiaAdapter } from "../src/adapters/slovakia/sk-rpo-v1";
import type { AdapterContext, BusinessAdapter, LookupRequest } from "../src/lookup/types";
import { PRODUCTION_SOURCE_POLICIES } from "../src/sources/production-policies";
import { WorkerSourceFetcher } from "../src/sources/source-fetcher";

const fetcher = new WorkerSourceFetcher(PRODUCTION_SOURCE_POLICIES);
const context = (requestId: string): AdapterContext => ({
  fetcher,
  clock: { now: () => new Date() },
  logger: { info() {}, warn() {}, error() {} },
  requestId,
});

async function smoke(adapter: BusinessAdapter, request: LookupRequest): Promise<{ adapterId: string; status: "PASS"; retrievedAt: string }> {
  const validation = adapter.validateIdentifier({ schemeId: request.identifier.schemeId, value: request.identifier.value });
  if (!validation.ok) throw new Error(`${adapter.id}: smoke identifier did not validate`);
  const result = await adapter.lookup({ ...request, identifier: { ...request.identifier, value: validation.normalizedValue } }, context(`live-smoke-${adapter.id}`));
  if (typeof result.record.facts.legalName.value !== "string" || result.record.facts.legalName.value.length === 0) {
    throw new Error(`${adapter.id}: official response did not bind legalName`);
  }
  return { adapterId: adapter.id, status: "PASS", retrievedAt: result.record.provenance.retrievedAt };
}

const results = [];
results.push(await smoke(norwayAdapter, {
  jurisdictionId: "NOR",
  identifier: { schemeId: "no-organisasjonsnummer", value: "923609016" },
}));
results.push(await smoke(slovakiaAdapter, {
  jurisdictionId: "SVK",
  identifier: { schemeId: "sk-ico", value: "00166197" },
}));
// Exactly one UEN-filtered request to the launch resource; the adapter also re-checks result.fields[].
results.push(await smoke(singaporeAdapter, {
  jurisdictionId: "SGP",
  identifier: { schemeId: "sg-uen", value: "201201936C" },
}));

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
