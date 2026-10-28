const SESSION_COOKIE = "fbc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 600_000;
const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    difference |= (a[index % (a.length || 1)] ?? 0) ^ (b[index % (b.length || 1)] ?? 0);
  }
  return difference === 0;
}

export function constantTimeStringEqual(a: string, b: string): boolean {
  return constantTimeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  const isValidFormat = parts.length === 4 &&
    parts[0] === "pbkdf2-sha256" &&
    /^\d+$/.test(parts[1]) &&
    Number(parts[1]) >= 100_000 &&
    Number(parts[1]) <= 1_000_000;
  const candidate = isValidFormat ? encoded : DUMMY_HASH;
  const [, iterationText, saltText, hashText] = candidate.split("$");
  const actual = await derive(password, fromBase64(saltText), Number(iterationText));
  if (!isValidFormat) return false;
  return constantTimeEqual(actual, fromBase64(hashText));
}

export async function digest(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(tokenHash, userId, now + SESSION_TTL_SECONDS, now).run();
  return token;
}

export async function readSession(db: D1Database, token: string) {
  const tokenHash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await db.prepare(
    `SELECT users.id, users.email, users.role, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?`
  ).bind(tokenHash).first<{ id: string; email: string; role: "owner"; expires_at: number }>();

  if (!session) return null;
  if (session.expires_at <= now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { id: session.id, email: session.email, role: session.role };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digest(token)).run();
}

export function sessionCookieOptions(request: Request) {
  const url = new URL(request.url);
  return {
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax" as const,
    maxAge: SESSION_TTL_SECONDS
  };
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
