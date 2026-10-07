// A runner's info is whatever their QR code held: plain text (used as-is)
// or JSON with a `name`.
export function runnerName(info: unknown): string | undefined {
  if (typeof info === "string") return info;
  if (info && typeof info === "object" && "name" in info) {
    const { name } = info as { name: unknown };
    if (typeof name === "string") return name;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAMESPACE = "b1a7f3d0-6e3a-4c8f-9b1a-2f6d4c9a7e11";

export async function runnerRef(qrData: string): Promise<string> {
  const trimmed = qrData.trim();
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase();
  return uuidV5(trimmed, NAMESPACE);
}

async function uuidV5(name: string, namespace: string): Promise<string> {
  const namespaceBytes = namespace
    .replace(/-/g, "")
    .match(/../g)!
    .map((byte) => parseInt(byte, 16));
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array([...namespaceBytes, ...nameBytes]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input));

  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = [...hash.slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
