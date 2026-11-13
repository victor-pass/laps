import { expect, describe, it, vi, Mock } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { Devices } from "./Devices";
import { TestContext } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { mockJSONRequest, testLap, uuid } from "@/test/fixtures";
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

  it("shows each device's scans, latest scan and how recently it was seen", async () => {
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const $get: Mock = mockJSONRequest([
      { ...device(uuid(1), "Stephen"), lastSeen: ago(1) },
      { ...device(uuid(2), "Jamie"), lastSeen: ago(10) },
      { ...device(uuid(3), "Sam"), lastSeen: ago(60) },
    ]);
    const laps = [
      testLap({ device: uuid(1), timestamp: "2026-09-02T11:30:00.000Z" }),
      testLap({ device: uuid(1), timestamp: "2026-09-02T11:45:00.000Z" }),
      testLap({ device: uuid(2), timestamp: "2026-09-02T11:40:00.000Z" }),
    ];

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { devices: { $get } } } }}>
          <Devices raceId={uuid(1)} laps={laps} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    await waitFor(() => expect(devices.items()).toHaveLength(3));
    const at = (iso: string) => new Date(iso).toLocaleTimeString();
    expect(devices.scans()).toStrictEqual([
      { scans: 2, last: at("2026-09-02T11:45:00.000Z") },
      { scans: 1, last: at("2026-09-02T11:40:00.000Z") },
      { scans: 0, last: "—" },
    ]);
    expect(devices.activity()).toStrictEqual(["live", "idle", "gone"]);
  });

  it("says this device is up to date once everything has synced", async () => {
    const views = loadViews(
      render(() => (
        <TestContext
          deviceId={uuid(2)}
          api={{ races: { ":id": { devices: { $get: mockJSONRequest([]) } } } }}
        >
          <Devices raceId={uuid(1)} laps={[testLap({ device: uuid(2) })]} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    await waitFor(() => expect(devices.synced).toBe(true));
    expect(devices.status).toStrictEqual(
      "Bouncy Amber Badger (this device) is up to date",
    );
    expect(devices.text).toContain("1 scan from here");
  });

  it("says how many laps are waiting while offline", async () => {
    const offline = {
      ...createOfflineEngine(emptyState()),
      pendingCount: () => 3,
      pendingLaps: () => 3,
      unreachable: () => true,
    };
    const views = loadViews(
      render(() => (
        <TestContext
          deviceId={uuid(2)}
          offline={offline}
          api={{
            races: {
              ":id": {
                devices: {
                  $get: vi.fn().mockRejectedValue(new TypeError("offline")),
                },
              },
            },
          }}
        >
          <Devices raceId={uuid(1)} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    await waitFor(() =>
      expect(devices.status).toStrictEqual(
        "Bouncy Amber Badger is offline - 3 laps waiting to sync",
      ),
    );
    expect(devices.synced).toBe(false);
    expect(devices.text).toContain("Other devices' reports need a connection.");
  });

  it("tells the page which device was tapped", async () => {
    const onSelect = vi.fn();
    const $get: Mock = mockJSONRequest([device(uuid(1), "Stephen", "Gate B")]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { devices: { $get } } } }}>
          <Devices raceId={uuid(1)} onSelect={onSelect} />
        </TestContext>
      )),
    );
    const devices = await views.devices();
    await waitFor(() => expect(devices.items()).toHaveLength(1));

    devices.select("Gate B");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(uuid(1));
  });
});
