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
    id: row.id,
    guest: row.guest,
    room: row.room,
    checkin: row.checkin,
    checkout: row.checkout,
    guests: row.guests,
    source: row.source,
    reference: row.reference,
    phone: row.phone,
    email: row.email,
    status: row.status,
    total: row.total_cents / 100,
    paid: row.paid_cents / 100,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_BOOKING = `SELECT id, guest, room, checkin, checkout, guests, source,
  reference, phone, email, status, total_cents, paid_cents, payment_method,
  notes, created_at, updated_at FROM bookings`;

export const GET: RequestHandler = async (event) => {
  if (!requireUser(event)) return json({ error: "Sign in to view bookings." }, 401);
  try {
    let db: D1Database;
    try {
      db = database(event);
    } catch {
      return json({ error: "Database is not configured. Follow the setup guide." }, 503);
    }
    const url = new URL(event.request.url);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit")) || 1000));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const result = await db.prepare(
      `${SELECT_BOOKING} ORDER BY checkin, room, guest LIMIT ? OFFSET ?`
    ).bind(limit, offset).all<BookingRow>();
    return json({ bookings: (result.results ?? []).map(toBooking), limit, offset });
  } catch {
    return json({ error: "Bookings could not be loaded. Please try again." }, 503);
  }
};

export const POST: RequestHandler = async (event) => {
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

  const db = database(event);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare(
    `INSERT INTO bookings
     (id, guest, room, checkin, checkout, guests, source, reference, phone, email,
      status, total_cents, paid_cents, payment_method, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(...bookingToRow(input, id, now));
  let emailId: string | null = null;

  try {
    if (input.status === "Confirmed" && input.email) {
      emailId = crypto.randomUUID();
      const outboxInsert = db.prepare(
        `INSERT INTO email_outbox
         (id, booking_id, event_type, status, attempts, created_at, updated_at)
         VALUES (?, ?, 'confirmation', 'pending', 0, ?, ?)`
      ).bind(emailId, id, now, now);
      await db.batch([insert, outboxInsert]);
    } else {
      await insert.run();
    }
  } catch (error) {
    if (isOverlapError(error)) {
      return json({ error: `${input.room} already has a booking during those dates.` }, 409);
    }
    return json({ error: "Booking could not be saved. Please try again." }, 503);
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
      if (result !== "sent") {
        emailWarning = result === "pending"
          ? "Booking saved, but email is waiting for Resend configuration."
          : "Booking saved, but the confirmation email could not be sent. Retry it from the dashboard.";
      }
    } catch {
      emailWarning = "Booking saved, but the email status could not be confirmed. Check the email retry queue.";
    }
  }

  return json({
    booking: { ...input, id, createdAt: now, updatedAt: now },
    emailWarning
  }, 201);
};
