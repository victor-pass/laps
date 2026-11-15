import { expect, describe, it, beforeEach } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import { ThemeColor } from "./ThemeColor";

const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

describe("ThemeColor", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
  });

  const renderAt = (path: string) => {
    const history = createMemoryHistory();
    history.set({ value: path });
    render(() => (
      <MemoryRouter history={history} root={() => <ThemeColor />}>
        <Route path="*" component={() => null} />
      </MemoryRouter>
    ));
    return history;
  };

  it("is black behind the camera", async () => {
    renderAt("/scanBack");
    await waitFor(() => expect(themeColor()).toBe("#000000"));
  });

  it("follows navigation to the light pages", async () => {
    const history = renderAt("/scanFront");
    await waitFor(() => expect(themeColor()).toBe("#000000"));
    history.set({ value: "/sync" });
    await waitFor(() => expect(themeColor()).toBe("#ccdce2"));
  });
});
