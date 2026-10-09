import { Component, createResource, Show, Suspense } from "solid-js";
import QRCode from "qrcode";
import { context } from "@/context";
import type { RaceData } from "@/api";
import { raceQrData } from "@/qr";
import { useSelectedRace } from "@/selectedRace";

export const ShowRaceQR: Component = () => {
  const race = useSelectedRace();

  return (
    <div class="show-race-qr">
      <Suspense fallback={<p>Loading race...</p>}>
        <Show when={race()} fallback={<p>Select a race.</p>}>
          {(race) => <RaceQR race={race()} />}
        </Show>
      </Suspense>
    </div>
  );
};

// Only created once the race is known: a server render won't re-run a
// resource whose source was still loading when it was created.
const RaceQR: Component<{ race: RaceData }> = (props) => {
  const { origin } = context();
  const [svg] = createResource(
    () => raceQrData(origin, props.race),
    (link) => QRCode.toString(link, { type: "svg" }),
  );

  return (
    <>
      {/* eslint-disable-next-line solid/no-innerhtml -- SVG is generated */}
      <div innerHTML={svg()} />
      <p>Scan to join: {props.race.name}</p>
    </>
  );
};
