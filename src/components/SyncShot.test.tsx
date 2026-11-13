// Temporary: screenshots the Sync and Race pages for review. Delete after.
import { it } from "vitest";
import { page } from "vitest/browser";
import { render } from "@solidjs/testing-library";
import { Summary } from "./Summary";
import { Racers } from "./Racers";
import { TestContext } from "@/test/TestContext";
import { mockJSONRequest, testLap, testRace, uuid } from "@/test/fixtures";
import "@/style.css";

const race = testRace({ id: uuid(1), name: "Fun Run 2026", lapFilterSeconds: 30 });
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const devices = [
  { id: uuid(7), user: "Stephen", label: null, lastSeen: ago(1) },
  { id: uuid(8), user: "Sam", label: "Gate B iPad", lastSeen: ago(2) },
  { id: uuid(9), user: "Alex", label: null, lastSeen: ago(21) },
];
const names = ["Maya", "Leo", "Ava", "Noah", "Isla"];
const laps = Array.from({ length: 24 }, (_, i) =>
  testLap({
    id: i,
    runner: uuid(20 + (i % 5)),
    info: { name: names[i % 5] },
    device: devices[i % 3].id,
    timestamp: ago(40 - i * 1.5),
  }),
);
// A rescan 10s after the last lap: shown as a repeat.
laps.push({ ...laps[23], id: 99, device: devices[1].id, timestamp: ago(40 - 23 * 1.5 - 1 / 6) });
const runners = names.map((name, i) => ({
  ref: uuid(20 + i),
  info: { name },
  name: null,
  details: {},
  laps: laps.filter((l) => l.runner === uuid(20 + i)).length,
}));
const api = {
  races: {
    selected: { $get: mockJSONRequest(race) },
    ":id": {
      laps: { $get: mockJSONRequest(laps) },
      devices: { $get: mockJSONRequest(devices) },
      runners: { $get: mockJSONRequest(runners) },
    },
  },
};

it("sync page", async () => {
  await page.viewport(400, 1400);
  render(() => (
    <TestContext deviceId={uuid(7)} api={api}>
      <main>
        <Summary />
      </main>
    </TestContext>
  ));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "../../remoter/files/sync-page.png" });
  await page.getByRole("button", { name: "Gate B iPad" }).click();
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: "../../remoter/files/sync-page-device.png" });
});

it("race page", async () => {
  await page.viewport(400, 500);
  render(() => (
    <TestContext deviceId={uuid(7)} api={api}>
      <main>
        <Racers />
      </main>
    </TestContext>
  ));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "../../remoter/files/race-page.png" });
});
