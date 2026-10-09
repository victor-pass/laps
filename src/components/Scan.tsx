import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { context } from "@/context";
import type { RaceData } from "@/api";
import { ConfirmRace } from "./ConfirmRace";
import { parseRaceLink, type RaceLink } from "@/qr";
import { createScanDedupe } from "@/scanDedupe";
import { runnerName } from "@/runner";
import type { CameraFacing } from "@/scanner";

export const Scan: Component<{ facing: CameraFacing }> = (props) => {
  const { api, scanner, offline, popup } = context();
  let video: HTMLVideoElement | undefined;
  let processing = false;
  const scanDedupe = createScanDedupe();

  const [pendingRace, setPendingRace] = createSignal<RaceData>();

  function resumeScanning() {
    if (video) scanner.start(video, onDecode, props.facing);
  }

  function scan() {
    if (video) {
      resumeScanning();
    } else {
      popup.push({ message: "Unable to access camera", type: "error" });
    }
  }

  const scanRace = async (link: RaceLink) => {
    try {
      const race = await offline.previewRace(api, link);
      scanner.stop();
      setPendingRace(race);
    } catch {
      popup.push({ message: "Race not found", type: "error" });
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
    popup.push({ message: `Joined ${race.name}`, type: "success" });
    resumeScanning();
  };

  const scanRunner = async (data: string) => {
    try {
      const result = await offline.scan(api, data);
      // A re-scan inside the race's lap filter is still recorded, but it
      // isn't a new lap - showing "Lap N" again would just stack a repeat
      // of the popup already on screen.
      if (!result.counted) return;
      const name = runnerName(result.runner.info);
      popup.push({
        message: `Lap ${result.lapCount}${name ? ` - ${name}` : ""}`,
        type: "success",
      });
    } catch {
      popup.push({ message: "Unable to record lap, try again", type: "error" });
    }
  };

  const onDecode = async (data: string) => {
    const trimmed = data.trim();
    if (!trimmed || processing) return;
    processing = true;
    try {
      const raceLink = parseRaceLink(trimmed);
      if (raceLink) {
        // The code is usually still in view after joining - don't keep
        // asking to join the race this device is already in.
        if (raceLink.id !== offline.state().selectedRace?.id)
          await scanRace(raceLink);
      } else if (scanDedupe.shouldProcess(trimmed)) {
        await scanRunner(trimmed);
      }
    } finally {
      processing = false;
    }
  };

  // Release the camera when hidden and start a fresh stream on return
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      scanner.stop();
    } else if (!pendingRace()) {
      resumeScanning();
    }
  };

  onMount(() => {
    scan();
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() =>
      document.removeEventListener("visibilitychange", onVisibilityChange),
    );
  });
  onCleanup(() => scanner.stop());

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
