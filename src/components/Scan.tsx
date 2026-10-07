import { Component, createSignal, onCleanup, onMount, Show } from "solid-js";
import { context } from "@/context";
import type { RaceData, ScanResult } from "@/api";
import { ConfirmRace } from "./ConfirmRace";
import { parseRaceId } from "@/qr";
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

  const scanRace = async (id: string) => {
    try {
      const race = await offline.previewRace(api, id);
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
      const result: ScanResult = await offline.scan(api, data);
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
      const raceId = parseRaceId(trimmed);
      if (raceId) {
        await scanRace(raceId);
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

  // The listener's cleanup is registered inside onMount because onCleanup
  // also runs during SSR, where `document` doesn't exist.
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
