import { expect, describe, it, Mock } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { ShowRaceQR } from "./SelectedRaceQR";
import { TestContext, TEST_ORIGIN } from "@/test/TestContext";
import { mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("SelectedRaceQR", () => {
  it("shows the QR code for the currently selected race", async () => {
    const $get: Mock = mockJSONRequest(testRace({ name: "Spring 5k" }));

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { selected: { $get } } }}>
          <ShowRaceQR />
        </TestContext>
      )),
    );

    const showRaceQr = await views.selectedRaceQr();
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

    const showRaceQr = await views.selectedRaceQr();
    await waitFor(async () => {
      const qrCodeValue = await showRaceQr.qrCodeValue();
      expect(qrCodeValue).toStrictEqual(
        `${TEST_ORIGIN}/join/${uuid(7)}?name=Spring+5k`,
      );
    });
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

    const showRaceQr = await views.selectedRaceQr();
    await waitFor(() =>
      expect(showRaceQr.text).toStrictEqual("Select a race."),
    );
  });
});
