// ── Date authority ───────────────────────────────────────────────────────────
// Every calendar date in FORGE is a "YYYY-MM-DD" string in the USER'S timezone —
// the same timezone the backend uses when it stamps a completion (see
// logic.get_user_today). The app previously derived dates from
// `new Date().toISOString()`, which is UTC, so for anyone not on UTC there was a
// window every day where the client asked about one date while the server wrote
// another: an IST user checking in at 00:30 local wrote to tomorrow while the
// dashboard queried yesterday, and the tick appeared to reset.
//
// Day arithmetic here runs on UTC-midnight Date objects built from the string, so
// it can never be shifted by a DST transition in the viewer's local zone.

/** Format a Date as YYYY-MM-DD in the given IANA timezone. */
export function dateInTz(date, timeZone) {
  const opts = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    // en-CA renders as YYYY-MM-DD, which is exactly the wire format.
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone }).format(date);
  } catch {
    // Unknown/absent timezone — fall back to the device's own zone.
    return new Intl.DateTimeFormat("en-CA", opts).format(date);
  }
}

/** Today's date string in the given timezone. */
export function todayInTz(timeZone) {
  return dateInTz(new Date(), timeZone);
}

/** The device's IANA timezone, used when the account has none stored yet. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "YYYY-MM-DD" -> Date at UTC midnight. Safe for pure day arithmetic. */
export function parseDateStr(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Date (assumed UTC-midnight) -> "YYYY-MM-DD". */
export function formatDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Shift a date string by n whole days. */
export function addDays(s, n) {
  const d = parseDateStr(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDateStr(d);
}

/** Whole days between two date strings (b - a). */
export function daysBetween(a, b) {
  return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000);
}

/**
 * ISO weekday for a date string: 0=Mon … 6=Sun.
 * The backend uses this convention everywhere (frequency_days, notification
 * rules, day-of-week patterns), so the UI must match it rather than JS's
 * Sunday-first getDay().
 */
export function weekdayIso(s) {
  const js = parseDateStr(s).getUTCDay(); // 0=Sun
  return js === 0 ? 6 : js - 1;
}

/** The Monday of the ISO week containing this date string. */
export function isoWeekMonday(s) {
  return addDays(s, -weekdayIso(s));
}

/** N date strings ending at (and including) `endStr`, oldest first. */
export function lastNDays(endStr, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endStr, -i));
  return out;
}
