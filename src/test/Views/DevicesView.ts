import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class DevicesView extends View {
  static selector = ".devices";

  get count() {
    return this.$(".devices-count")?.textContent;
  }

  get thisDevice() {
    return this.$(".this-device strong")?.textContent;
  }

  // This device's sync line, e.g. "... is up to date".
  get status() {
    return this.$(".this-device p")?.textContent;
  }

  get synced() {
    return !!this.$(".this-device.synced");
  }

  private rows() {
    return this.$$("tbody tr");
  }

  items() {
    return this.rows().map((row) => ({
      name: row.querySelector(".device-name .pick")!.textContent,
      user: row.querySelector(".device-user")!.textContent,
      current: row.classList.contains("current"),
    }));
  }

  scans() {
    return this.rows().map((row) => ({
      scans: Number(row.querySelector(".device-scans")!.textContent),
      last: row.querySelector(".device-last")!.textContent,
    }));
  }

  activity() {
    return this.rows().map(
      (row) => [...row.querySelector(".activity")!.classList].slice(1).join(),
    );
  }

  select(name: string) {
    const pick = this.$$(".device-name .pick").find(
      (el) => el.textContent === name,
    );
    fireEvent.click(pick!);
  }
}
