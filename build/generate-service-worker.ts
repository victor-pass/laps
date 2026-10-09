import { generateSW } from "workbox-build";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { APP_SHELL_PATH, workboxOptions } from "../pwa.config";

const outputDirectory = path.resolve("dist/client");

// The app shell is rendered by the worker, not a static file, so it's
// precached by URL. All it references is the hashed client assets, so the
// client build manifest identifies its version: a new build re-fetches it.
const clientManifest = await readFile(
  path.join(outputDirectory, ".vite/manifest.json"),
);
const appShellRevision = createHash("sha256")
  .update(clientManifest)
  .digest("hex");

const { count, size, warnings } = await generateSW({
  globDirectory: outputDirectory,
  swDest: path.join(outputDirectory, "sw.js"),
  ...workboxOptions,
  additionalManifestEntries: [
    { url: APP_SHELL_PATH, revision: appShellRevision },
  ],
});

if (warnings.length > 0) {
  throw new Error(warnings.join("\n"));
}

console.log(
  `Generated service worker with ${count} precached files (${size} bytes).`,
);
