import { expect, describe, it, Mock } from "vitest";
import { render } from "@solidjs/testing-library";
import { Devices } from "./Devices";
import { TestContext } from "@/test/TestContext";
import { mockJSONRequest, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("Devices", () => {
  it("shows how many devices are reporting and when each last checked in", async () => {
    const $get: Mock = mockJSONRequest([
      { id: uuid(1), user: "Stephen", label: null, lastSeen: "2026-09-02T11:30:00.000Z" },
      { id: uuid(2), user: "Jamie", label: null, lastSeen: "2026-09-02T11:29:00.000Z" },
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
    expect(devices.items()).toHaveLength(2);
    expect(devices.items()[0]).toContain("Stephen");
  });

  it("shows zero devices reporting when none have checked in", async () => {
    const $get: Mock = mockJSONRequest([]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { ":id": { devices: { $get } } } }}>
          <Devices raceId={uuid(1)} />
        </TestContext>
      )),
    );
    const devices = await views.devices();

    expect(devices.count).toStrictEqual("0 devices reporting");
  });
});
