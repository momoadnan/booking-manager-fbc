import { constantTimeStringEqual, hashPassword } from "#lib/server/auth";
import { database, environment, json, readJson, sameOrigin } from "#lib/server/http";
import { clientIp, rateLimited } from "#lib/server/rate-limit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  if (!sameOrigin(event.request)) return json({ error: "Request origin was not accepted." }, 403);

  let db: D1Database;
  try {
    db = database(event);
  } catch {
    return json({ error: "Database is not configured. Follow the setup guide." }, 503);
  }

  const ip = clientIp(event.request);
  try {
    if (await rateLimited(db, "setup", ip)) {
      return json({ error: "Too many setup attempts. Wait 15 minutes and try again." }, 429);
    }
  } catch {
    return json({ error: "Setup is temporarily unavailable. Please try again." }, 503);
  }

  const expectedSecret = environment().BOOTSTRAP_SECRET;
  const suppliedSecret = event.request.headers.get("x-bootstrap-secret") ?? "";
  if (!expectedSecret || suppliedSecret.length < 24 ||
      !constantTimeStringEqual(suppliedSecret, expectedSecret)) {
    return json({ error: "Setup is unavailable or the setup key is incorrect." }, 403);
  }

  let body: unknown;
  try {
    body = await readJson(event.request);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Provide an email address and password." }, 400);
  }

  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    return json({ error: "Enter a valid owner email address." }, 400);
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return json({ error: "Use a password between 12 and 128 characters." }, 400);
  }

  try {
    const existing = await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>();
    if (existing) return json({ error: "Owner setup has already been completed." }, 409);

    await db.prepare(
      "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'owner', ?)"
    ).bind(
      crypto.randomUUID(),
      email.trim().toLowerCase(),
      await hashPassword(password),
      Math.floor(Date.now() / 1000)
    ).run();
    return json({ message: "Owner account created. Sign in to continue." }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return json({ error: "An account with that email already exists." }, 409);
    }
    return json({ error: "Owner account could not be created." }, 500);
  }
};
