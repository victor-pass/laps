import { Component, createSignal } from "solid-js";
import { context } from "@/context";
import type { RaceData } from "@/api";

interface Props {
  onCancel: () => void;
  onCreate: (race: RaceData) => void;
}

export const CreateRace: Component<Props> = (props) => {
  const { api, offline } = context();
  const [name, setName] = createSignal("");

  const submitCreate = (e: SubmitEvent) => {
    e.preventDefault();
    const raceName = name().trim();
    if (!raceName) return;
    // Creation is optimistic and queued for sync - it always applies
    // locally immediately, even offline.
    const race = offline.createRace(api, raceName);
    props.onCreate(race);
  };

  return (
    <form class="create-race" onSubmit={submitCreate}>
      <input
        type="text"
        class="name"
        placeholder="New race name"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
        autofocus
      />
      <button class="cancel" type="button" onClick={() => props.onCancel()}>
        ✖
      </button>
    </form>
  );
};
