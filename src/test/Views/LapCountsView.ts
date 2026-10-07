import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class LapCountsView extends View {
  static selector = ".lap-counts";

  items() {
    return this.$$("li").map((li) => ({
      runner: li.querySelector(".runner")!.textContent,
      count: Number(li.querySelector(".count")!.textContent),
    }));
  }

  private get input() {
    return this.$(".lap-filter input") as HTMLInputElement;
  }

  get filterValue() {
    return this.input.value;
  }

  // Fires the local (instant) recompute only - matches typing in the box.
  setFilter(value: string) {
    fireEvent.input(this.input, { target: { value } });
  }

  // Also fires the commit (blur/Enter) that persists the value.
  commitFilter(value: string) {
    fireEvent.input(this.input, { target: { value } });
    fireEvent.change(this.input, { target: { value } });
  }
}
