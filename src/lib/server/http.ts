import type { RequestEvent } from "@sveltejs/kit";
import { env } from "cloudflare:workers";

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export function database(event: RequestEvent): D1Database {
  const db = env.DB;
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db;
}

export function environment(): App.Platform["env"] {
  return env;
}

export function requireUser(event: RequestEvent) {
  if (!event.locals.user) return null;
  return event.locals.user;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function readJson(request: Request, maximumBytes = 32_000): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (contentType !== "application/json") throw new Error("JSON_REQUIRED");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maximumBytes) throw new Error("BODY_TOO_LARGE");

  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function isOverlapError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("booking_overlap");
}
