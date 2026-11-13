import { View } from "./View";

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

  // Each row's distance cell, when the race has a lap distance.
  distances() {
    return this.$$("tr.runner-row").map(
      (row) => row.querySelector(".distance")?.textContent,
    );
  }

  get headers() {
    return this.$$("th").map((th) => th.textContent);
  }

  get total() {
    return this.$(".lap-total")?.textContent;
  }

  get filterNote() {
    return this.$(".lap-filter-note")?.textContent;
  }
}
