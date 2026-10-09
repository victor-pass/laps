import { expect, describe, it, Mock } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { ShowRaceQR } from "./RaceQR";
import { TestContext, TEST_ORIGIN, testApi } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("RaceQR", () => {
  it("shows the QR code for the currently selected race", async () => {
    const $get: Mock = mockJSONRequest(testRace({ name: "Spring 5k" }));

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { selected: { $get } } }}>
          <ShowRaceQR />
        </TestContext>
      )),
    );

    const showRaceQr = await views.raceQR();
    await waitFor(() => expect(showRaceQr.hasQrCode()).toBe(true));
  });

  it("links to the race's join page so volunteers don't need the app", async () => {
    const $get: Mock = mockJSONRequest(testRace({ id: uuid(7) }));

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { selected: { $get } } }}>
          <ShowRaceQR />
        </TestContext>
      )),
    );

    const showRaceQr = await views.raceQR();
    await waitFor(async () => {
      const qrCodeValue = await showRaceQr.qrCodeValue();
      expect(qrCodeValue).toStrictEqual(
        `${TEST_ORIGIN}/join/${uuid(7)}?name=Spring+5k`,
      );
    });
  });

  it("shows the QR code for a race chosen elsewhere in the app", async () => {
    const $get: Mock = mockJSONRequest(
      testRace({ id: uuid(1), name: "Spring 5k" }),
    );
    const offline = createOfflineEngine(emptyState());

    const views = loadViews(
      render(() => (
        <TestContext offline={offline} api={{ races: { selected: { $get } } }}>
          <ShowRaceQR />
        </TestContext>
      )),
    );

    const showRaceQr = await views.raceQr();
    await waitFor(async () =>
      expect(await showRaceQr.qrCodeValue()).toStrictEqual(
        `${TEST_ORIGIN}/join/${uuid(1)}?name=Spring+5k`,
      ),
    );

    // e.g. from the race picker
    offline.selectRace(testApi(), testRace({ id: uuid(2), name: "Trail Run" }));

    await waitFor(async () =>
      expect(await (await views.raceQr()).qrCodeValue()).toStrictEqual(
        `${TEST_ORIGIN}/join/${uuid(2)}?name=Trail+Run`,
      ),
    );
  });

  it("lets the user know no race is selected", async () => {
    const $get: Mock = mockJSONRequest(null);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { selected: { $get } } }}>
          <ShowRaceQR />
        </TestContext>
      )),
    );

    const showRaceQr = await views.raceQr();
    await waitFor(() =>
      expect(showRaceQr.text).toStrictEqual("Select a race."),
    );
  });
});
