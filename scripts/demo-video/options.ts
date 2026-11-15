import { existsSync } from "node:fs";
import path from "node:path";

export type Workflow = "setup" | "scan" | "data" | "all";

export interface Options {
  workflow: Workflow;
  output: string;
  racerVideo?: string;
  scanAt: number;
  cropPosition: string;
  cropZoom: number;
}

function help(): string {
  return `Generate Pixel 10-sized Laps demo videos.

Usage:
  pnpm demo:video -- [options]

Options:
  --workflow <setup|scan|data|all>  Workflow to record (default: all)
  --out <file.webm>                 Output video path
  --racer-video <file>              Optional clip shown in the scanner view
  --no-racer-video                  Use the generated camera fallback
  --scan-at <seconds>               Fake-scan cue in the clip (default: 2.4)
  --crop-position <css-position>    Video crop anchor (default: 50% 50%)
  --crop-zoom <factor>               Extra video crop (default: 1.12)
  --help                            Show this message

If --racer-video is omitted, demo-assets/racer-scan.mp4 is used when present.
The generated scan is always the fixture racer Caleb; the clip is presentation
input and does not need to contain a decodable QR code.
`;
}

/** Parses the CLI args, resolving paths against projectRoot; undefined after --help. */
export function parseOptions(
  args: string[],
  projectRoot: string,
): Options | undefined {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  let workflow: Workflow = "all";
  let output = "";
  let racerVideo: string | undefined;
  let disableDefaultVideo = false;
  let scanAt = 2.4;
  let cropPosition = "50% 50%";
  let cropZoom = 1.12;

  const next = (index: number, flag: string) => {
    const value = normalizedArgs[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`${flag} needs a value`);
    return value;
  };

  for (let i = 0; i < normalizedArgs.length; i++) {
    const arg = normalizedArgs[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(help());
      return undefined;
    }
    if (arg === "--workflow") {
      const value = next(i++, arg);
      if (!(["setup", "scan", "data", "all"] as string[]).includes(value))
        throw new Error(`Unknown workflow: ${value}`);
      workflow = value as Workflow;
    } else if (arg === "--out") output = next(i++, arg);
    else if (arg === "--racer-video") racerVideo = next(i++, arg);
    else if (arg === "--no-racer-video") disableDefaultVideo = true;
    else if (arg === "--scan-at") scanAt = Number(next(i++, arg));
    else if (arg === "--crop-position") cropPosition = next(i++, arg);
    else if (arg === "--crop-zoom") cropZoom = Number(next(i++, arg));
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isFinite(scanAt) || scanAt < 0)
    throw new Error("--scan-at must be a non-negative number");
  if (!Number.isFinite(cropZoom) || cropZoom < 1 || cropZoom > 3)
    throw new Error("--crop-zoom must be between 1 and 3");
  if (!/^[\w\s.%+-]+$/.test(cropPosition))
    throw new Error("--crop-position must be a CSS object-position value");

  if (disableDefaultVideo) racerVideo = undefined;
  else if (racerVideo) {
    racerVideo = path.resolve(projectRoot, racerVideo);
    if (!existsSync(racerVideo))
      throw new Error(`Racer video does not exist: ${racerVideo}`);
  } else {
    const defaultVideo = path.join(projectRoot, "demo-assets/racer-scan.mp4");
    if (existsSync(defaultVideo)) racerVideo = defaultVideo;
  }
  if (
    racerVideo &&
    ![".mp4", ".webm", ".mov", ".m4v"].includes(path.extname(racerVideo).toLowerCase())
  )
    throw new Error("Use an MP4, WebM, MOV, or M4V racer clip");

  output = path.resolve(
    projectRoot,
    output || `artifacts/demo-videos/laps-demo-${workflow}.webm`,
  );
  if (path.extname(output).toLowerCase() !== ".webm")
    throw new Error("Playwright recording output must use the .webm extension");

  return { workflow, output, racerVideo, scanAt, cropPosition, cropZoom };
}
