import {
  Component,
  createResource,
  createSignal,
  For,
  Show,
  Suspense,
} from "solid-js";
import { context } from "@/context";
import type { RaceData } from "@/api";
import { CreateRace } from "@/components/CreateRace";

const NEW_RACE = "__new__";

export const ChooseRace: Component = () => {
  const { api } = context();
  const [error, setError] = createSignal<string>();
  const [creating, setCreating] = createSignal(false);

  const [races, { mutate: setRaces }] = createResource(async () => {
    const res = await api.races.$get();
    return (await res.json()) as RaceData[];
  });

  const [selected, { mutate: setSelected }] = createResource(async () => {
    const res = await api.races.selected.$get();
    return (await res.json()) as RaceData | null;
  });

  const onSelectChange = async (e: Event) => {
    const target = e.currentTarget as HTMLSelectElement;
    const id = target.value;
    // The browser marks the clicked option as selected before this
    // handler runs. "new" is an action, not a real choice, and a failed
    // join never happened, so in both cases the control must be put back
    // to what's actually selected rather than left showing the click.
    const revertSelection = () => (target.value = selected()?.id ?? "");

    if (id === NEW_RACE) {
      revertSelection();
      setError(undefined);
      setCreating(true);
      return;
    }
    if (!id) return;
    setError(undefined);
    try {
      const res = await api.races[":id"].join.$post({ param: { id } });
      if (!res.ok) throw new Error("Failed to select race");
      setSelected(races()?.find((race) => race.id === id));
    } catch {
      revertSelection();
      setError("Failed to select race");
    }
  };

  const createProps = {
    onCancel: () => setCreating(false),
    onCreate: (race: RaceData) => {
      setSelected(race);
      setRaces((prev) => [...(prev ?? []), race]);
      setCreating(false);
    },
    setError,
  };

  return (
    <div class="choose-race">
      <Show when={!creating()} fallback={<CreateRace {...createProps} />}>
        <Suspense fallback={<select disabled />}>
          <select onChange={onSelectChange}>
            <option value="" selected={!selected()}>
              Select a race
            </option>
            <optgroup label="Your races">
              <For each={races()}>
                {(race) => (
                  <option value={race.id} selected={race.id === selected()?.id}>
                    {race.name}
                  </option>
                )}
              </For>
            </optgroup>
            <optgroup label="Actions">
              <option value={NEW_RACE}>➕ New</option>
            </optgroup>
          </select>
        </Suspense>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </div>
  );
};
