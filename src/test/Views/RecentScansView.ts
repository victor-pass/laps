import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class RecentScansView extends View {
  static selector = ".recent-scans";

  items() {
    return this.$$("li.scan-entry").map((li) => ({
      runner: li.querySelector(".scan-runner")!.textContent,
      device: li.querySelector(".scan-device")!.textContent,
      repeat: li.classList.contains("repeat"),
    }));
  }

  get hasMore() {
    return !!this.$(".more-scans");
  }

  showMore() {
    fireEvent.click(this.$(".more-scans")!);
  }
}
