import { expect, describe, it } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { TestContext, TEST_ORIGIN, offlineApi } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";
import { ChooseRace } from "@/components/ChooseRace";
import { Summary } from "@/components/Summary";
import { ShowRaceQR } from "@/components/RaceQR";
import type { JSX } from "solid-js";

// The installed app opened with no server at all (the offline app shell):
// every page has to work from this device's own state.
describe("launching offline", () => {
  const race = testRace({ id: uuid(1), name: "Trail Run" });
  const deviceState = () =>
    createOfflineEngine({
      ...emptyState(),
      selectedRace: race,
      races: [race],
      lapsByRace: {
        [race.id]: [
          { runner: "runner-1", timestamp: "2026-01-01T10:00:00.000Z" },
          { runner: "runner-1", timestamp: "2026-01-01T10:10:00.000Z" },
        ],
      },
    });

  const renderOffline = (page: () => JSX.Element) =>
    loadViews(
      render(() => (
        <TestContext offline={deviceState()} api={offlineApi()}>
          {page()}
        </TestContext>
      )),
    );

  it("shows this device's race in the race picker", async () => {
    const views = renderOffline(() => <ChooseRace />);

    const chooseRace = await views.chooseRace();
    await waitFor(() =>
      expect(chooseRace.selectedValue).toStrictEqual("Trail Run"),
    );
    expect(chooseRace.options()).toEqual(["Trail Run", "New race"]);
  });

  it("summarises the laps recorded on this device", async () => {
    const views = renderOffline(() => <Summary />);

    const lapCounts = await views.lapCounts();
    await waitFor(() =>
      expect(lapCounts.items()).toStrictEqual([
        { name: "—", id: "runner-1", count: 2 },
      ]),
    );
    expect((await views.devices()).items()).toEqual([]);
  });

  it("shows the QR code for this device's race", async () => {
    const views = renderOffline(() => <ShowRaceQR />);

    const raceQr = await views.raceQr();
    await waitFor(async () =>
      expect(await raceQr.qrCodeValue()).toStrictEqual(
        `${TEST_ORIGIN}/join/${uuid(1)}?name=Trail+Run`,
      ),
    );
  });
});
