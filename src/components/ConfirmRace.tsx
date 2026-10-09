import { Component } from "solid-js";
import type { RaceData } from "@/api";

interface ConfirmRaceProps {
  race: RaceData;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmRace: Component<ConfirmRaceProps> = (props) => (
  <div class="confirm-race" role="alertdialog">
    <p>Join race "{props.race.name}"?</p>
    <button class="confirm" onClick={() => props.onConfirm()}>
      Join
    </button>
    <button class="cancel" onClick={() => props.onCancel()}>
      Cancel
    </button>
  </div>
);
