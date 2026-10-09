import { App } from "@/App";
import { hydrate, render } from "solid-js/web";
import { ApiType } from "@/api";
import { hc } from "hono/client";
import { browserScanner } from "@/scanner";
import { getDeviceId } from "@/device";
import { createOfflineEngine, initSync } from "@/offline";

const deviceId = getDeviceId();
const offline = createOfflineEngine();

const api = hc<ApiType>(window.location?.origin ?? "", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Device-Id", deviceId);
    const race = offline.state().selectedRace;
    if (race) headers.set("X-Race-Id", race.id);
    return fetch(input, { ...init, headers });
  },
});

void initSync(offline, api);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

const root = document.getElementById("root")!;
const app = () => (
  <App
    api={api}
    scanner={browserScanner}
    offline={offline}
    deviceId={deviceId}
    origin={window.location.origin}
  />
);

// A server-rendered page always has content to attach to; the offline app
// shell's root is empty, so it's rendered from scratch for whatever address
// was actually opened.
if (root.hasChildNodes()) hydrate(app, root);
else render(app, root);
