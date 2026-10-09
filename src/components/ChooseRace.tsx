import {
  Component,
  createResource,
  createSignal,
  For,
  onMount,
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

  const [serverRaces] = createResource(async () => {
    const res = await api.races.$get();
    return (await res.json()) as RaceData[];
  });

  const [serverSelected] = createResource(async () => {
    const res = await api.races.selected.$get();
    return (await res.json()) as RaceData | null;
  });

  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));
  const local = () => (mounted() ? offline.state() : undefined);
  const selected = () => local()?.selectedRace ?? serverSelected();

  const races = () => {
    const server = serverRaces();
    const known = local()?.races ?? [];
    if (!server) return known.length ? [...known] : undefined;
    return [
      ...server,
      ...known.filter((r) => !server.some((s) => s.id === r.id)),
    ];
  };

  const choose = (race: RaceData) => {
    popover?.hidePopover();
    offline.selectRace(api, race);
  };

  const startCreating = () => {
    popover?.hidePopover();
    setCreating(true);
  };

  const createProps = {
    onCancel: () => setCreating(false),
    onCreate: () => setCreating(false),
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
