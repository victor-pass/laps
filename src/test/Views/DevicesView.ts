import { View } from "./View";

export class DevicesView extends View {
  static selector = ".devices";

  get count() {
    return this.$(".devices-count")?.textContent;
  }

  get thisDevice() {
    return this.$(".this-device strong")?.textContent;
  }

  items() {
    return this.$$("tbody tr").map((row) => ({
      name: row.querySelector(".device-name")!.firstChild!.textContent,
      user: row.querySelector(".device-user")!.textContent,
      current: row.classList.contains("current"),
    }));
  }
}
