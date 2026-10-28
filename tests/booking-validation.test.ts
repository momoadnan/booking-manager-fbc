import assert from "node:assert/strict";
import test from "node:test";
import { InputError, isValidDate, validateBooking } from "../src/lib/server/booking-validation.ts";

const validBooking = {
  guest: "A guest",
  room: "Kaani",
  checkin: "2026-02-28",
  checkout: "2026-03-02",
  guests: 2,
  source: "Direct / Website",
  reference: "ABC-123",
  phone: "+960 1234567",
  email: "guest@example.com",
  status: "Confirmed",
  total: 250.5,
  paid: 100,
  paymentMethod: "Bank transfer",
  notes: "Arriving by boat."
};

test("validates and normalizes a booking", () => {
  const booking = validateBooking(validBooking);
  assert.equal(booking.guest, "A guest");
  assert.equal(booking.email, "guest@example.com");
  assert.equal(booking.total, 250.5);
});

test("accepts actual leap days and rejects impossible dates", () => {
  assert.equal(isValidDate("2028-02-29"), true);
  assert.equal(isValidDate("2027-02-29"), false);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(isValidDate("2026-2-01"), false);
});

test("rejects overlapping-date shape and invalid guest counts", () => {
  assert.throws(() => validateBooking({ ...validBooking, checkout: validBooking.checkin }), InputError);
  assert.throws(() => validateBooking({ ...validBooking, guests: 0 }), InputError);
  assert.throws(() => validateBooking({ ...validBooking, guests: 1.5 }), InputError);
});

test("rejects amounts that exceed the paid total or contain fractions of a cent", () => {
  assert.throws(() => validateBooking({ ...validBooking, paid: 251 }), InputError);
  assert.throws(() => validateBooking({ ...validBooking, total: 10.001 }), InputError);
});

test("rejects malformed email, unsupported fields, and oversized notes", () => {
  assert.throws(() => validateBooking({ ...validBooking, email: "not-an-email" }), InputError);
  assert.throws(() => validateBooking({ ...validBooking, isAdmin: true }), InputError);
  assert.throws(() => validateBooking({ ...validBooking, notes: "x".repeat(4001) }), InputError);
});
