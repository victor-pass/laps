import { Component, createResource, Show, Suspense } from "solid-js";
import QRCode from "qrcode";
import { context } from "@/context";
import type { RaceData } from "@/api";
import { raceQrData } from "@/qr";

export const ShowRaceQR: Component = () => {
  const { api, origin } = context();
  const [raceDetails] = createResource(async () => {
    const res = await api.races.selected.$get();
    const race = (await res.json()) as RaceData;
    if (!race) return undefined;
    const link = raceQrData(origin, race);
    return { race, link, svg: await QRCode.toString(link, { type: "svg" }) };
  });

  return (
    <div class="show-race-qr">
      <Suspense fallback={<p>Loading race...</p>}>
        <Show when={raceDetails()} fallback={<p>Select a race.</p>}>
          {(details) => (
            <>
              {/* eslint-disable-next-line solid/no-innerhtml -- SVG is generated */}
              <div innerHTML={details().svg} />
              <p>Scan to join: {details().race.name}</p>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
