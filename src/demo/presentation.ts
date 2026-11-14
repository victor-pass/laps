import { parseCsv } from "./csv";

interface SpreadsheetPayload {
  raceName: string;
  importedFileName: string;
  importedCsv: string;
  exportedFileName: string;
  exportedCsv: string;
}

declare global {
  interface Window {
    __LAPS_DEMO_SHOW_SPREADSHEET__?: (payload: SpreadsheetPayload) => void;
  }
}

const style = `
#laps-demo-spreadsheet {
  position: fixed; inset: 0; z-index: 9999; overflow: auto;
  padding: max(20px, env(safe-area-inset-top)) 14px max(24px, env(safe-area-inset-bottom));
  color: #142532; background: #eef3f6; font: 14px/1.4 system-ui, sans-serif;
}
#laps-demo-spreadsheet * { box-sizing: border-box; }
#laps-demo-spreadsheet header { padding: 18px; color: #fff; background: #10263b; border-radius: 18px 18px 0 0; }
#laps-demo-spreadsheet header small { display: block; opacity: .75; letter-spacing: .12em; text-transform: uppercase; }
#laps-demo-spreadsheet h1 { margin: 5px 0 0; font-size: 23px; }
#laps-demo-spreadsheet .demo-sheet-card { margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #d0dce3; border-radius: 14px; box-shadow: 0 4px 15px #14253212; }
#laps-demo-spreadsheet h2 { margin: 0 0 8px; font-size: 14px; }
#laps-demo-spreadsheet h2 span { display: block; color: #557080; font-size: 11px; font-weight: 500; }
#laps-demo-spreadsheet .demo-sheet-scroll { overflow: auto; border: 1px solid #d7e0e5; border-radius: 8px; }
#laps-demo-spreadsheet table { width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.25; }
#laps-demo-spreadsheet th { position: sticky; top: 0; color: #15334a; background: #dcecf4; text-align: left; }
#laps-demo-spreadsheet th, #laps-demo-spreadsheet td { max-width: 190px; padding: 7px 8px; border-right: 1px solid #e1e8ec; border-bottom: 1px solid #e1e8ec; overflow-wrap: anywhere; vertical-align: top; }
#laps-demo-spreadsheet td { background: #fff; }
#laps-demo-spreadsheet tr:nth-child(even) td { background: #f7fafb; }
#laps-demo-spreadsheet .demo-imported { color: #145c3d; }
#laps-demo-spreadsheet .demo-exported { color: #12557b; }
#laps-demo-spreadsheet .demo-roundtrip { margin: 10px 0; text-align: center; color: #526a79; font-weight: 800; }
#laps-demo-spreadsheet footer { position: static; justify-content: center; padding: 12px 0; color: #526a79; font-size: 12px; }
`;

function makeTable(csv: string): HTMLDivElement {
  const rows = parseCsv(csv);
  const container = document.createElement("div");
  container.className = "demo-sheet-scroll";
  const table = document.createElement("table");
  const [headers = [], ...body] = rows;
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const cell of headers) {
    const th = document.createElement("th");
    th.textContent = cell;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of body) {
    const tr = document.createElement("tr");
    headers.forEach((_, index) => {
      const td = document.createElement("td");
      td.textContent = row[index] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

function sheetCard(
  label: string,
  fileName: string,
  csv: string,
  className: string,
): HTMLElement {
  const card = document.createElement("section");
  card.className = `demo-sheet-card ${className}`;
  const heading = document.createElement("h2");
  heading.textContent = label;
  const file = document.createElement("span");
  file.textContent = fileName;
  heading.appendChild(file);
  card.appendChild(heading);
  card.appendChild(makeTable(csv));
  return card;
}

export function installDemoPresentation(): void {
  window.__LAPS_DEMO_SHOW_SPREADSHEET__ = (payload) => {
    document.getElementById("laps-demo-spreadsheet")?.remove();
    if (!document.getElementById("laps-demo-spreadsheet-style")) {
      const stylesheet = document.createElement("style");
      stylesheet.id = "laps-demo-spreadsheet-style";
      stylesheet.textContent = style;
      document.head.appendChild(stylesheet);
    }

    const panel = document.createElement("section");
    panel.id = "laps-demo-spreadsheet";
    panel.setAttribute("aria-label", "Imported and exported race data");
    const header = document.createElement("header");
    const eyebrow = document.createElement("small");
    eyebrow.textContent = "Spreadsheet round trip";
    const title = document.createElement("h1");
    title.textContent = payload.raceName;
    header.appendChild(eyebrow);
    header.appendChild(title);

    const imported = sheetCard(
      "Imported racers",
      payload.importedFileName,
      payload.importedCsv,
      "demo-imported",
    );
    const direction = document.createElement("p");
    direction.className = "demo-roundtrip";
    direction.textContent = "Imported and applied ↓ Exported from race data";
    const exported = sheetCard(
      "Exported race data",
      payload.exportedFileName,
      payload.exportedCsv,
      "demo-exported",
    );
    const footer = document.createElement("footer");
    footer.textContent = "Laps · CSV import and export";
    panel.appendChild(header);
    panel.appendChild(imported);
    panel.appendChild(direction);
    panel.appendChild(exported);
    panel.appendChild(footer);
    document.body.appendChild(panel);
  };
}
