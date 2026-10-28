import { bookingToRow, validateBooking, InputError } from "#lib/server/booking-validation";
import { sendOutboxMessage } from "#lib/server/email";
import {
  database,
  environment,
  isOverlapError,
  json,
  readJson,
  requireUser,
  sameOrigin
} from "#lib/server/http";
import type { RequestHandler } from "./$types";

interface BookingRow {
  id: string;
  guest: string;
  room: string;
  checkin: string;
  checkout: string;
  guests: number;
  source: string;
  reference: string;
  phone: string;
  email: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  payment_method: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

function toBooking(row: BookingRow) {
  return {
    id: row.id, guest: row.guest, room: row.room, checkin: row.checkin,
    checkout: row.checkout, guests: row.guests, source: row.source,
    reference: row.reference, phone: row.phone, email: row.email,
    status: row.status, total: row.total_cents / 100, paid: row.paid_cents / 100,
    paymentMethod: row.payment_method, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

const SELECT_BOOKING = `SELECT id, guest, room, checkin, checkout, guests, source,
  reference, phone, email, status, total_cents, paid_cents, payment_method,
  notes, created_at, updated_at FROM bookings`;

export const GET: RequestHandler = async (event) => {
  if (!requireUser(event)) return json({ error: "Sign in to view bookings." }, 401);
  try {
    const row = await database(event).prepare(`${SELECT_BOOKING} WHERE id = ?`)
      .bind(event.params.id).first<BookingRow>();
    return row ? json({ booking: toBooking(row) }) : json({ error: "Booking not found." }, 404);
  } catch {
    return json({ error: "Booking could not be loaded. Please try again." }, 503);
  }
};

export const PATCH: RequestHandler = async (event) => {
  if (!requireUser(event)) return json({ error: "Sign in to manage bookings." }, 401);
  if (!sameOrigin(event.request)) return json({ error: "Request origin was not accepted." }, 403);

  let input;
  try {
    input = validateBooking(await readJson(event.request));
  } catch (error) {
    return json({
      error: error instanceof InputError
        ? error.message
        : error instanceof Error && error.message === "BODY_TOO_LARGE"
          ? "Booking details are too large."
          : "Provide valid booking details."
    }, 400);
  }

  let db: D1Database;
  let existing: BookingRow | null;
  try {
    db = database(event);
    existing = await db.prepare(`${SELECT_BOOKING} WHERE id = ?`)
      .bind(event.params.id).first<BookingRow>();
  } catch {
    return json({ error: "Booking could not be loaded. Please try again." }, 503);
  }
  if (!existing) return json({ error: "Booking not found." }, 404);

  const now = Math.floor(Date.now() / 1000);
  const update = db.prepare(
    `UPDATE bookings SET guest = ?, room = ?, checkin = ?, checkout = ?, guests = ?,
       source = ?, reference = ?, phone = ?, email = ?, status = ?, total_cents = ?,
       paid_cents = ?, payment_method = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    input.guest, input.room, input.checkin, input.checkout, input.guests,
    input.source, input.reference, input.phone, input.email, input.status,
    Math.round(input.total * 100), Math.round(input.paid * 100),
    input.paymentMethod, input.notes, now, event.params.id
  );

  const eventType = input.status === "Cancelled"
    ? existing.status === "Cancelled" ? null : "cancelled"
    : input.status === "Confirmed" ? "updated" : null;
  const emailId = eventType && input.email ? crypto.randomUUID() : null;

  try {
    if (emailId) {
      const outboxInsert = db.prepare(
        `INSERT INTO email_outbox
         (id, booking_id, event_type, status, attempts, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?)`
      ).bind(emailId, event.params.id, eventType, now, now);
      await db.batch([update, outboxInsert]);
    } else {
      await update.run();
    }
  } catch (error) {
    if (isOverlapError(error)) {
      return json({ error: `${input.room} already has a booking during those dates.` }, 409);
    }
    return json({ error: "Booking could not be updated. Please try again." }, 503);
  }

  let emailWarning: string | undefined;
  if (emailId) {
    try {
      const result = await sendOutboxMessage(
        db,
        emailId,
        environment().RESEND_API_KEY,
        environment().RESEND_FROM
      );
      if (result !== "sent") emailWarning = "Booking saved, but its email could not be delivered yet.";
    } catch {
      emailWarning = "Booking saved, but the email status could not be confirmed. Check the email retry queue.";
    }
  }

  return json({
    booking: { ...input, id: event.params.id, createdAt: existing.created_at, updatedAt: now },
    emailWarning
  });
};

export const DELETE: RequestHandler = async (event) => {
  if (!requireUser(event)) return json({ error: "Sign in to manage bookings." }, 401);
  if (!sameOrigin(event.request)) return json({ error: "Request origin was not accepted." }, 403);

  try {
    const result = await database(event).prepare("DELETE FROM bookings WHERE id = ?")
      .bind(event.params.id).run();
    if (!result.meta?.changes) return json({ error: "Booking not found." }, 404);
    return json({ message: "Booking deleted." });
  } catch {
    return json({ error: "Booking could not be deleted. Please try again." }, 503);
  }
};
