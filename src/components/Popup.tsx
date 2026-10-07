import { Accessor, Component, createSignal, For, Show } from "solid-js";
import { context } from "@/context";

const POPUP_LIFE = 5000;

export interface PopupMessage {
  type: "error" | "success";
  message: string;
}

export interface PopupService {
  get: Accessor<PopupMessage[]>;
  push: (popup: PopupMessage) => void;
}

export const Popups: Component = () => {
  const { popup } = context();
  return (
    <Show when={popup.get().length}>
      <div class="popups" role="status">
        <For each={popup.get()}>
          {(p) => <p class={`popup ${p.type}`}>{p.message}</p>}
        </For>
      </div>
    </Show>
  );
};

export function createPopupService(lifetime = POPUP_LIFE): PopupService {
  const [popups, setPopups] = createSignal<PopupMessage[]>([]);

  return {
    get: popups,
    push: (popup: PopupMessage) => {
      const live = { ...popup };
      setPopups((prev) => [...prev, live]);
      setTimeout(
        () => setPopups((prev) => prev.filter((p) => p !== live)),
        lifetime,
      );
    },
  };
}
