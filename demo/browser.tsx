import { render } from "solid-js/web";
import { hc } from "hono/client";
import { App } from "@/App";
import type { ApiType } from "@/api";
import { createOfflineEngine, emptyState, initSync } from "@/offline";
import { DEMO_DEVICE_ID, DEMO_RACER_ID, DEMO_RACER_NAME } from "@/demo/constants";
import { createDemoScanner } from "@/demo/scanner";
import { installDemoPresentation } from "@/demo/presentation";
import "../src/style.css";
import "./demo.css";

declare global {
  interface Window {
    __LAPS_DEMO_CONFIG__?: {
      apiOrigin: string;
      racerVideo?: string;
      scanAt: number;
      cropPosition: string;
      cropZoom: number;
      fixedNow: string;
    };
    __LAPS_DEMO_SHOW_SPREADSHEET__?: (payload: {
      raceName: string;
      importedFileName: string;
      importedCsv: string;
      exportedFileName: string;
      exportedCsv: string;
    }) => void;
  }
}

const config = window.__LAPS_DEMO_CONFIG__;
if (!config) throw new Error("The Playwright demo configuration is missing");

const offline = createOfflineEngine(emptyState());
const api = hc<ApiType>(config.apiOrigin, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Device-Id", DEMO_DEVICE_ID);
    const race = offline.state().selectedRace;
    if (race) headers.set("X-Race-Id", race.id);
    return fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });
  },
});

const scanner = createDemoScanner({
  racerVideo: config.racerVideo,
  scanAt: config.scanAt,
  cropPosition: config.cropPosition,
  cropZoom: config.cropZoom,
  payload: DEMO_RACER_ID,
  beforeDecode: () => {
    const raceId = offline.state().selectedRace?.id;
    if (raceId)
      offline.rememberNames(raceId, [
        { ref: DEMO_RACER_ID, name: DEMO_RACER_NAME },
      ]);
  },
});

installDemoPresentation();
void initSync(offline, api);

render(
  () => (
    <App
      api={api}
      scanner={scanner}
      offline={offline}
      deviceId={DEMO_DEVICE_ID}
      origin={window.location.origin}
    />
  ),
  document.getElementById("root")!,
);
