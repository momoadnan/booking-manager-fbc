import { digest } from "#lib/server/auth";

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 10;

export async function rateLimited(db: D1Database, scope: string, ip: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const keyHash = await digest(`${scope}:${ip}`);

  await db.prepare(
    `INSERT INTO auth_attempts (key_hash, attempts, window_started_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE
         WHEN window_started_at <= ? THEN 1
         ELSE attempts + 1
       END,
       window_started_at = CASE
         WHEN window_started_at <= ? THEN ?
         ELSE window_started_at
       END`
  ).bind(keyHash, now, now - WINDOW_SECONDS, now - WINDOW_SECONDS, now).run();

  const row = await db.prepare(
    "SELECT attempts FROM auth_attempts WHERE key_hash = ?"
  ).bind(keyHash).first<{ attempts: number }>();
  return (row?.attempts ?? 0) > MAX_ATTEMPTS;
}

export async function clearRateLimit(db: D1Database, scope: string, ip: string): Promise<void> {
  await db.prepare("DELETE FROM auth_attempts WHERE key_hash = ?")
    .bind(await digest(`${scope}:${ip}`)).run();
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}
