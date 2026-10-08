import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSX } from "solid-js";
import { renderToStringAsync } from "solid-js/web";
import { createApp } from "@/App";
import { noopScanner } from "@/scanner";
import { noopOfflineEngine } from "@/offline";
import { ConfirmRace } from "@/components/ConfirmRace";
import { CreateRace } from "@/components/CreateRace";
import { createPopupService } from "@/components/Popup";
import { ApiOverrides, TestContext, testApi } from "@/test/TestContext";
import { mockJSONRequest, testLap, testRace, uuid } from "@/test/fixtures";

async function render(fn: () => JSX.Element): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("server render did not finish")),
      2000,
    );
  });
  try {
    return await Promise.race([renderToStringAsync(fn), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Visible text only - drops tags and Solid's hydration comment markers.
const text = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const race = testRace({ id: uuid(1), name: "Spring 5k" });

const api: ApiOverrides = {
  races: {
    $get: mockJSONRequest([race]),
    selected: { $get: mockJSONRequest(race) },
    ":id": {
      laps: {
        $get: mockJSONRequest([
          testLap({ runner: "runner-1", info: { name: "Jamie" } }),
        ]),
      },
      devices: {
        $get: mockJSONRequest([
          {
            id: uuid(5),
            user: "dev",
            label: "Finish line",
            lastSeen: "2026-01-01T00:00:00.000Z",
          },
        ]),
      },
    },
  },
};

const renderRoute = (url: string) =>
  render(() =>
    createApp({
      api: testApi(api),
      scanner: noopScanner,
      offline: noopOfflineEngine,
      url,
    }),
  );

describe("server rendering", () => {
  describe("routes", () => {
    it.each([
      ["/scanFront", "Scan Front"],
      ["/scanBack", "Scan Back"],
    ])(
      "renders %s with the camera, menu and selected race",
      async (url, menu) => {
        const html = await renderRoute(url);
        expect(html).toMatch(/<div[^>]*class="scan"/);
        expect(html).toContain("<video");
        expect(text(html)).toContain(`☰ ${menu}`);
        expect(text(html)).toContain("Spring 5k");
      },
    );

    it("renders /summary with devices, lap counts and race settings", async () => {
      const html = await renderRoute("/summary");
      const visible = text(html);
      expect(visible).toContain("☰ Summary");
      expect(visible).toContain("1 device reporting");
      expect(visible).toContain("Device User Last seen");
      expect(visible).toContain("Finish line dev");
      expect(visible).toContain("Name Runner ID Laps");
      expect(visible).toContain("Jamie runner-1 1");
      // Only the browser knows which device it is.
      expect(visible).not.toContain("This device");
      expect(visible).toContain("Minimum seconds between counted laps");
      expect(visible).toContain("Export laps (CSV)");
    });

    it("renders /share with the race QR code", async () => {
      const html = await renderRoute("/share");
      expect(text(html)).toContain("☰ Share");
      expect(html).toMatch(/<div[^>]*class="show-race-qr"[\s\S]*<svg/);
    });
  });

  // Components that only appear after an interaction, so no route
  // renders them on first load.
  describe("components", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("renders the race switch prompt", async () => {
      const html = await render(() => (
        <ConfirmRace race={race} onConfirm={() => {}} onCancel={() => {}} />
      ));
      expect(text(html)).toStrictEqual(
        'Switch to race "Spring 5k"? Switch Cancel',
      );
    });

    it("renders the new race form", async () => {
      const html = await render(() => (
        <TestContext>
          <CreateRace onCancel={() => {}} onCreate={() => {}} />
        </TestContext>
      ));
      expect(html).toMatch(/<form[^>]*class="create-race"/);
      expect(html).toContain('placeholder="New race name"');
    });

    it("renders stacked popups", async () => {
      const popup = createPopupService();
      popup.push({ message: "Lap 1 - Jamie", type: "success" });
      popup.push({ message: "Race not found", type: "error" });

      const html = await render(() => <TestContext popup={popup} />);
      expect(html).toMatch(/<div[^>]*class="popups"/);
      expect(html).toMatch(/class="popup success"[^>]*>Lap 1 - Jamie/);
      expect(html).toMatch(/class="popup error"[^>]*>Race not found/);
    });
  });
});
