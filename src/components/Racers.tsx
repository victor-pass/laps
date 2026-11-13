import {
  Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  Suspense,
  untrack,
} from "solid-js";
import { Portal } from "solid-js/web";
import QRCode from "qrcode";
import { context } from "@/context";
import type { LapData, RaceData, RacerData } from "@/api";
import { runnerName, runnerQrData } from "@/runner";
import { useSelectedRace } from "@/selectedRace";
import { detailKeys, planImport } from "@/racerDetails";
import {
  groupCsv,
  lapsCsv,
  lapsCsvFilename,
  racersCsv,
  racerTemplateCsv,
} from "@/lapsCsv";
import { downloadCsv } from "@/download";
import { countByRunner } from "@/lapDedupe";
import {
  DISTANCE_UNITS,
  type DistanceUnit,
  distanceOf,
  distanceUnit,
  isDistanceUnit,
  lapDistance,
} from "@/distance";

export type PrintFormat = "badge" | "a4";

interface PrintCard {
  ref: string;
  name?: string;
  svg: string;
}

export const Racers: Component = () => {
  const race = useSelectedRace();

  return (
    <div class="racers">
      <Suspense fallback={<p>Loading race...</p>}>
        {/* Keyed on the id, so a new lap filter doesn't start afresh. The
            child takes it so Show calls it once per race; the race is read
            untracked too, as reading the pending resource through the prop
            overflowed the stack. */}
        <Show when={race()?.id} keyed fallback={<p>Select a race.</p>}>
          {(_raceId) => <RacerList race={untrack(race)!} />}
        </Show>
      </Suspense>
    </div>
  );
};

// Named first, alphabetically, then the rest by id - so the list doesn't
// reshuffle as names load or change elsewhere.
const byName = (a: RacerData, b: RacerData) => {
  const an = runnerName(a);
  const bn = runnerName(b);
  if (an && bn) return an.localeCompare(bn) || a.ref.localeCompare(b.ref);
  if (an || bn) return an ? -1 : 1;
  return a.ref.localeCompare(b.ref);
};

// The column the table is sorted by: "name", "laps", or a detail's key.
interface Sort {
  col: string;
  desc: boolean;
}

// Numbers in order (grade 2 before 10), blanks last either way, then by
// name so equal values keep a steady order.
const sortBy =
  ({ col, desc }: Sort, laps: (racer: RacerData) => number) =>
  (a: RacerData, b: RacerData) => {
    const dir = desc ? -1 : 1;
    if (col === "name") return byName(a, b) * dir;
    if (col === "laps") return (laps(a) - laps(b)) * dir || byName(a, b);
    const av = a.details?.[col] ?? "";
    const bv = b.details?.[col] ?? "";
    if (!av !== !bv) return av ? -1 : 1;
    return (
      av.localeCompare(bv, undefined, { numeric: true }) * dir || byName(a, b)
    );
  };

const matches = (racer: RacerData, text: string) => {
  const q = text.trim().toLowerCase();
  return (
    !q ||
    [
      runnerName(racer) ?? "",
      runnerQrData(racer),
      ...Object.values(racer.details ?? {}),
    ].some((v) => v.toLowerCase().includes(q))
  );
};

// A datetime-local value as a time, or undefined when blank. `end` takes
// the end of that minute, so "to 09:30" includes laps at 09:30:40.
const parseLocal = (value: string, end = false) => {
  const ms = Date.parse(value);
  return isNaN(ms) ? undefined : new Date(end ? ms + 59_999 : ms);
};

