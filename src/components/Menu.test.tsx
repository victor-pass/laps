import { expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import { Menu } from "./Menu";
import { Scan } from "./Scan";
import { TestContext } from "@/test/TestContext";
import type { QrScanner } from "@/scanner";
import { loadViews } from "@/test/Views/";

function renderAt(path: string, scanner: QrScanner) {
  const history = createMemoryHistory();
  history.set({ value: path });
  return loadViews(
    render(() => (
      <TestContext scanner={scanner}>
        <MemoryRouter
          history={history}
          root={(props) => (
            <>
              {props.children}
              <Menu />
            </>
          )}
        >
          <Route path="/scanFront" component={() => <Scan facing="user" />} />
          <Route
            path="/scanBack"
            component={() => <Scan facing="environment" />}
          />
          <Route path="/summary" component={() => <p class="summary" />} />
        </MemoryRouter>
      </TestContext>
    )),
  );
}

function fakeScanner() {
  const start = vi.fn();
  const stop = vi.fn();
  return { scanner: { start, stop } as QrScanner, start, stop };
}

describe("Menu", () => {
  it("shows the current page on the button", async () => {
    const { scanner } = fakeScanner();
    const views = renderAt("/summary", scanner);

    const menu = await views.menu();
    expect(menu.current()).toStrictEqual("☰ Summary");
    menu.open();
    expect(menu.options()).toStrictEqual([
      "Front",
      "Back",
      "Summary",
      "Share",
    ]);
    expect(menu.group()).toStrictEqual({
      label: "Scan",
      options: ["Front", "Back"],
    });
    expect(menu.active()).toStrictEqual("Summary");
  });

  it("opens the back camera scanner from another page and closes", async () => {
    const { scanner, start } = fakeScanner();
    const views = renderAt("/summary", scanner);

    const menu = await views.menu();
    menu.open();
    expect(menu.isOpen()).toBe(true);
    menu.choose("Back");

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(
        expect.any(HTMLVideoElement),
        expect.any(Function),
        "environment",
      ),
    );
    expect(menu.isOpen()).toBe(false);
    expect(menu.current()).toStrictEqual("☰ Scan Back");
  });

  it("switching cameras stops the old one and starts the new one", async () => {
    const { scanner, start, stop } = fakeScanner();
    const views = renderAt("/scanBack", scanner);

    const menu = await views.menu();
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.lastCall?.[2]).toStrictEqual("environment");

    menu.open();
    menu.choose("Front");

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(stop).toHaveBeenCalled();
    expect(start.mock.lastCall?.[2]).toStrictEqual("user");
  });
});
