interface OutboxMessage {
  id: string;
  event_type: "confirmation" | "updated" | "cancelled";
  status: "pending" | "sent" | "failed";
  attempts: number;
  guest: string;
  room: string;
  checkin: string;
  checkout: string;
  guests: number;
  email: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function emailContent(message: OutboxMessage) {
  const guest = escapeHtml(message.guest);
  const verb = message.event_type === "cancelled"
    ? "Cancellation update"
    : message.event_type === "confirmation"
      ? "Booking confirmation"
      : "Booking update";
  return {
    subject: `${verb} — Fulhadhoo Beach Cottage`,
    html: `<p>Dear ${guest},</p>
      <p>${verb.toLowerCase()} for your stay at Fulhadhoo Beach Cottage.</p>
      <ul>
        <li>Room: ${escapeHtml(message.room)}</li>
        <li>Check-in: ${escapeHtml(message.checkin)}</li>
        <li>Check-out: ${escapeHtml(message.checkout)}</li>
        <li>Guests: ${message.guests}</li>
      </ul>
      <p>Please reply to this email if you have any questions.</p>`
  };
}

export async function sendOutboxMessage(
  db: D1Database,
  id: string,
  apiKey: string | undefined,
  from: string | undefined
): Promise<"sent" | "pending" | "failed"> {
  const message = await db.prepare(
    `SELECT email_outbox.id, email_outbox.event_type, email_outbox.status,
            email_outbox.attempts, bookings.guest, bookings.room,
            bookings.checkin, bookings.checkout, bookings.guests,
            bookings.email
     FROM email_outbox JOIN bookings ON bookings.id = email_outbox.booking_id
     WHERE email_outbox.id = ?`
  ).bind(id).first<OutboxMessage>();

  if (!message) return "failed";
  if (message.status === "sent") return "sent";
  if (!apiKey || !from) return "pending";

  const content = emailContent(message);
  let success = false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.id
      },
      body: JSON.stringify({
        from,
        to: [message.email],
        subject: content.subject,
        html: content.html
      })
    });
    success = response.ok;
  } catch {
    success = false;
  }

  await db.prepare(
    `UPDATE email_outbox
     SET status = ?, attempts = attempts + 1, updated_at = ?, error_code = ?
     WHERE id = ?`
  ).bind(
    success ? "sent" : "failed",
    Math.floor(Date.now() / 1000),
    success ? null : "provider_error",
    id
  ).run();

  return success ? "sent" : "failed";
}
