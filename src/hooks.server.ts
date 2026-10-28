import type { Handle } from "@sveltejs/kit/hooks";
import { readSession, sessionCookieName } from "#lib/server/auth";
import { database } from "#lib/server/http";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  const token = event.cookies.get(sessionCookieName());

  if (token) {
    event.locals.user = await readSession(database(event), token);
  }

  const response = await resolve(event);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cache-Control", "no-store");
  if (new URL(event.request.url).protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return response;
};
