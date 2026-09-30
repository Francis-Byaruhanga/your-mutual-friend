/** Minimum and maximum age at the point of cover starts. */
export const MINIMUM_AGE_YEARS = 18;
export const MAXIMUM_AGE_YEARS = 65;

const DATE_OF_BIRTH_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z '-]{1,39}$/;
const TICKET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-/]{4,19}$/;

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

export function ageInYears(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Parses the date of birth exactly as the brief specifies: dd.mm.yyyy with dot
 * separators, matching what is printed on the Ugandan National ID.
 */
export function parseDateOfBirth(input: string, now: Date = new Date()): ValidationResult<Date> {
  const raw = input.trim();
  const match = DATE_OF_BIRTH_PATTERN.exec(raw);

  if (!match) {
    return fail('Date must be in the format dd.mm.yyyy');
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Rejects impossible dates such as 31.02.1999, which Date would silently roll over.
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  if (!isRealDate) {
    return fail('That date does not exist. Please check and try again');
  }

  if (parsed.getTime() > now.getTime()) {
    return fail('Date of birth cannot be in the future');
  }

  const age = ageInYears(parsed, now);
  if (age < MINIMUM_AGE_YEARS) {
    return fail(`You must be at least ${MINIMUM_AGE_YEARS} years old to buy this cover`);
  }
  if (age > MAXIMUM_AGE_YEARS) {
    return fail(`Cover is available up to age ${MAXIMUM_AGE_YEARS} only`);
  }

  return ok(parsed);
}

/** Formats a Date back into the dd.mm.yyyy shape the customer typed. */
export function formatDateOfBirth(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

export function parseName(input: string, label: string): ValidationResult<string> {
  const raw = input.trim().replace(/\s+/g, ' ');
  if (raw.length === 0) {
    return fail(`${label} cannot be empty`);
  }
  if (!NAME_PATTERN.test(raw)) {
    return fail(`${label} should be 2 to 40 letters only`);
  }
  return ok(raw.split(' ').map(capitalise).join(' '));
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function parseTicketNumber(input: string): ValidationResult<string> {
  const raw = input.trim().toUpperCase();
  if (!TICKET_PATTERN.test(raw)) {
    return fail('Ticket number must be 5 to 20 letters or digits');
  }
  return ok(raw);
}

/**
 * USSD only sends digits for a menu selection, but some telcos pad or mangle
 * input, so a little defensive trimming keeps the journey moving.
 */
export function parseMenuChoice(input: string): string {
  return input.trim();
}
