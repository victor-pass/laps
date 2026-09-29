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
  const { api, offline } = context();
  const [creating, setCreating] = createSignal(false);

  const [races, { mutate: setRaces }] = createResource(async () => {
    const res = await api.races.$get();
    return (await res.json()) as RaceData[];
  });

  const [selected, { mutate: setSelected }] = createResource(async () => {
    const res = await api.races.selected.$get();
    return (await res.json()) as RaceData | null;
  });

  const onSelectChange = (e: Event) => {
    const target = e.currentTarget as HTMLSelectElement;
    const id = target.value;
    // The browser marks the clicked option as selected before this
    // handler runs. "new" is an action, not a real choice, so the control
    // must be put back to what's actually selected rather than left
    // showing the click.
    const revertSelection = () => (target.value = selected()?.id ?? "");

    if (id === NEW_RACE) {
      revertSelection();
      setCreating(true);
      return;
    }
    if (!id) return;
    const race = races()?.find((r) => r.id === id);
    if (!race) return;
    // Already a member (it's in this device's own races list) - this is a
    // pure selection, not a join, so it doesn't re-send membership.
    // Applies locally immediately, even offline.
    offline.selectRace(api, race);
    setSelected(race);
  };

  const createProps = {
    onCancel: () => setCreating(false),
    onCreate: (race: RaceData) => {
      setSelected(race);
      setRaces((prev) => [...(prev ?? []), race]);
      setCreating(false);
    },
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
    </div>
  );
};
