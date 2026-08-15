import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

describe("static and deployment security configuration", () => {
  it("sets restrictive browser headers on static assets", () => {
    const headers = read("dist/_headers");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("Strict-Transport-Security:");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("X-Frame-Options: DENY");
  });

  it("keeps alternate Cloudflare origins disabled and rate limits bound", () => {
    const config = JSON.parse(read("wrangler.jsonc")) as { workers_dev: boolean; preview_urls: boolean; ratelimits: unknown[] };
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.ratelimits).toHaveLength(2);
  });

  it.each(["", "business/no/", "business/sk/", "business/sg/"])("renders required disclaimer at /%s", (path) => {
    const html = read(`dist/${path}index.html`);
    expect(html).toContain("Global Official Business Facts is not an official registry.");
    expect(html).toContain("For authoritative or legally certified information, consult the originating registry.");
  });
});