const RacerList: Component<{ race: RaceData }> = (props) => {
  const { api, offline, popup } = context();
  // null when the server can't be reached - racers are only kept there.
  const [racers, { mutate }] = createResource(
    () => props.race.id,
    async (id): Promise<RacerData[] | null> => {
      try {
        const res = await api.races[":id"].runners.$get({ param: { id } });
        return res.ok ? ((await res.json()) as RacerData[]) : null;
      } catch {
        return null;
      }
    },
  );
  // Every lap, for the counts and downloads - null when they can't be
  // fetched.
  const [laps] = createResource(
    () => props.race.id,
    async (id): Promise<LapData[] | null> => {
      try {
        const res = await api.races[":id"].laps.$get({ param: { id } });
        return res.ok ? ((await res.json()) as LapData[]) : null;
      } catch {
        return null;
      }
    },
  );

  // Owned here once read, so counts follow the box as it's typed in;
  // saved for every device on commit (blur/Enter), queued if offline.
  // eslint-disable-next-line solid/reactivity -- intentional one-time read
  const [filterSeconds, setFilterSeconds] = createSignal(
    props.race.lapFilterSeconds,
  );
  const parseFilter = (e: Event) => {
    const value = Number((e.currentTarget as HTMLInputElement).value);
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  };
  const onFilterInput = (e: Event) => {
    const value = parseFilter(e);
    if (value !== undefined) setFilterSeconds(value);
  };
  const onFilterChange = (e: Event) => {
    const value = parseFilter(e);
    if (value !== undefined)
      offline.setRaceSettings(api, props.race, { lapFilterSeconds: value });
  };
  // Owned here like the filter. Blank turns distance off.
  /* eslint-disable solid/reactivity -- intentional one-time reads */
  const [perLap, setPerLap] = createSignal(props.race.lapDistance ?? null);
  const [unit, setUnit] = createSignal<DistanceUnit>(distanceUnit(props.race));
  /* eslint-enable solid/reactivity */
  const onDistanceChange = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const value = input.value.trim() ? Number(input.value) : null;
    if (value !== null && !(value > 0 && isFinite(value))) {
      input.value = String(perLap() ?? "");
      return;
    }
    setPerLap(value);
    offline.setRaceSettings(api, props.race, { lapDistance: value });
  };
  const onUnitChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value;
    if (!isDistanceUnit(value)) return;
    setUnit(value);
    offline.setRaceSettings(api, props.race, { distanceUnit: value });
  };
  const distance = () =>
    lapDistance({ lapDistance: perLap(), distanceUnit: unit() });
  const counted = createMemo(() => {
    const list = laps();
    return list ? countByRunner(list, filterSeconds()) : undefined;
  });
  // The server's count of every scan until the laps arrive.
  const lapsOf = (racer: RacerData) => {
    const counts = counted();
    return counts ? (counts.get(racer.ref) ?? 0) : racer.laps;
  };

  const [sort, setSort] = createSignal<Sort>({ col: "name", desc: false });
  const sortOn = (col: string) =>
    setSort((s) => ({ col, desc: s.col === col && !s.desc }));
  const arrow = (col: string) =>
    sort().col === col ? (sort().desc ? " ▼" : " ▲") : "";
  const ariaSort = (col: string) =>
    sort().col === col ? (sort().desc ? "descending" : "ascending") : undefined;
  const [filter, setFilter] = createSignal("");
  // The racers shown: filtered, in the chosen order.
  const sorted = () =>
    (racers() ?? [])
      .filter((r) => matches(r, filter()))
      .sort(sortBy(sort(), lapsOf));
  // So scans on this device name racers added or renamed here right away.
  createEffect(() => {
    const list = racers();
    if (list) offline.rememberNames(props.race.id, list);
  });

  const [selected, setSelected] = createSignal(new Set<string>());
  const toggle = (ref: string, on: boolean) => {
    const next = new Set(selected());
    if (on) next.add(ref);
    else next.delete(ref);
    setSelected(next);
  };
  const allSelected = () =>
    sorted().length > 0 && sorted().every((r) => selected().has(r.ref));
  const selectAll = (on: boolean) =>
    setSelected(new Set(on ? sorted().map((r) => r.ref) : []));
  // What print and download act on: the selected racers, else those shown.
  const scope = () =>
    selected().size
      ? (racers() ?? [])
          .filter((r) => selected().has(r.ref))
          .sort(sortBy(sort(), lapsOf))
      : sorted();
  // The whole race keeps laps by runners not listed (shouldn't happen).
  const scopeLaps = () => {
    if (!selected().size && !filter().trim()) return laps() ?? [];
    const refs = new Set(scope().map((r) => r.ref));
    return (laps() ?? []).filter((lap) => refs.has(lap.runner));
  };

  const rename = async (racer: RacerData, name: string) => {
    try {
      const res = await api.races[":id"].runners[":ref"].$patch({
        param: { id: props.race.id, ref: racer.ref },
        json: { name },
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as RacerData;
      mutate((racers) =>
        racers?.map((r) => (r.ref === updated.ref ? updated : r)),
      );
    } catch {
      popup.push({ message: "Unable to rename racer", type: "error" });
    }
  };

  // Columns added here stay blank (and local) until a racer gets a value.
  const [newKeys, setNewKeys] = createSignal<string[]>([]);
  const keys = () => {
    const saved = detailKeys(racers() ?? []);
    return [...saved, ...newKeys().filter((k) => !saved.includes(k))];
  };
  const [naming, setNaming] = createSignal(false);
  const addColumn = (name: string) => {
    const key = name.trim();
    if (key && key !== "name" && !keys().includes(key))
      setNewKeys((ks) => [...ks, key]);
    setNaming(false);
  };

  const setDetail = async (racer: RacerData, key: string, value: string) => {
    try {
      const res = await api.races[":id"].runners[":ref"].$patch({
        param: { id: props.race.id, ref: racer.ref },
        json: { details: { [key]: value } },
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as RacerData;
      mutate((racers) =>
        racers?.map((r) => (r.ref === updated.ref ? updated : r)),
      );
    } catch {
      popup.push({ message: "Unable to save detail", type: "error" });
    }
  };

  const [adding, setAdding] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const plan = createMemo(() =>
    importText().trim() ? planImport(importText(), racers() ?? []) : null,
  );
  const readFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) setImportText(await file.text());
    input.value = "";
  };
  const runImport = async () => {
    const { updated, added } = plan() ?? { updated: [], added: [] };
    try {
      const res = await api.races[":id"].runners.import.$post({
        param: { id: props.race.id },
        json: { updated, added },
      });
      if (!res.ok) throw new Error();
      mutate((await res.json()) as RacerData[]);
      setImportText("");
      setAdding(false);
      popup.push({
        message: `Updated ${updated.length}, added ${added.length}`,
        type: "success",
      });
    } catch {
      popup.push({ message: "Unable to upload racers", type: "error" });
    }
  };

  const remove = async (racer: RacerData) => {
    try {
      const res = await api.races[":id"].runners[":ref"].$delete({
        param: { id: props.race.id, ref: racer.ref },
      });
      if (!res.ok) throw new Error();
      mutate((racers) => racers?.filter((r) => r.ref !== racer.ref));
      toggle(racer.ref, false);
    } catch {
      popup.push({ message: "Unable to remove racer", type: "error" });
    }
  };
  // Racers with laps can't be removed, so they stay selected.
  const removable = () => scope().filter((r) => !r.laps);
  const removeSelected = () => {
    for (const racer of removable()) void remove(racer);
  };

  // Menus close once an item is chosen.
  let printMenu: HTMLDetailsElement | undefined;
  let downloadMenu: HTMLDetailsElement | undefined;

  const [chosenGroup, setChosenGroup] = createSignal("");
  // The first detail until one is picked.
  const groupBy = () =>
    keys().includes(chosenGroup()) ? chosenGroup() : (keys()[0] ?? "");
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const reportOptions = (groupBy: string) => ({
    from: parseLocal(from()),
    to: parseLocal(to(), true),
    filterSeconds: filterSeconds(),
    groupBy,
    distance: distance(),
  });
  const download = (csv: string, report: string) => {
    downloadCsv(csv, lapsCsvFilename(props.race.name, report));
    if (downloadMenu) downloadMenu.open = false;
  };
  const downloadRacerInfo = () => download(racerTemplateCsv(scope()), "racers");
  const downloadFlat = () =>
    download(racersCsv(scope(), scopeLaps(), reportOptions("")), "race-data");
  const downloadGroups = () =>
    download(
      groupCsv(scope(), scopeLaps(), reportOptions(groupBy())),
      `by-${groupBy() || "group"}`,
    );
  const downloadLaps = () => {
    const { from, to } = reportOptions("");
    const inWindow = scopeLaps().filter((lap) => {
      const ms = Date.parse(lap.timestamp);
      return (!from || ms >= from.getTime()) && (!to || ms <= to.getTime());
    });
    download(lapsCsv(inWindow), "laps");
  };

  const [format, setFormat] = createSignal<PrintFormat>("badge");
  const [printNames, setPrintNames] = createSignal(true);
  const [cards, setCards] = createSignal<PrintCard[]>([]);

  // Every code is drawn before printing, so the print dialog never
  // catches a half-rendered sheet.
  const print = async (racers: RacerData[]) => {
    const withNames = printNames();
    setCards(
      await Promise.all(
        racers.map(async (racer) => ({
          ref: racer.ref,
          name: withNames ? runnerName(racer) : undefined,
          svg: await QRCode.toString(runnerQrData(racer), {
            type: "svg",
            margin: 1,
          }),
        })),
      ),
    );
    window.print();
  };
  const printScope = () => {
    if (printMenu) printMenu.open = false;
    void print(scope());
  };

  return (
    <>
      <h2>
        Race: {props.race.name}{" "}
        <small class="racer-count">{racers()?.length ?? 0} racers</small>
      </h2>
      <label class="lap-filter">
        Ignore repeat scans within
        <input
          type="number"
          min="0"
          step="1"
          value={filterSeconds()}
          onInput={onFilterInput}
          onChange={onFilterChange}
        />
        seconds
      </label>
      <label class="lap-distance">
        Each lap is
        <input
          type="number"
          min="0"
          step="any"
          inputmode="decimal"
          placeholder="—"
          aria-label="Lap distance"
          value={perLap() ?? ""}
          onChange={onDistanceChange}
        />
        <select
          aria-label="Distance unit"
          value={unit()}
          onChange={onUnitChange}
        >
          <For each={DISTANCE_UNITS}>
            {(u) => <option value={u}>{u}</option>}
          </For>
        </select>
      </label>
      <Show
        when={racers() !== null}
        fallback={<p class="error">Racers need a connection.</p>}
      >
        <div class="racer-toolbar" classList={{ selecting: !!selected().size }}>
          <Show
            when={selected().size}
            fallback={
              <>
                <button
                  type="button"
                  class="add-racers"
                  aria-expanded={adding()}
                  onClick={() => setAdding(!adding())}
                >
                  + Add racers
                </button>
                <input
                  type="search"
                  class="racer-filter"
                  aria-label="Filter racers"
                  placeholder="Filter…"
                  value={filter()}
                  onInput={(e) => setFilter(e.currentTarget.value)}
                />
              </>
            }
          >
            <span class="selected-count">{selected().size} selected</span>
            <button
              type="button"
              class="remove-selected"
              disabled={!removable().length}
              title="Racers with laps can't be removed"
              onClick={removeSelected}
            >
              Remove ({removable().length})
            </button>
            <button
              type="button"
              class="clear-selection"
              aria-label="Clear selection"
              onClick={() => setSelected(new Set<string>())}
            >
              ✕
            </button>
          </Show>

          <details class="menu print-menu" ref={(el) => (printMenu = el)}>
            <summary>Print ▾</summary>
            <div class="menu-body">
              <label>
                Print as
                <select
                  value={format()}
                  onChange={(e) =>
                    setFormat(e.currentTarget.value as PrintFormat)
                  }
                >
                  <option value="badge">
                    Lanyard badges (ID card, 9 per A4)
                  </option>
                  <option value="a4">A4, one per page</option>
                </select>
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  checked={printNames()}
                  onChange={(e) => setPrintNames(e.currentTarget.checked)}
                />
                Print names
              </label>
              <button
                type="button"
                class="print-go"
                disabled={!scope().length}
                onClick={printScope}
              >
                Print {scope().length} QR codes
              </button>
            </div>
          </details>

          <details class="menu download-menu" ref={(el) => (downloadMenu = el)}>
            <summary>Download ▾</summary>
            <div class="menu-body">
              <p class="menu-scope">
                {selected().size
                  ? "Selected"
                  : filter().trim()
                    ? "Shown"
                    : "All"}{" "}
                racers ({scope().length})
              </p>
              <button
                type="button"
                class="download-racer-info"
                onClick={downloadRacerInfo}
              >
                <b>Racer info</b>
                <span>Name, id, details - edit and upload back</span>
              </button>
              <button
                type="button"
                class="download-flat"
                onClick={downloadFlat}
              >
                <b>All race data - flat</b>
                <span>One row per racer: details and laps</span>
              </button>
              <div class="menu-item">
                <button
                  type="button"
                  class="download-groups"
                  disabled={!keys().length}
                  onClick={downloadGroups}
                >
                  <b>Race data by {groupBy() || "…"}</b>
                  <span>One row per group: racers, laps, average</span>
                </button>
                <select
                  class="group-by"
                  aria-label="Group by"
                  value={groupBy()}
                  disabled={!keys().length}
                  onChange={(e) => setChosenGroup(e.currentTarget.value)}
                >
                  <For
                    each={keys()}
                    fallback={<option value="">No details yet</option>}
                  >
                    {(key) => <option value={key}>{key}</option>}
                  </For>
                </select>
              </div>
              <button
                type="button"
                class="download-laps"
                disabled={!scopeLaps().length}
                onClick={downloadLaps}
              >
                <b>Every lap</b>
                <span>One row per scan, with time and device</span>
              </button>
              <div class="report-window">
                <label class="report-from">
                  From
                  <input
                    type="datetime-local"
                    value={from()}
                    onInput={(e) => setFrom(e.currentTarget.value)}
                  />
                </label>
                <label class="report-to">
                  To
                  <input
                    type="datetime-local"
                    value={to()}
                    onInput={(e) => setTo(e.currentTarget.value)}
                  />
                </label>
                <p class="hint">
                  Leave From/To blank for the whole race. Laps closer than{" "}
                  {filterSeconds()}s count once.
                </p>
              </div>
            </div>
          </details>
        </div>

        <Show when={adding()}>
          <section class="import-racers">
            <label>
              Add racers: one name per line, a CSV, or paste from a spreadsheet
              <textarea
                rows="3"
                placeholder={"Sam\nAlex"}
                value={importText()}
                onInput={(e) => setImportText(e.currentTarget.value)}
              />
            </label>
            <label class="import-file">
              Choose file
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                onChange={(e) => void readFile(e)}
              />
            </label>
            <p class="hint">
              Tip: Download ▾ Racer info, fill it in, and upload it back. A
              header row with a <code>name</code> or <code>runner_id</code>{" "}
              column makes the other columns details; without one, each line is
              a name. Blank cells keep what's there; new names are added.
            </p>
            <Show when={plan()}>
              {(plan) => (
                <div class="import-preview">
                  <p class="import-columns">
                    {plan().headerless
                      ? "No header row: one name per line"
                      : `Details: ${plan().columns.length ? plan().columns.join(", ") : "none"}`}
                  </p>
                  <p class="import-summary">
                    {plan().updated.length} to update, {plan().added.length} new
                    <Show when={plan().added.length}>
                      :{" "}
                      {plan()
                        .added.map((a) => a.name)
                        .join(", ")}
                    </Show>
                  </p>
                  <Show when={plan().skipped.length}>
                    <ul class="import-skipped">
                      <For each={plan().skipped}>
                        {(s) => (
                          <li>
                            Line {s.line} skipped: {s.reason}
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                  <button
                    type="button"
                    class="run-import"
                    disabled={!plan().updated.length && !plan().added.length}
                    onClick={() => void runImport()}
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    class="cancel-import"
                    onClick={() => {
                      setImportText("");
                      setAdding(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </Show>
          </section>
        </Show>

        <div class="table-scroll">
          <table class="sheet racer-table">
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected()}
                    onChange={(e) => selectAll(e.currentTarget.checked)}
                  />
                </th>
                <th scope="col" data-col="name" aria-sort={ariaSort("name")}>
                  <button
                    type="button"
                    class="sort"
                    onClick={() => sortOn("name")}
                  >
                    Name{arrow("name")}
                  </button>
                </th>
                <For each={keys()}>
                  {(key) => (
                    <th
                      scope="col"
                      class="detail-head"
                      data-col={key}
                      aria-sort={ariaSort(key)}
                    >
                      <button
                        type="button"
                        class="sort"
                        onClick={() => sortOn(key)}
                      >
                        {key}
                        {arrow(key)}
                      </button>
                    </th>
                  )}
                </For>
                <th scope="col" class="add-column">
                  <Show
                    when={naming()}
                    fallback={
                      <button type="button" onClick={() => setNaming(true)}>
                        + Column
                      </button>
                    }
                  >
                    <input
                      class="new-column"
                      aria-label="New column name"
                      placeholder="e.g. grade"
                      ref={(el) => setTimeout(() => el.focus())}
                      onChange={(e) => addColumn(e.currentTarget.value)}
                      onBlur={(e) => addColumn(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setNaming(false);
                      }}
                    />
                  </Show>
                </th>
                <th
                  scope="col"
                  class="num"
                  data-col="laps"
                  aria-sort={ariaSort("laps")}
                >
                  <button
                    type="button"
                    class="sort"
                    onClick={() => sortOn("laps")}
                  >
                    Laps{arrow("laps")}
                  </button>
                </th>
                <Show when={distance()}>
                  {(d) => (
                    <th scope="col" class="num distance-head">
                      {d().unit}
                    </th>
                  )}
                </Show>
              </tr>
            </thead>
            <tbody>
              <For
                each={sorted()}
                fallback={
                  <tr>
                    <td
                      class="empty"
                      colspan={(distance() ? 5 : 4) + keys().length}
                    >
                      {racers()?.length ? "No racers match" : "No racers yet"}
                    </td>
                  </tr>
                }
              >
                {(racer) => (
                  <tr class="racer-row">
                    <td>
                      <input
                        type="checkbox"
                        class="select"
                        aria-label="Select"
                        checked={selected().has(racer.ref)}
                        onChange={(e) =>
                          toggle(racer.ref, e.currentTarget.checked)
                        }
                      />
                    </td>
                    <td>
                      <input
                        class="name"
                        aria-label="Name"
                        placeholder={runnerName({ info: racer.info }) ?? "—"}
                        value={racer.name ?? ""}
                        onChange={(e) =>
                          void rename(racer, e.currentTarget.value)
                        }
                      />
                    </td>
                    <For each={keys()}>
                      {(key) => (
                        <td>
                          <input
                            class="detail"
                            aria-label={key}
                            value={racer.details?.[key] ?? ""}
                            onChange={(e) =>
                              void setDetail(racer, key, e.currentTarget.value)
                            }
                          />
                        </td>
                      )}
                    </For>
                    <td />
                    <td class="num laps">{lapsOf(racer)}</td>
                    <Show when={distance()}>
                      {(d) => (
                        <td class="num distance">
                          {distanceOf(lapsOf(racer), d())}
                        </td>
                      )}
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <Portal>
        <div class={`print-sheet print-${format()}`}>
          <For each={cards()}>
            {(card) => (
              <div class="print-card">
                <p class="print-race">{props.race.name}</p>
                {/* eslint-disable-next-line solid/no-innerhtml -- SVG is generated */}
                <div class="print-qr" innerHTML={card.svg} />
                <Show when={card.name}>
                  <p class="print-name">{card.name}</p>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Portal>
    </>
  );
};
