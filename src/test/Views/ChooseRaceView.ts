import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class ChooseRaceView extends View {
  static selector = ".choose-race";

  private get items() {
    return this.$$("#race-items button");
  }

  get selectedValue() {
    return this.$(".race-trigger .race-name")?.textContent;
  }

  get isOpen() {
    return !!this.$("#race-items")?.matches(":popover-open");
  }

  open() {
    fireEvent.click(this.$(".race-trigger")!);
  }

  options() {
    return this.items.map((el) => el.textContent);
  }

  active() {
    return this.$("#race-items .active")?.textContent;
  }

  choose(text: string) {
    const item = this.items.find((el) => el.textContent === text);
    if (!item) throw new Error(`Option "${text}" not found`);
    fireEvent.click(item);
  }

  get isCreating() {
    return !!this.$(".create-race");
  }
}
