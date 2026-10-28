import {
  createSession,
  sessionCookieName,
  sessionCookieOptions,
  verifyPassword
} from "#lib/server/auth";
import { database, json, readJson, sameOrigin } from "#lib/server/http";
import { clearRateLimit, clientIp, rateLimited } from "#lib/server/rate-limit";
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
    if (await rateLimited(db, "login", ip)) {
      return json({ error: "Too many sign-in attempts. Wait 15 minutes and try again." }, 429);
    }
  } catch {
    return json({ error: "Sign-in is temporarily unavailable. Please try again." }, 503);
  }

  let body: unknown;
  try {
    body = await readJson(event.request);
  } catch {
    return json({ error: "Invalid sign-in request." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Enter your email and password." }, 400);
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string" ||
      email.length > 150 || password.length > 128) {
    return json({ error: "Email or password is incorrect." }, 401);
  }

  const normalizedEmail = email.trim().toLowerCase();
  let user: {
    id: string;
    email: string;
    role: "owner";
    password_hash: string;
  } | null;
  let matches: boolean;
  try {
    user = await db.prepare(
      "SELECT id, email, role, password_hash FROM users WHERE email = ?"
    ).bind(normalizedEmail).first<{
      id: string;
      email: string;
      role: "owner";
      password_hash: string;
    }>();
    matches = await verifyPassword(password, user?.password_hash ?? "");
  } catch {
    return json({ error: "Sign-in is temporarily unavailable. Please try again." }, 503);
  }

  if (!user || !matches) {
    return json({ error: "Email or password is incorrect." }, 401);
  }

  try {
    await clearRateLimit(db, "login", ip);
    const token = await createSession(db, user.id);
    event.cookies.set(sessionCookieName(), token, sessionCookieOptions(event.request));
  } catch {
    return json({ error: "A secure session could not be created. Please try again." }, 503);
  }
  return json({ user: { email: user.email, role: user.role } });
};
