import { expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { SignedOut } from "./SignedOut";
import { TestContext, testApi } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { mockJSONRequest, testRace } from "@/test/fixtures";

const expired = () =>
  vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));

describe("SignedOut", () => {
  it("asks to sign in, saying what's waiting, once the login is rejected", async () => {
    const offline = createOfflineEngine({
      ...emptyState(),
      selectedRace: testRace(),
    });
    const api = testApi({ runners: { scan: { $post: expired() } } });

    const { container } = render(() => (
      <TestContext offline={offline}>
        <SignedOut />
      </TestContext>
    ));
    expect(container.querySelector(".signed-out")).toBeNull();

    await offline.scan(api, "bib:1");
    await offline.scan(api, "bib:2");

    await waitFor(() =>
      expect(container.querySelector(".signed-out p")?.textContent).toBe(
        "Signed out. 2 changes are saved on this device, waiting to sync.",
      ),
    );
    expect(
      container.querySelector(".signed-out a")?.getAttribute("href"),
    ).toBe("/auth/google");
  });

  it("goes away once a sync gets through", async () => {
    const offline = createOfflineEngine({
      ...emptyState(),
      selectedRace: testRace(),
    });

    const { container } = render(() => (
      <TestContext offline={offline}>
        <SignedOut />
      </TestContext>
    ));

    await offline.scan(testApi({ runners: { scan: { $post: expired() } } }), "bib:1");
    await waitFor(() => expect(container.querySelector(".signed-out")).not.toBeNull());
    // let the rejected background sync finish
    await new Promise((resolve) => setTimeout(resolve, 0));

    await offline.drain(testApi({ runners: { scan: { $post: mockJSONRequest(null) } } }));
    await waitFor(() => expect(container.querySelector(".signed-out")).toBeNull());
  });
});
