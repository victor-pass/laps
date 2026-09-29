import { View } from "./View";

export class DevicesView extends View {
  static selector = ".devices";

  get count() {
    return this.$(".devices-count")?.textContent;
  }

  items() {
    return this.$$("li").map((li) => li.textContent);
  }
}
