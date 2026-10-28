export const ROOM_NAMES = ["Kaani", "Hirundhu", "Funa", "Dhigga"] as const;
export const STATUSES = ["Confirmed", "Pending", "Cancelled"] as const;

const SOURCES = [
  "Direct / Website",
  "WhatsApp",
  "Phone",
  "Email",
  "Booking.com",
  "Airbnb",
  "Expedia",
  "Travel agent",
  "Walk-in",
  "Other"
] as const;

const PAYMENT_METHODS = [
  "Not specified",
  "Cash",
  "Bank transfer",
  "Card",
  "Paid to booking channel",
  "Other"
] as const;

export interface BookingInput {
  guest: string;
  room: (typeof ROOM_NAMES)[number];
  checkin: string;
  checkout: string;
  guests: number;
  source: (typeof SOURCES)[number];
  reference: string;
  phone: string;
  email: string;
  status: (typeof STATUSES)[number];
  total: number;
  paid: number;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  notes: string;
}

export class InputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum) {
    throw new InputError(`${label} is invalid or too long.`);
  }
  return value.trim();
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function amount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000_000) {
    throw new InputError(`${label} must be a non-negative amount.`);
  }
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.000001) {
    throw new InputError(`${label} can have at most two decimal places.`);
  }
  return cents;
}

export function validateBooking(value: unknown): BookingInput {
  if (!isRecord(value)) throw new InputError("Booking details must be an object.");

  const allowed = new Set([
    "guest", "room", "checkin", "checkout", "guests", "source", "reference",
    "phone", "email", "status", "total", "paid", "paymentMethod", "notes"
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new InputError("Booking contains an unsupported field.");
  }

  const guest = text(value.guest, "Guest name", 100);
  const room = text(value.room, "Room", 30);
  const checkin = value.checkin;
  const checkout = value.checkout;
  const guests = value.guests;
  const source = text(value.source ?? "Other", "Booking source", 40);
  const reference = text(value.reference ?? "", "Reference", 100);
  const phone = text(value.phone ?? "", "Phone", 40);
  const email = text(value.email ?? "", "Email", 150).toLowerCase();
  const status = text(value.status ?? "Confirmed", "Status", 20);
  const paymentMethod = text(value.paymentMethod ?? "Not specified", "Payment method", 40);
  const notes = text(value.notes ?? "", "Notes", 4000);
  const totalCents = amount(value.total, "Total");
  const paidCents = amount(value.paid, "Paid amount");

  if (!guest) throw new InputError("Guest name is required.");
  if (!(ROOM_NAMES as readonly string[]).includes(room)) throw new InputError("Choose a valid room.");
  if (!isValidDate(checkin) || !isValidDate(checkout) || checkout <= checkin) {
    throw new InputError("Choose valid check-in and check-out dates.");
  }
  if (typeof guests !== "number" || !Number.isInteger(guests) || guests < 1 || guests > 10) {
    throw new InputError("Guest count must be between 1 and 10.");
  }
  if (!(SOURCES as readonly string[]).includes(source)) throw new InputError("Choose a valid booking source.");
  if (!(STATUSES as readonly string[]).includes(status)) throw new InputError("Choose a valid booking status.");
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new InputError("Choose a valid payment method.");
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)) {
    throw new InputError("Enter a valid guest email address.");
  }
  if (paidCents > totalCents) throw new InputError("Paid amount cannot exceed the total.");
  return {
    guest,
    room: room as BookingInput["room"],
    checkin,
    checkout,
    guests: guests as number,
    source: source as BookingInput["source"],
    reference,
    phone,
    email,
    status: status as BookingInput["status"],
    total: totalCents / 100,
    paid: paidCents / 100,
    paymentMethod: paymentMethod as BookingInput["paymentMethod"],
    notes
  };
}

export function bookingToRow(input: BookingInput, id: string, timestamp: number) {
  return [
    id, input.guest, input.room, input.checkin, input.checkout, input.guests,
    input.source, input.reference, input.phone, input.email, input.status,
    Math.round(input.total * 100), Math.round(input.paid * 100),
    input.paymentMethod, input.notes, timestamp, timestamp
  ];
}
