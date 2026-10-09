import { Component, Show } from "solid-js";
import { context } from "@/context";

// Shown when the server has rejected this device's login (it expires after
// a day). Nothing is lost meanwhile: scans keep counting here and stay
// queued, and signing in reloads the app, whose startup sync sends them.
export const SignedOut: Component = () => {
  const { offline } = context();
  const waiting = () => {
    const n = offline.pendingCount();
    return n === 1 ? "1 change is" : `${n} changes are`;
  };

  return (
    <Show when={offline.signedOut()}>
      <div class="signed-out" role="alert">
        <p>
          Signed out.{" "}
          <Show when={offline.pendingCount()}>
            {waiting()} saved on this device, waiting to sync.
          </Show>
        </p>
        {/* rel="external" so the router lets the browser leave for login */}
        <a href="/auth/google" rel="external">
          Sign in
        </a>
      </div>
    </Show>
  );
};
