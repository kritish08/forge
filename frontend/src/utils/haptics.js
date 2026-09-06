/**
 * Haptic feedback.
 *
 * Checking a habit off is the app's one moment of satisfaction and it produced a
 * CSS scale animation and nothing else. Vibration is unsupported on iOS Safari
 * and can be disabled by the user, so every call is best-effort — never gate UI
 * on it.
 */
function buzz(pattern) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* unsupported or blocked — nothing to do */
  }
}

/** A habit was completed. */
export const tapSuccess = () => buzz(18);
/** A completion was undone — lighter, so it doesn't feel like a reward. */
export const tapLight = () => buzz(8);
/** Something failed. */
export const tapError = () => buzz([12, 60, 12]);
