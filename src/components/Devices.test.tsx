import { expect, describe, it, Mock } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Devices } from "./Devices";
import { TestContext } from "@/test/TestContext";
import { mockJSONRequest, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

const device = (id: string, user: string, label: string | null = null) => ({
  id,
  user,
  label,
  lastSeen: "2026-09-02T11:30:00.000Z",
});

describe("Devices", () => {
  it("lists each reporting device by its memorable name and user", async () => {
    const $get: Mock = mockJSONRequest([
      device(uuid(1), "Stephen"),
      device(uuid(2), "Stephen"),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { devices: { $get } } } }}>
          <Devices raceId={uuid(1)} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    expect($get).toHaveBeenCalledExactlyOnceWith({ param: { id: uuid(1) } });
    expect(devices.count).toStrictEqual("2 devices reporting");
    expect(devices.items()).toStrictEqual([
      { name: "Bouncy Amber Alpaca", user: "Stephen", current: false },
      { name: "Bouncy Amber Badger", user: "Stephen", current: false },
    ]);
  });

  it("shows this device's name and marks it in the list", async () => {
    const $get: Mock = mockJSONRequest([
      device(uuid(1), "Stephen"),
      device(uuid(2), "Jamie"),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext
          deviceId={uuid(2)}
          api={{ races: { ":id": { devices: { $get } } } }}
        >
          <Devices raceId={uuid(1)} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    await waitFor(() =>
      expect(devices.thisDevice).toStrictEqual("Bouncy Amber Badger"),
    );
    expect(devices.items().map((d) => d.current)).toStrictEqual([false, true]);
  });

  it("shows this device's name even before it has reported", async () => {
    const $get: Mock = mockJSONRequest([]);

    const views = loadViews(
      render(() => (
        <TestContext
          deviceId={uuid(3)}
          api={{ races: { ":id": { devices: { $get } } } }}
        >
          <Devices raceId={uuid(1)} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    await waitFor(() =>
      expect(devices.thisDevice).toStrictEqual("Bouncy Amber Beaver"),
    );
    expect(devices.count).toStrictEqual("0 devices reporting");
    expect(devices.items()).toStrictEqual([]);
  });

  it("prefers a device's label over its generated name", async () => {
    const $get: Mock = mockJSONRequest([
      device(uuid(1), "Stephen", "Finish line"),
    ]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { devices: { $get } } } }}>
          <Devices raceId={uuid(1)} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    expect(devices.items()[0].name).toStrictEqual("Finish line");
  });
});
