import { bookingToRow, validateBooking } from "#lib/server/booking-validation";
import { database, json, readJson, requireUser, sameOrigin } from "#lib/server/http";
import type { RequestHandler } from "./$types";

const MAX_IMPORTS = 500;

export const POST: RequestHandler = async (event) => {
  if (!requireUser(event)) return json({ error: "Sign in to restore bookings." }, 401);
  if (!sameOrigin(event.request)) return json({ error: "Request origin was not accepted." }, 403);

  let payload: unknown;
  try {
    payload = await readJson(event.request, 5_000_000);
  } catch {
    return json({ error: "Backup is invalid or too large." }, 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      (payload as Record<string, unknown>).app !== "Fulhadhoo Beach Cottage" ||
      (payload as Record<string, unknown>).version !== 1 ||
      !Array.isArray((payload as Record<string, unknown>).bookings)) {
    return json({ error: "Choose a Fulhadhoo booking manager backup." }, 400);
  }

  const records = (payload as { bookings: unknown[] }).bookings;
  if (records.length > MAX_IMPORTS) {
    return json({ error: `A restore can contain at most ${MAX_IMPORTS} bookings.` }, 400);
  }

  const ids = new Set<string>();
  const bookingIds: string[] = [];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record) ||
        typeof (record as Record<string, unknown>).id !== "string") {
      return json({ error: "Every backup booking must have an identifier." }, 400);
    }
    const id = (record as Record<string, string>).id;
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id) || ids.has(id)) {
      return json({ error: "Backup has duplicate or invalid identifiers." }, 400);
    }
    ids.add(id);
    bookingIds.push(id);
  }

  let bookings;
  try {
    bookings = records.map((record) => {
      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...booking
      } = record as Record<string, unknown>;
      return validateBooking(booking);
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Backup contains invalid bookings." }, 400);
  }

  let db: D1Database;
  try {
    db = database(event);
  } catch {
    return json({ error: "Database is not configured. Follow the setup guide." }, 503);
  }
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    db.prepare("DELETE FROM bookings"),
    ...bookings.map((booking, index) => db.prepare(
      `INSERT INTO bookings
       (id, guest, room, checkin, checkout, guests, source, reference, phone, email,
        status, total_cents, paid_cents, payment_method, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...bookingToRow(booking, bookingIds[index], now)))
  ];

  try {
    await db.batch(statements);
    return json({ message: `Restored ${bookings.length} bookings.` });
  } catch (error) {
    if (error instanceof Error && error.message.includes("booking_overlap")) {
      return json({ error: "Backup has overlapping active stays in the same room." }, 409);
    }
    return json({ error: "Backup could not be restored; existing data was not replaced." }, 503);
  }
};
