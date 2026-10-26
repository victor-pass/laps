import { fireEvent } from "@solidjs/testing-library";
import { View } from "./View";
import { decodeQrSvg } from "@/test/decodeQr";

export class RacersView extends View {
  static selector = ".racers";

  private rows() {
    return this.$$("tr.racer-row");
  }

  items() {
    return this.rows().map((row) => ({
      name: (row.querySelector(".name") as HTMLInputElement).value,
      qrData: row.querySelector(".qr-data")!.textContent,
      laps: Number(row.querySelector(".laps")!.textContent),
      removable: !(row.querySelector(".remove") as HTMLButtonElement).disabled,
    }));
  }

  addRacers(text: string) {
    const textarea = this.$(".add-racers textarea")!;
    fireEvent.input(textarea, { target: { value: text } });
    fireEvent.submit(this.$(".add-racers")!);
  }

  rename(index: number, name: string) {
    const input = this.rows()[index].querySelector(".name")!;
    fireEvent.change(input, { target: { value: name } });
  }

  remove(index: number) {
    fireEvent.click(this.rows()[index].querySelector(".remove")!);
  }

  select(index: number) {
    fireEvent.click(this.rows()[index].querySelector(".select")!);
  }

  selectAll() {
    fireEvent.click(this.$("thead input[type=checkbox]")!);
  }

  setFormat(format: "badge" | "a4") {
    fireEvent.change(this.$(".print-racers select")!, {
      target: { value: format },
    });
  }

  printAll() {
    fireEvent.click(this.$(".print-all")!);
  }

  printSelected() {
    fireEvent.click(this.$(".print-selected")!);
  }

  get printSelectedLabel() {
    return this.$(".print-selected")!.textContent;
  }
}

// The print-only sheet, portalled outside the page.
export class PrintSheetView extends View {
  static selector = ".print-sheet";

  get format() {
    return this.classes.find((c) => c !== "print-sheet");
  }

  async cards() {
    return Promise.all(
      this.$$(".print-card").map(async (card) => ({
        race: card.querySelector(".print-race")!.textContent,
        name: card.querySelector(".print-name")?.textContent,
        scansTo: await decodeQrSvg(card.querySelector("svg")!),
      })),
    );
  }
}
