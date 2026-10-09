import { Accessor, createResource, createSignal, onMount } from "solid-js";
import { context } from "@/context";
import type { RaceData } from "@/api";
import type { LocalState } from "@/offline";

export function useDeviceState(): Accessor<LocalState | undefined> {
  const { offline } = context();
  const [mounted, setMounted] = createSignal(false);
  onMount(() => setMounted(true));
  return () => (mounted() ? offline.state() : undefined);
}

export function useSelectedRace(): Accessor<RaceData | null | undefined> {
  const { api } = context();
  const device = useDeviceState();
  // null when the server can't be reached (e.g. the offline app shell),
  // leaving this device's own choice to fill in.
  const [server] = createResource(async () => {
    try {
      const res = await api.races.selected.$get();
      return (await res.json()) as RaceData | null;
    } catch {
      return null;
    }
  });
  return () => device()?.selectedRace ?? server();
}
