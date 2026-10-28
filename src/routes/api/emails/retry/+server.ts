import { sendOutboxMessage } from "#lib/server/email";
import { database, environment, json, requireUser, sameOrigin } from "#lib/server/http";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  if (!requireUser(event)) return json({ error: "Sign in to retry email." }, 401);
  if (!sameOrigin(event.request)) return json({ error: "Request origin was not accepted." }, 403);

  try {
    const db = database(event);
    const pending = await db.prepare(
      `SELECT id FROM email_outbox
       WHERE status IN ('pending', 'failed') AND attempts < 5
       ORDER BY created_at LIMIT 20`
    ).all<{ id: string }>();
    let sent = 0;
    let failed = 0;
    let waiting = 0;

    for (const item of pending.results ?? []) {
      const result = await sendOutboxMessage(
        db,
        item.id,
        environment().RESEND_API_KEY,
        environment().RESEND_FROM
      );
      if (result === "sent") sent++;
      else if (result === "failed") failed++;
      else waiting++;
    }

    return json({ sent, failed, waiting, message: `Sent ${sent}; failed ${failed}; waiting ${waiting}.` });
  } catch {
    return json({ error: "Queued email could not be retried. Please try again." }, 503);
  }
};
