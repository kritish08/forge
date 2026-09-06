import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { todayInTz, deviceTimeZone } from "../utils/date";

/**
 * Today's date string (YYYY-MM-DD) in the signed-in user's timezone — the single
 * source of "what day is it" for the whole UI. Falls back to the device zone
 * before the account loads, and to UTC if the device has none.
 *
 * This must agree with the backend, which stamps completions using the timezone
 * stored on the user record.
 */
export function useUserTimeZone() {
  const { user } = useAuth();
  return user?.timezone || deviceTimeZone();
}

export function useToday() {
  const tz = useUserTimeZone();
  // Recomputed per render; cheap, and it means a session left open past midnight
  // picks up the new day on the next interaction rather than staying stale.
  return useMemo(() => todayInTz(tz), [tz]);
}
