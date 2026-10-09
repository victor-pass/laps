import { expect, describe, it, vi, Mock } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { SyncStatus } from "./SyncStatus";
import { TestContext, testApi } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { mockJSONRequest, testRace } from "@/test/fixtures";

const expired = () =>
  vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
const noNetwork = () =>
  vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
const scanApi = ($post: Mock) => testApi({ runners: { scan: { $post } } });
// let a rejected background sync finish before starting another
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const offline = createOfflineEngine({
    ...emptyState(),
    selectedRace: testRace(),
  });
  const { container } = render(() => (
    <TestContext offline={offline}>
      <SyncStatus />
    </TestContext>
  ));
  const banner = () => container.querySelector(".sync-status");
  return { offline, banner };
}

describe("SyncStatus", () => {
  it("shows nothing while syncing works", async () => {
    const { offline, banner } = setup();
    await offline.scan(scanApi(mockJSONRequest(null)), "bib:1");
    await settle();
    expect(banner()).toBeNull();
  });

  it("warns how many laps haven't synced while offline", async () => {
    const { offline, banner } = setup();

    await offline.scan(scanApi(noNetwork()), "bib:1");
    await offline.scan(scanApi(noNetwork()), "bib:2");

    await waitFor(() =>
      expect(banner()?.textContent).toBe(
        "Offline. 2 laps haven't synced yet - they're saved on this device.",
      ),
    );
    expect(banner()?.querySelector("a")).toBeNull();
  });

  it("clears the offline warning once the laps get through", async () => {
    const { offline, banner } = setup();
    await offline.scan(scanApi(noNetwork()), "bib:1");
    await waitFor(() => expect(banner()).not.toBeNull());
    await settle();

    await offline.drain(scanApi(mockJSONRequest(null)));
    await waitFor(() => expect(banner()).toBeNull());
  });

  it("asks to sign in, saying what's waiting, once the login is rejected", async () => {
    const { offline, banner } = setup();

    await offline.scan(scanApi(expired()), "bib:1");

    await waitFor(() =>
      expect(banner()?.querySelector("p")?.textContent).toBe(
        "Signed out. 1 lap hasn't synced yet - it's saved on this device.",
      ),
    );
    expect(banner()?.classList).toContain("signed-out");
    expect(banner()?.querySelector("a")?.getAttribute("href")).toBe(
      "/auth/google",
    );
  });

  it("clears the sign-in prompt once a sync gets through", async () => {
    const { offline, banner } = setup();
    await offline.scan(scanApi(expired()), "bib:1");
    await waitFor(() => expect(banner()).not.toBeNull());
    await settle();

    await offline.drain(scanApi(mockJSONRequest(null)));
    await waitFor(() => expect(banner()).toBeNull());
  });
});
