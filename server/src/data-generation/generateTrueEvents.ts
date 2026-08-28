// Generates clean base "true events" — one idealized financial transaction each.
// No discrepancy types are assigned here; seedDatabase.ts orchestrates taxonomy
// assignment and calls into discrepancies/ after this runs.
//
// Amount convention: string with exactly 2 decimal places (e.g. "4847.50"), never
// a JS number — matches the project rule that currency math must not use native
// floating point. Values are built from integer paise, then formatted to string.
// Callers / discrepancy injectors that need arithmetic should parse via paise
// (BigInt or integer) or Prisma Decimal, not Number().
//
// PRNG: inline Mulberry32 seeded LCG — no extra dependency for a single seeded
// generator, and identical seed ⇒ identical event list across sessions.

export interface TrueEvent {
  /** Stable, deterministic id: evt_0001 … evt_00NN (index-based, not UUID —
   *  UUIDs would break seed reproducibility). */
  eventId: string;
  /** INR amount as a 2-decimal string, e.g. "4847.50". */
  amount: string;
  currency: string;
  /** When the transaction truly occurred (ISO-8601), before any lag injection. */
  baseDate: string;
  description: string;
  merchantOrPayer: string;
}

/** Mulberry32 — fast 32-bit seeded PRNG; returns [0, 1). */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randomInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

/** Build amount string from integer paise — never Number arithmetic on rupees. */
function formatPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${rupees}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Skewed amount distribution (in paise):
 * ~25% small (< ₹1,000), ~60% mid (₹1,000–₹25,000), ~15% large (₹25,000–₹2,50,000).
 * Includes non-round paise values so amounts look like real settlements.
 */
function randomAmountPaise(rng: () => number): number {
  const roll = rng();
  let minPaise: number;
  let maxPaise: number;
  if (roll < 0.25) {
    minPaise = 5_00; // ₹5.00
    maxPaise = 999_99; // ₹999.99
  } else if (roll < 0.85) {
    minPaise = 1_000_00; // ₹1,000.00
    maxPaise = 25_000_00; // ₹25,000.00
  } else {
    minPaise = 25_000_01;
    maxPaise = 2_50_000_00; // ₹2,50,000.00
  }
  return randomInt(rng, minPaise, maxPaise);
}

const MERCHANTS = [
  "Swiggy Bangalore",
  "Amazon India",
  "Uber Trip",
  "IRCTC Booking",
  "Flipkart Marketplace",
  "Zomato Hyderabad",
  "Paytm Merchant",
  "BigBasket Fresh",
  "Myntra Fashion",
  "PhonePe P2M",
  "Jio Recharge",
  "Airtel Prepaid",
  "BookMyShow Tickets",
  "MakeMyTrip Hotels",
  "Ola Cabs",
  "Nykaa Beauty",
  "Croma Electronics",
  "Decathlon Sports",
  "Apollo Pharmacy",
  "Dominos Pizza",
  "Starbucks Coffee",
  "IKEA India",
  "Reliance Digital",
  "Tata Cliq",
  "Cleartrip Flights",
] as const;

const DESCRIPTION_TEMPLATES = [
  "UPI payment to {merchant}",
  "Card purchase at {merchant}",
  "Netbanking transfer — {merchant}",
  "Wallet top-up via {merchant}",
  "Subscription renewal — {merchant}",
  "Order settlement {merchant}",
  "Refundable hold — {merchant}",
  "POS debit {merchant}",
  "QR collect from {merchant}",
  "Invoice payout {merchant}",
] as const;

/** Base calendar window for true event dates (inclusive start, exclusive end-ish). */
const BASE_YEAR = 2026;
const BASE_MONTH = 5; // June (0-indexed) — mid-year demo window

function randomBaseDate(rng: () => number): string {
  // Spread across ~45 days in June–July 2026, with random time-of-day.
  const dayOffset = randomInt(rng, 0, 44);
  const hour = randomInt(rng, 0, 23);
  const minute = randomInt(rng, 0, 59);
  const second = randomInt(rng, 0, 59);
  const ms = randomInt(rng, 0, 999);
  const date = new Date(Date.UTC(BASE_YEAR, BASE_MONTH, 1 + dayOffset, hour, minute, second, ms));
  return date.toISOString();
}

/**
 * Generate `count` clean true events using `seed` for full reproducibility.
 * Does not assign discrepancy types — callers (seedDatabase.ts) own that.
 */
export function generateTrueEvents(count: number, seed: number): TrueEvent[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`generateTrueEvents: count must be a positive integer, got ${count}`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`generateTrueEvents: seed must be an integer, got ${seed}`);
  }

  const rng = createSeededRng(seed);
  const events: TrueEvent[] = [];

  for (let i = 0; i < count; i++) {
    const merchantOrPayer = pick(rng, MERCHANTS);
    const template = pick(rng, DESCRIPTION_TEMPLATES);
    const description = template.replace("{merchant}", merchantOrPayer);
    const eventId = `evt_${String(i + 1).padStart(4, "0")}`;

    events.push({
      eventId,
      amount: formatPaise(randomAmountPaise(rng)),
      currency: "INR",
      baseDate: randomBaseDate(rng),
      description,
      merchantOrPayer,
    });
  }

  return events;
}
