import { json } from "#lib/server/http";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  json({ user: locals.user ? { email: locals.user.email, role: locals.user.role } : null });
