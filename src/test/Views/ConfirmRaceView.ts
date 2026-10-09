import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class ConfirmRaceView extends View {
  static selector = ".confirm-race";

  message = () => this.$("p")?.textContent;

  confirmLabel = () => this.$("button.confirm")?.textContent;

  private button(cls: string) {
    const button = this.$(`button.${cls}`);
    if (!button) throw new Error(`Button ".${cls}" not found`);
    return button;
  }

  confirm() {
    fireEvent.click(this.button("confirm"));
  }

  cancel() {
    fireEvent.click(this.button("cancel"));
  }
}
