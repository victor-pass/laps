import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class ChooseRaceView extends View {
  static selector = ".choose-race";

  private get select() {
    return this.$("select") as HTMLSelectElement | null;
  }

  get selectedValue() {
    return this.select?.selectedOptions[0]?.textContent;
  }

  options() {
    return this.$$("select option").map((el) => el.textContent);
  }

  choose(text: string) {
    const option = this.$$("select option").find(
      (el) => el.textContent === text,
    ) as HTMLOptionElement | undefined;
    if (!option) throw new Error(`Option "${text}" not found`);
    fireEvent.change(this.select!, { target: { value: option.value } });
  }

  get isCreating() {
    return !!this.$(".create-race");
  }
}
