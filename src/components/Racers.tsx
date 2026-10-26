import {
  Component,
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
  Suspense,
} from "solid-js";
import { Portal } from "solid-js/web";
import QRCode from "qrcode";
import { context } from "@/context";
import type { RaceData, RacerData } from "@/api";
import { runnerName, runnerQrData } from "@/runner";
import { useSelectedRace } from "@/selectedRace";

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
        <Show when={race()} keyed fallback={<p>Select a race.</p>}>
          {(race) => <RacerList race={race} />}
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
  const sorted = () => [...(racers() ?? [])].sort(byName);
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

  const [newNames, setNewNames] = createSignal("");
  const addRacers = async (e: Event) => {
    e.preventDefault();
    const names = newNames()
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);
    if (!names.length) return;
    try {
      const res = await api.races[":id"].runners.$post({
        param: { id: props.race.id },
        json: { names },
      });
      if (!res.ok) throw new Error();
      const added = (await res.json()) as RacerData[];
      mutate((racers) => [...(racers ?? []), ...added]);
      setNewNames("");
    } catch {
      popup.push({ message: "Unable to add racers", type: "error" });
    }
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
  const printSelected = () =>
    void print(sorted().filter((r) => selected().has(r.ref)));

  return (
    <>
      <h2>Racers: {props.race.name}</h2>
      <form class="add-racers" onSubmit={addRacers}>
        <label>
          Add racers, one name per line
          <textarea
            rows="3"
            value={newNames()}
            onInput={(e) => setNewNames(e.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={!newNames().trim()}>
          Add
        </button>
      </form>

      <Show
        when={racers() !== null}
        fallback={<p class="error">Racers need a connection.</p>}
      >
        <section class="print-racers">
          <label>
            Print as
            <select
              value={format()}
              onChange={(e) =>
                setFormat(e.currentTarget.value as PrintFormat)
              }
            >
              <option value="badge">Lanyard badges (ID card, 9 per A4)</option>
              <option value="a4">A4, one per page</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={printNames()}
              onChange={(e) => setPrintNames(e.currentTarget.checked)}
            />
            Print names
          </label>
          <button
            type="button"
            class="print-all"
            disabled={!sorted().length}
            onClick={() => void print(sorted())}
          >
            Print all ({sorted().length})
          </button>
          <button
            type="button"
            class="print-selected"
            disabled={!selected().size}
            onClick={printSelected}
          >
            Print selected ({selected().size})
          </button>
        </section>

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
              <th scope="col">Name</th>
              <th scope="col">QR scans to</th>
              <th scope="col" class="num">
                Laps
              </th>
              <th scope="col">
                <span class="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <For
              each={sorted()}
              fallback={
                <tr>
                  <td class="empty" colspan="5">
                    No racers yet
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
                  <td class="id qr-data" title={runnerQrData(racer)}>
                    {runnerQrData(racer)}
                  </td>
                  <td class="num laps">{racer.laps}</td>
                  <td>
                    <button
                      type="button"
                      class="remove"
                      aria-label="Remove"
                      title={
                        racer.laps
                          ? "Racers with laps can't be removed"
                          : "Remove"
                      }
                      disabled={racer.laps > 0}
                      onClick={() => void remove(racer)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
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
