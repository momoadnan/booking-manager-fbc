import {
  deleteSession,
  sessionCookieName,
  sessionCookieOptions
} from "#lib/server/auth";
import { database, json, sameOrigin } from "#lib/server/http";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  if (!sameOrigin(event.request)) return json({ error: "Request origin was not accepted." }, 403);

  const token = event.cookies.get(sessionCookieName());
  if (token) {
    try {
      await deleteSession(database(event), token);
    } catch {
      return json({ error: "Could not safely end the session. Please try again." }, 503);
    }
  }

  event.cookies.delete(sessionCookieName(), {
    ...sessionCookieOptions(event.request),
    maxAge: 0
  });
  return json({ message: "Signed out." });
};
