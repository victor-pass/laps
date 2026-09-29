import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { context } from "@/context";
import type { RaceData, RunnerData, ScanResult } from "@/api";
import { ConfirmRace } from "./ConfirmRace";
import { parseRaceId } from "@/qr";

function name({ info }: RunnerData): string | undefined {
  if (typeof info === "string") return info;
  if (info && typeof info === "object" && "name" in info) {
    const { name } = info as { name: unknown };
    if (typeof name === "string") return name;
  }
}

export const Scan: Component = () => {
  const { api, scanner, offline, popup } = context();
  let video: HTMLVideoElement | undefined;
  let processing = false;

  const [pendingRace, setPendingRace] = createSignal<RaceData>();

  function resumeScanning() {
    if (video) scanner.start(video, onDecode);
  }

  function scan() {
    popup.set(undefined);
    if (video) {
      resumeScanning();
    } else {
      popup.set({ message: "Unable to access camera", type: "error" });
    }
  }

  const scanRace = async (id: string) => {
    try {
      const race = await offline.previewRace(api, id);
      scanner.stop();
      setPendingRace(race);
    } catch {
      popup.set({ message: "Race not found", type: "error" });
    }
  };

  const cancelRaceSwitch = () => {
    setPendingRace(undefined);
    resumeScanning();
  };

  const confirmRaceSwitch = () => {
    const race = pendingRace();
    if (!race) return;
    setPendingRace(undefined);
    offline.joinRace(api, race);
    popup.set({ message: `Joined ${race.name}`, type: "success" });
    resumeScanning();
  };

  const scanRunner = async (data: string) => {
    try {
      const result: ScanResult = await offline.scan(api, data);
      const runnerName = name(result.runner);
      popup.set({
        message: `Lap ${result.lapCount}${runnerName ? ` - ${runnerName}` : ""}`,
        type: "success",
      });
    } catch {
      popup.set({ message: "Unable to record lap, try again", type: "error" });
    }
  };

  const onDecode = async (data: string) => {
    const trimmed = data.trim();
    if (!trimmed || processing) return;
    processing = true;
    try {
      const raceId = parseRaceId(trimmed);
      if (raceId) {
        await scanRace(raceId);
      } else {
        await scanRunner(trimmed);
      }
    } finally {
      processing = false;
    }
  };

  onMount(scan);
  onCleanup(scanner.stop);

  return (
    <div class="scan">
      <video ref={(el) => (video = el)} muted playsinline />
      <Show when={pendingRace()}>
        {(race) => (
          <ConfirmRace
            race={race()}
            onConfirm={confirmRaceSwitch}
            onCancel={cancelRaceSwitch}
          />
        )}
      </Show>
    </div>
  );
};
