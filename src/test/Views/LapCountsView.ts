import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class LapCountsView extends View {
  static selector = ".lap-counts";

  // `name` is "—" for runners with no name; `id` is the full runner id
  // (the cell itself shows a shortened one).
  items() {
    return this.$$("tr.runner-row").map((row) => ({
      name: row.querySelector(".name")!.textContent,
      id: row.querySelector(".id")!.getAttribute("title"),
      count: Number(row.querySelector(".count")!.textContent),
    }));
  }

  get headers() {
    return this.$$("th").map((th) => th.textContent);
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

  get exportButton() {
    return this.$(".export-laps") as HTMLButtonElement;
  }

  exportCsv() {
    fireEvent.click(this.exportButton);
  }
}
