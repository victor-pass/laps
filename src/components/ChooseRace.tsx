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

export const ChooseRace: Component = () => {
  const { api, offline } = context();
  const [creating, setCreating] = createSignal(false);
  let popover: HTMLUListElement | undefined;

  const [races, { mutate: setRaces }] = createResource(async () => {
    const res = await api.races.$get();
    return (await res.json()) as RaceData[];
  });

  const [selected, { mutate: setSelected }] = createResource(async () => {
    const res = await api.races.selected.$get();
    return (await res.json()) as RaceData | null;
  });

  const choose = (race: RaceData) => {
    popover?.hidePopover();
    // Already a member (it's in this device's own races list) - this is a
    // pure selection, not a join, so it doesn't re-send membership.
    // Applies locally immediately, even offline.
    offline.selectRace(api, race);
    setSelected(race);
  };

  const startCreating = () => {
    popover?.hidePopover();
    setCreating(true);
  };

  const createProps = {
    onCancel: () => setCreating(false),
    onCreate: (race: RaceData) => {
      setSelected(race);
      setRaces((prev) => [...(prev ?? []), race]);
      setCreating(false);
    },
  };

  const trigger = (name: string, disabled = false) => (
    <button
      type="button"
      class="race-trigger"
      popovertarget="race-items"
      aria-haspopup="menu"
      disabled={disabled}
    >
      <span class="race-name">{name}</span>
      <span aria-hidden="true">⌃</span>
    </button>
  );

  return (
    <div class="choose-race">
      <Show when={!creating()} fallback={<CreateRace {...createProps} />}>
        <Suspense fallback={trigger("Select a race", true)}>
          {trigger(selected()?.name ?? "Select a race")}
          <ul
            id="race-items"
            class="popover-list"
            popover
            ref={(el) => (popover = el)}
          >
            <For each={races()}>
              {(race) => (
                <li>
                  <button
                    type="button"
                    classList={{ active: race.id === selected()?.id }}
                    onClick={() => choose(race)}
                  >
                    {race.name}
                  </button>
                </li>
              )}
            </For>
            <li class="race-new">
              <button type="button" onClick={startCreating}>
                New race
              </button>
            </li>
          </ul>
        </Suspense>
      </Show>
    </div>
  );
};
