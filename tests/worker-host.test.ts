import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

function environment(assetFetch = vi.fn(async () => new Response("asset"))): Env {
  const limiter = { limit: async () => ({ success: true }) };
  return {
    PUBLIC_HOSTNAME: "business.newbies.cool",
    REQUEST_RATE_LIMITER: limiter,
    UPSTREAM_RATE_LIMITER: limiter,
    ASSETS: { fetch: assetFetch },
  } as unknown as Env;
}

const incomingRequest = (url: string) => new Request(url) as Parameters<typeof worker.fetch>[0];

describe("production origin boundary", () => {
  it.each([
    "https://global-official-business-facts.workers.dev/api/v1/health",
    "https://preview.example.workers.dev/api/v1/health",
    "http://business.newbies.cool/api/v1/health",
    "https://business.newbies.cool:8443/api/v1/health",
  ])("returns 421 before API or assets for %s", async (url) => {
    const assetFetch = vi.fn(async () => new Response("asset"));
    const response = await worker.fetch(incomingRequest(url), environment(assetFetch), {} as ExecutionContext);
    expect(response.status).toBe(421);
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it("serves the canonical HTTPS hostname and delegates static assets", async () => {
    const assetFetch = vi.fn(async () => new Response("asset"));
    expect((await worker.fetch(incomingRequest("https://business.newbies.cool/api/v1/health"), environment(assetFetch), {} as ExecutionContext)).status).toBe(200);
    expect(await (await worker.fetch(incomingRequest("https://business.newbies.cool/"), environment(assetFetch), {} as ExecutionContext)).text()).toBe("asset");
    expect(assetFetch).toHaveBeenCalledOnce();
  });
});
