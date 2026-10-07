import { View } from "./View";
import { fireEvent } from "@solidjs/testing-library";

export class MenuView extends View {
  static selector = ".menu";

  private get items() {
    return this.$("#menu-items") as HTMLElement;
  }

  current = () => this.$("button")?.textContent;

  isOpen = () => this.items.matches(":popover-open");

  open() {
    fireEvent.click(this.$("button")!);
  }

  options() {
    return this.$$("#menu-items a").map((el) => el.textContent);
  }

  group() {
    const group = this.$(".menu-group");
    return {
      label: group?.querySelector("span")?.textContent,
      options: [...(group?.querySelectorAll("a") ?? [])].map(
        (el) => el.textContent,
      ),
    };
  }

  active() {
    return this.$("#menu-items a.active")?.textContent;
  }

  choose(text: string) {
    const link = this.$$("#menu-items a").find((el) => el.textContent === text);
    if (!link) throw new Error(`Menu item "${text}" not found`);
    fireEvent.click(link);
  }
}
