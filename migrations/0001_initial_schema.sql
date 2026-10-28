PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL UNIQUE DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE auth_attempts (
  key_hash TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  window_started_at INTEGER NOT NULL
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY NOT NULL,
  guest TEXT NOT NULL CHECK (length(guest) BETWEEN 1 AND 100),
  room TEXT NOT NULL CHECK (room IN ('Kaani', 'Hirundhu', 'Funa', 'Dhigga')),
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 10),
  source TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Confirmed', 'Pending', 'Cancelled')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  paid_cents INTEGER NOT NULL CHECK (paid_cents >= 0 AND paid_cents <= total_cents),
  payment_method TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (checkin < checkout)
);

CREATE INDEX bookings_dates_idx ON bookings(checkin, checkout);
CREATE INDEX bookings_room_dates_idx ON bookings(room, checkin, checkout);

CREATE TRIGGER bookings_no_overlap_insert
BEFORE INSERT ON bookings
WHEN NEW.status != 'Cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM bookings
    WHERE room = NEW.room
      AND status != 'Cancelled'
      AND NEW.checkin < checkout
      AND NEW.checkout > checkin
  ) THEN RAISE(ABORT, 'booking_overlap') END;
END;

CREATE TRIGGER bookings_no_overlap_update
BEFORE UPDATE OF room, checkin, checkout, status ON bookings
WHEN NEW.status != 'Cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM bookings
    WHERE id != NEW.id
      AND room = NEW.room
      AND status != 'Cancelled'
      AND NEW.checkin < checkout
      AND NEW.checkout > checkin
  ) THEN RAISE(ABORT, 'booking_overlap') END;
END;

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('confirmation', 'updated', 'cancelled')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  error_code TEXT
);

CREATE INDEX email_outbox_retry_idx ON email_outbox(status, attempts, created_at);
