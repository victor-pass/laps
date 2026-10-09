import { Component, Match, Switch } from "solid-js";
import { context } from "@/context";

// Warns when this device's laps aren't reaching the server. Nothing is lost
// either way: scans keep counting here and stay queued until a sync gets
// through - automatically once back online, or after signing in again (the
// login expires after a week), which reloads the app and syncs on startup.
export const SyncStatus: Component = () => {
  const { offline } = context();

  const waiting = () => {
    const laps = offline.pendingLaps();
    if (laps === 1) return "1 lap hasn't synced yet - it's saved on this device.";
    if (laps > 1)
      return `${laps} laps haven't synced yet - they're saved on this device.`;
    return offline.pendingCount()
      ? "Changes haven't synced yet - they're saved on this device."
      : "";
  };

  return (
    <Switch>
      <Match when={offline.signedOut()}>
        <div class="sync-status signed-out" role="alert">
          <p>Signed out. {waiting()}</p>
          {/* rel="external" so the router lets the browser leave for login */}
          <a href="/auth/google" rel="external">
            Sign in
          </a>
        </div>
      </Match>
      {/* Only worth a warning while there's something waiting to sync. */}
      <Match when={offline.unreachable() && offline.pendingCount()}>
        <div class="sync-status unreachable" role="status">
          <p>Offline. {waiting()}</p>
        </div>
      </Match>
    </Switch>
  );
};
