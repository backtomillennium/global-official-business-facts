import { DomainError } from "../domain/errors";

export const MAX_JSON_BODY_BYTES = 2_048;

export async function readStrictJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes(",") || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim())) {
    throw new DomainError("INVALID_REQUEST", "Content-Type must be application/json");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_JSON_BODY_BYTES) {
      throw new DomainError("INVALID_REQUEST", "JSON request body exceeds 2048 bytes");
    }
  }
  if (!request.body) throw new DomainError("INVALID_REQUEST", "JSON request body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        throw new DomainError("INVALID_REQUEST", "JSON request body exceeds 2048 bytes");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_REQUEST", "JSON request body could not be read");
  }
  if (total === 0) throw new DomainError("INVALID_REQUEST", "JSON request body is required");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DomainError("INVALID_REQUEST", "JSON request body must be valid UTF-8");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainError("INVALID_REQUEST", "Malformed JSON request body");
  }
}
