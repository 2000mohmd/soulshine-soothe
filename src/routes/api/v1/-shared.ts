// Shared helpers for the versioned mobile API (src/routes/api/v1/*).
//
// These routes are a thin, Bearer-JWT-authenticated JSON surface for the
// separate mobile app. They do NOT re-implement business logic: each handler
// forwards to the same server-side logic the web app uses.
//
// Auth: every protected route calls `requireAuth(request)` first — an explicit,
// independently-tested bearer-token check (see src/lib/api-auth.server.ts). The
// wrapped createServerFns also run their own `requireSupabaseAuth`; the explicit
// check here fails fast with a clean 401 before any work and keeps auth
// behaviour testable without a running server.
import { z } from "zod";
import { authenticateBearer, type ApiAuthSuccess } from "@/lib/api-auth.server";

export function json(body: unknown, init: number | ResponseInit = 200): Response {
  const responseInit: ResponseInit = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...responseInit,
    headers: { "Content-Type": "application/json", ...(responseInit.headers ?? {}) },
  });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Resolve the caller from the `Authorization: Bearer <jwt>` header, or throw an
 * ApiError(401). Returns `{ supabase, userId }` — the same shape the web RPC
 * middleware produces — so handlers are transport-agnostic.
 */
export async function requireAuth(request: Request): Promise<ApiAuthSuccess> {
  const result = await authenticateBearer(request);
  if (!result.ok) throw new ApiError(result.status, result.error);
  return result;
}

/**
 * Runs a handler and maps thrown errors to JSON responses. Unauthorized errors
 * from requireSupabaseAuth become 401; zod/validation become 400; anything else
 * is a 500 with a generic message (details are logged, not returned).
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return json({ error: err.message, details: err.details ?? undefined }, err.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/^unauthorized/i.test(message)) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (/not found$/i.test(message)) {
      return json({ error: message }, 404);
    }
    if (/^payment required/i.test(message)) {
      return json({ error: message }, 402);
    }
    if (/not implemented/i.test(message)) {
      return json({ error: message }, 501);
    }
    if (err instanceof z.ZodError) {
      return json({ error: "Validation failed", details: err.flatten() }, 400);
    }
    console.error("[api/v1] unhandled error:", message);
    return json({ error: "Internal error" }, 500);
  }
}
