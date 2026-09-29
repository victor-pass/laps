export const SCAN_DEDUPE_MS = 1000;

export interface ScanDedupe {
  // True if this exact scanned text hasn't been seen within the window -
  // and, as a side effect, marks it as seen now. False means it's noise
  // from the camera still holding the same QR code in frame and should be
  // ignored outright (no popup, nothing queued).
  shouldProcess(data: string, now?: number): boolean;
}

// A per-scan-session guard against the camera decoding the same QR code on
// every frame it stays in view - without this, holding a runner's code in
// frame for even a second would queue a stream of laps instead of one.
// Scoped in-memory to the caller (a fresh Scan mount starts clean); not
// persisted, since it only needs to suppress a burst of frames, not survive
// a reload.
export function createScanDedupe(windowMs = SCAN_DEDUPE_MS): ScanDedupe {
  const lastSeenMs = new Map<string, number>();
  return {
    shouldProcess(data, now = Date.now()) {
      const last = lastSeenMs.get(data);
      if (last !== undefined && now - last < windowMs) return false;
      lastSeenMs.set(data, now);
      return true;
    },
  };
}
