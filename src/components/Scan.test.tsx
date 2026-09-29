import { expect, describe, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { Scan } from "./Scan";
import { TestContext } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import type { QrScanner } from "@/scanner";
import { loadViews } from "@/test/Views/";
import { raceQrData } from "@/qr";

function fakeScanner() {
  let decode: ((text: string) => void) | undefined;
  const start = vi.fn((_video: HTMLVideoElement, onDecode: (text: string) => void) => {
    decode = onDecode;
  });
  const stop = vi.fn();
  const scanner: QrScanner = { start, stop };
  return { scanner, start, stop, decode: (text: string) => decode!(text) };
}

describe("Scan", () => {
  it("records a lap for the scanned racer", async () => {
    const { scanner, decode } = fakeScanner();
    const $post = mockJSONRequest(null);
    const race = testRace();
    const offline = createOfflineEngine({ ...emptyState(), selectedRace: race });

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          offline={offline}
          api={{ runners: { scan: { $post } } }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode("Bib 42");

    const popup = await views.popup();
    expect($post).toHaveBeenCalledExactlyOnceWith({
      json: { data: "Bib 42", race: race.id, timestamp: expect.any(String) },
    });
    expect(popup.message()).toStrictEqual("Lap 1 - Bib 42");
  });

  it("labels the runner by name when the scanned data is a json object", async () => {
    const { scanner, decode } = fakeScanner();
    const $post = mockJSONRequest(null);
    const offline = createOfflineEngine({
      ...emptyState(),
      selectedRace: testRace(),
    });

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          offline={offline}
          api={{ runners: { scan: { $post } } }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode('{"name":"Jamie"}');
    const popup = await views.popup();
    expect(popup.message()).toStrictEqual("Lap 1 - Jamie");
  });

  it("omits the name suffix when the scanned data has no name", async () => {
    const { scanner, decode } = fakeScanner();
    const $post = mockJSONRequest(null);
    const offline = createOfflineEngine({
      ...emptyState(),
      selectedRace: testRace(),
    });

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          offline={offline}
          api={{ runners: { scan: { $post } } }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode('{"bib":42}');
    const popup = await views.popup();
    expect(popup.message()).toStrictEqual("Lap 1");
  });

  it("ignores a repeat scan of the same QR code within the dedupe window", async () => {
    const { scanner, decode } = fakeScanner();
    const $post = mockJSONRequest(null);
    const offline = createOfflineEngine({
      ...emptyState(),
      selectedRace: testRace(),
    });

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          offline={offline}
          api={{ runners: { scan: { $post } } }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode("Bib 42");
    await views.popup();
    decode("Bib 42");

    // Nothing should happen for the second decode - give it a moment to
    // (not) show up before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect($post).toHaveBeenCalledTimes(1);
  });

  it("shows an error when no race is selected", async () => {
    const { scanner, decode } = fakeScanner();
    const offline = createOfflineEngine(emptyState());

    const views = loadViews(
      render(() => (
        <TestContext scanner={scanner} offline={offline}>
          <Scan />
        </TestContext>
      )),
    );

    decode("Bib 42");
    const popup = await views.popup();
    expect(popup.message()).toStrictEqual("Unable to record lap, try again");
  });

  it("asks for confirmation before switching to a scanned race", async () => {
    const { scanner, start, stop, decode } = fakeScanner();
    const preview$get = mockJSONRequest(
      testRace({ id: uuid(1), name: "Trail Run" }),
    );
    const join$post = mockJSONRequest(null);
    const select$put = mockJSONRequest(null);

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          api={{
            races: {
              ":id": { $get: preview$get, join: { $post: join$post } },
              selected: { $put: select$put },
            },
          }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode(raceQrData(uuid(1)));

    const confirmRace = await views.confirmRace();
    expect(preview$get).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
    });
    expect(confirmRace.message()).toStrictEqual('Switch to race "Trail Run"?');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(join$post).not.toHaveBeenCalled();

    confirmRace.confirm();

    const popup = await views.popup();
    expect(join$post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
    });
    // Joining grants membership; selecting it as this device's current
    // race is the separate, coalesced sync.
    expect(select$put).toHaveBeenCalledExactlyOnceWith({
      json: { id: uuid(1) },
    });
    expect(popup.message()).toStrictEqual("Joined Trail Run");
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("does not switch races when the confirmation is cancelled", async () => {
    const { scanner, start, decode } = fakeScanner();
    const preview$get = mockJSONRequest(
      testRace({ id: uuid(1), name: "Trail Run" }),
    );
    const join$post = vi.fn();

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          api={{ races: { ":id": { $get: preview$get, join: { $post: join$post } } } }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode(raceQrData(uuid(1)));
    const confirmRace = await views.confirmRace();

    confirmRace.cancel();

    expect(join$post).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("shows an error when the scanned race can't be found", async () => {
    const { scanner, decode } = fakeScanner();
    const preview$get = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));

    const views = loadViews(
      render(() => (
        <TestContext
          scanner={scanner}
          api={{ races: { ":id": { $get: preview$get } } }}
        >
          <Scan />
        </TestContext>
      )),
    );

    decode(raceQrData(uuid(9)));
    const popup = await views.popup();
    expect(popup.message()).toStrictEqual("Race not found");
  });
});
