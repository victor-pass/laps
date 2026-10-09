import { Component, createResource, Show, Suspense } from "solid-js";
import { A, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { context } from "@/context";
import type { RaceData } from "@/api";
import { ConfirmRace } from "./ConfirmRace";

export const JoinRace: Component = () => {
  const { api, offline, popup } = context();
  const params = useParams<{ id: string }>();
  const [search] = useSearchParams<{ name?: string }>();
  const navigate = useNavigate();

  const [race] = createResource(
    () => ({ id: params.id, name: search.name }),
    (link) => offline.previewRace(api, link).catch(() => null),
  );

  const join = (race: RaceData) => {
    offline.joinRace(api, race);
    popup.push({ message: `Joined ${race.name}`, type: "success" });
    navigate("/", { replace: true });
  };

  return (
    <div class="join-race">
      <Suspense fallback={<p>Loading race...</p>}>
        <Show
          when={race()}
          fallback={
            <p>
              Race not found. <A href="/">Start scanning</A>
            </p>
          }
        >
          {(race) => (
            <ConfirmRace
              race={race()}
              onConfirm={() => join(race())}
              onCancel={() => navigate("/", { replace: true })}
            />
          )}
        </Show>
      </Suspense>
    </div>
  );
};
