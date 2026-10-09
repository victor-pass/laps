// Race ids are always UUIDs (from crypto.randomUUID), so anything else
// isn't a join link.
const JOIN_PATH = /^\/join\/([0-9a-f-]{36})$/i;

// What a join link carries. The name rides along so a device that can't
// reach the server can still show and join the race; the server's copy
// replaces it on the next sync.
export interface RaceLink {
  id: string;
  name?: string;
}

export function joinPath({ id, name }: RaceLink): string {
  return name ? `/join/${id}?${new URLSearchParams({ name })}` : `/join/${id}`;
}

// The race from a join link's path and query, or undefined. Ignores the
// origin - callers decide whether that matters.
export function parseJoinUrl(url: URL): RaceLink | undefined {
  const id = JOIN_PATH.exec(url.pathname)?.[1];
  if (!id) return undefined;
  const name = url.searchParams.get("name")?.trim();
  return name ? { id, name } : { id };
}

// Race QR codes are join links, so a volunteer without the app can scan
// one with their phone's camera and land straight in the race. The app's
// own scanner recognises the same link, which also tells a race apart from
// a racer without knowing anything else about the racer QR format.
export function raceQrData(origin: string, race: RaceLink): string {
  return new URL(joinPath(race), origin).href;
}

// Any origin is accepted, since the same race can be shared from a
// different deployment hostname (e.g. workers.dev vs the public domain).
export function parseRaceLink(qrData: string): RaceLink | undefined {
  if (!URL.canParse(qrData)) return undefined;
  const url = new URL(qrData);
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return parseJoinUrl(url);
}
