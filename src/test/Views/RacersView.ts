import { fireEvent } from "@solidjs/testing-library";
import { View } from "./View";
import { decodeQrSvg } from "@/test/decodeQr";

export class RacersView extends View {
  static selector = ".racers";

  private rows() {
    return this.$$("tr.racer-row");
  }

  items() {
    return this.rows().map((row) => {
      const name = row.querySelector(".name") as HTMLInputElement;
      return {
        name: name.value,
        placeholder: name.placeholder,
        laps: Number(row.querySelector(".laps")!.textContent),
      };
    });
  }

  // Each row's distance, when the race has a lap distance.
  distances() {
    return this.rows().map((row) => row.querySelector(".distance")?.textContent);
  }

  get distanceHeader() {
    return this.$(".distance-head")?.textContent;
  }

  private get repeatInput() {
    return this.$(".lap-filter input") as HTMLInputElement;
  }

  get repeatFilter() {
    return this.repeatInput.value;
  }

  // Typing only: counts update, nothing saved yet.
  setRepeatFilter(value: string) {
    fireEvent.input(this.repeatInput, { target: { value } });
  }

  // Typing then blur/Enter, which saves it for the race.
  commitRepeatFilter(value: string) {
    this.setRepeatFilter(value);
    fireEvent.change(this.repeatInput, { target: { value } });
  }

  private get distanceInput() {
    return this.$("input[aria-label='Lap distance']") as HTMLInputElement;
  }

  private get unitSelect() {
    return this.$("select[aria-label='Distance unit']") as HTMLElement & {
      value: string;
    };
  }

  get lapDistance() {
    return this.distanceInput.value;
  }

  get distanceUnit() {
    return this.unitSelect.value;
  }

  // Typing then blur/Enter, which saves it for the race.
  commitLapDistance(value: string) {
    fireEvent.change(this.distanceInput, { target: { value } });
  }

  chooseDistanceUnit(value: string) {
    fireEvent.change(this.unitSelect, { target: { value } });
  }

  get detailHeaders() {
    return this.$$("th.detail-head").map((th) =>
      th.getAttribute("data-col"),
    );
  }

  // The sorted column and its direction, e.g. ["grade", "descending"].
  get sortedBy() {
    const th = this.$("th[aria-sort]");
    return th && [th.getAttribute("data-col"), th.getAttribute("aria-sort")];
  }

  sortBy(col: string) {
    fireEvent.click(this.$(`th[data-col="${col}"] .sort`)!);
  }

  filter(text: string) {
    fireEvent.input(this.$(".racer-filter")!, { target: { value: text } });
  }

  // Each row's detail inputs, by column name.
  details() {
    return this.rows().map((row) =>
      Object.fromEntries(
        [...row.querySelectorAll<HTMLInputElement>("input.detail")].map(
          (input) => [input.getAttribute("aria-label"), input.value],
        ),
      ),
    );
  }

  addColumn(name: string) {
    fireEvent.click(this.$(".add-column button")!);
    fireEvent.change(this.$(".new-column")!, { target: { value: name } });
  }

  setDetail(index: number, key: string, value: string) {
    const input = this.rows()[index].querySelector(
      `input.detail[aria-label="${key}"]`,
    )!;
    fireEvent.change(input, { target: { value } });
  }

  get importOpen() {
    return !!this.$(".import-racers");
  }

  // Opens the add panel first if it's closed.
  private importPanel() {
    if (!this.importOpen) fireEvent.click(this.$(".add-racers")!);
    return this.$(".import-racers")!;
  }

  pasteImport(text: string) {
    fireEvent.input(this.importPanel().querySelector("textarea")!, {
      target: { value: text },
    });
  }

  chooseImportFile(file: File) {
    const input = this.importPanel().querySelector("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
  }

  get importPreview() {
    const preview = this.$(".import-preview");
    return (
      preview && {
        columns: preview.querySelector(".import-columns")!.textContent,
        summary: preview.querySelector(".import-summary")!.textContent,
        skipped: [...preview.querySelectorAll(".import-skipped li")].map(
          (li) => li.textContent,
        ),
      }
    );
  }

  get downloadScope() {
    return this.$(".menu-scope")!.textContent;
  }

  downloadRacerInfo() {
    fireEvent.click(this.$(".download-racer-info")!);
  }

  downloadFlat() {
    fireEvent.click(this.$(".download-flat")!);
  }

  get groupByOptions() {
    return this.$$(".group-by option").map((o) => o.textContent);
  }

  groupBy(key: string) {
    fireEvent.change(this.$(".group-by")!, { target: { value: key } });
  }

  downloadGroups() {
    fireEvent.click(this.$(".download-groups")!);
  }

  get downloadLapsButton() {
    return this.$(".download-laps") as HTMLButtonElement;
  }

  downloadLaps() {
    fireEvent.click(this.downloadLapsButton);
  }

  setWindow(from: string, to: string) {
    fireEvent.input(this.$(".report-from input")!, { target: { value: from } });
    fireEvent.input(this.$(".report-to input")!, { target: { value: to } });
  }

  runImport() {
    fireEvent.click(this.$(".run-import")!);
  }

  rename(index: number, name: string) {
    const input = this.rows()[index].querySelector(".name")!;
    fireEvent.change(input, { target: { value: name } });
  }

  select(index: number) {
    fireEvent.click(this.rows()[index].querySelector(".select")!);
  }

  selectAll() {
    fireEvent.click(this.$("thead input[type=checkbox]")!);
  }

  get selectedCount() {
    return this.$(".selected-count")?.textContent ?? null;
  }

  removeSelected() {
    fireEvent.click(this.$(".remove-selected")!);
  }

  get removeSelectedLabel() {
    return this.$(".remove-selected")!.textContent;
  }

  clearSelection() {
    fireEvent.click(this.$(".clear-selection")!);
  }

  setFormat(format: "badge" | "a4") {
    fireEvent.change(this.$(".print-menu select")!, {
      target: { value: format },
    });
  }

  // Prints the selected racers, or those shown when none are.
  print() {
    fireEvent.click(this.$(".print-go")!);
  }

  get printLabel() {
    return this.$(".print-go")!.textContent;
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
