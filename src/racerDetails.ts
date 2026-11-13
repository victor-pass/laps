import { runnerName } from "@/runner";

export type Details = Record<string, string>;

const NAME_HEADERS = ["name"];
const ID_HEADERS = ["runner_id", "runner id", "id"];

// Trimmed string values only, with blanks dropped - what's stored.
export function cleanDetails(raw: unknown): Details {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Details = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = key.trim();
    const v =
      typeof value === "string" || typeof value === "number"
        ? String(value).trim()
        : "";
    if (k && v) clean[k] = v;
  }
  return clean;
}

// Applies an edit: a blank value removes that detail, a missing key keeps it.
export function mergeDetails(current: Details, patch: unknown): Details {
  const next = { ...current };
  if (patch && typeof patch === "object" && !Array.isArray(patch))
    for (const [key, value] of Object.entries(patch)) {
      const k = key.trim();
      if (!k) continue;
      const v = typeof value === "string" ? value.trim() : "";
      if (v) next[k] = v;
      else delete next[k];
    }
  return next;
}

// Every detail any of the racers has, alphabetically.
export function detailKeys(racers: { details?: Details }[]): string[] {
  return [...new Set(racers.flatMap((r) => Object.keys(r.details ?? {})))].sort(
    (a, b) => a.localeCompare(b),
  );
}

// Rows of cells from CSV, or tab-separated text pasted from a spreadsheet
// (picked by whichever the header line has). Handles quoted cells.
export function parseTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

interface Racer {
  ref: string;
  name: string | null;
  info: unknown;
  details?: Details;
}

export interface ImportPlan {
  // No name or runner_id header, so every line is read as a name.
  headerless: boolean;
  // The detail columns found, in the file's order.
  columns: string[];
  // Existing racers to update: details to add or change (blank cells left
  // out, so current values are kept), and a new name if the row gave one
  // for a racer matched by id.
  updated: { ref: string; name?: string; details: Details }[];
  added: { name: string; details: Details }[];
  // 1-based line numbers in the upload, with why each was left out.
  skipped: { line: number; reason: string }[];
}

// Works out what an upload changes. Rows match a racer by runner_id when
// the file has one, else by name (ignoring case). Unknown names become new
// racers. Without a name or runner_id header there are no headers at all:
// the first column of every line is a name, like a pasted list.
export function planImport(text: string, racers: Racer[]): ImportPlan {
  const table = parseTable(text);
  const lower = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const headerless =
    !lower.some((h) => NAME_HEADERS.includes(h)) &&
    !lower.some((h) => ID_HEADERS.includes(h));
  const [header, ...rows] = headerless ? [[], ...table] : table;
  const heads = header.map((h) => h.trim());
  const nameCol = headerless
    ? 0
    : lower.findIndex((h) => NAME_HEADERS.includes(h));
  const idCol = headerless
    ? -1
    : lower.findIndex((h) => ID_HEADERS.includes(h));
  const detailCols = heads.flatMap((h, i) =>
    h && i !== nameCol && i !== idCol ? [i] : [],
  );
  const plan: ImportPlan = {
    headerless,
    columns: detailCols.map((i) => heads[i]),
    updated: [],
    added: [],
    skipped: [],
  };

  const byRef = new Map(racers.map((r) => [r.ref.toLowerCase(), r]));
  const byName = new Map<string, Racer[]>();
  for (const r of racers) {
    const name = runnerName(r)?.trim().toLowerCase();
    if (name) byName.set(name, [...(byName.get(name) ?? []), r]);
  }
  const updates = new Map<string, ImportPlan["updated"][number]>();
  const adds = new Map<string, ImportPlan["added"][number]>();

  for (const [i, row] of rows.entries()) {
    const line = i + (headerless ? 1 : 2);
    const skip = (reason: string) => plan.skipped.push({ line, reason });
    const cell = (col: number) => (col < 0 ? "" : (row[col] ?? "").trim());
    const name = cell(nameCol);
    const id = cell(idCol);
    const details = cleanDetails(
      Object.fromEntries(detailCols.map((c) => [heads[c], cell(c)])),
    );

    let racer: Racer | undefined;
    if (id) {
      racer = byRef.get(id.toLowerCase());
      if (!racer) {
        skip(`unknown runner_id ${id}`);
        continue;
      }
    } else if (name) {
      const matches = byName.get(name.toLowerCase()) ?? [];
      if (matches.length > 1) {
        skip(`${matches.length} racers are named ${name}; add a runner_id`);
        continue;
      }
      racer = matches[0];
    } else {
      skip("no name");
      continue;
    }

    if (!racer) {
      const key = name.toLowerCase();
      const prev = adds.get(key);
      adds.set(key, {
        name: prev?.name ?? name,
        details: { ...prev?.details, ...details },
      });
      continue;
    }
    const prev = updates.get(racer.ref);
    // Compared with the name shown, so a re-uploaded template doesn't rename.
    const rename =
      id && name && name !== runnerName(racer) ? name : prev?.name;
    updates.set(racer.ref, {
      ref: racer.ref,
      ...(rename ? { name: rename } : {}),
      details: { ...prev?.details, ...details },
    });
  }

  // Drop updates that change nothing.
  plan.updated = [...updates.values()].filter((u) => {
    const racer = byRef.get(u.ref.toLowerCase())!;
    return (
      u.name !== undefined ||
      Object.entries(u.details).some(([k, v]) => racer.details?.[k] !== v)
    );
  });
  plan.added = [...adds.values()];
  return plan;
}
