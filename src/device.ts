const DEVICE_ID_KEY = "laps:deviceId";

// Stable per-browser identity, independent of the logged-in user, so the
// same login on two phones shows up as two devices in the summary view.
export function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    // storage unavailable (private mode, disabled) - fall through to a
    // fresh id that just won't persist across reloads.
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      // best effort
    }
  }
  return id;
}
