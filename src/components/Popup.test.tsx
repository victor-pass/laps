import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { TestContext } from "@/test/TestContext";
import { createPopupService } from "./Popup";

describe("Popups", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const popup = createPopupService(1000);
    const { container } = render(() => <TestContext popup={popup} />);
    const shown = () =>
      [...container.querySelectorAll(".popup")].map((el) => ({
        message: el.textContent,
        type: [...el.classList].filter((c) => c !== "popup"),
      }));
    return { popup, container, shown };
  };

  it("renders nothing until a popup is pushed", () => {
    const { container } = setup();
    expect(container.querySelector(".popups")).toBeNull();
  });

  it("shows every pushed popup in order, oldest first", () => {
    const { popup, shown } = setup();
    popup.push({ message: "Lap 1", type: "success" });
    popup.push({ message: "Race not found", type: "error" });

    expect(shown()).toStrictEqual([
      { message: "Lap 1", type: ["success"] },
      { message: "Race not found", type: ["error"] },
    ]);
  });

  it("removes each popup once its own lifetime has passed", () => {
    const { popup, container, shown } = setup();
    popup.push({ message: "first", type: "success" });
    vi.advanceTimersByTime(600);
    popup.push({ message: "second", type: "success" });

    vi.advanceTimersByTime(400);
    expect(shown().map((p) => p.message)).toStrictEqual(["second"]);

    vi.advanceTimersByTime(600);
    expect(shown()).toStrictEqual([]);
    expect(container.querySelector(".popups")).toBeNull();
  });

  it("keeps duplicate messages as separate popups", () => {
    const { popup, shown } = setup();
    const message = { message: "Lap 1", type: "success" } as const;
    popup.push(message);
    popup.push(message);
    expect(shown()).toHaveLength(2);

    vi.advanceTimersByTime(1000);
    expect(shown()).toHaveLength(0);
  });
});
