# Demo Video Generator Plan

## Goal

Build a repeatable local tool that records short videos of real Laps app workflows. It should run the actual app UI against a fresh in-memory database, use a fixed test user and fixtures, and save Playwright recordings without connecting to Neon, Google login, or production services.

The initial output should be a WebM recording. An optional FFmpeg step can produce MP4 later if a sharing destination requires it.

## Existing pieces to reuse

- `src/App.tsx` already accepts an API client, scanner, offline engine, and origin as inputs. A demo browser entry can mount this same app with demo-only dependencies.
- `src/test/inMemoryDB.ts` creates PGlite, applies the Drizzle migrations, and provides `dbSeed`. The demo uses its closable database helper to create a fresh database for each run.
- `src/test/fixtures.ts` has deterministic race, runner, lap, and UUID factories. The API tests show how to sign a synthetic user token and seed race membership.
- `src/components/Scan.tsx` depends on the small `QrScanner` interface. `src/components/Scan.test.tsx` already demonstrates driving it with a fake scanner that invokes the decode callback.
- Racer import preview and CSV downloads already exist in `src/components/Racers.tsx`, `src/racerDetails.ts`, and `src/lapsCsv.ts`.
- `vitest.config.ts` uses Playwright for browser component tests. That setup does not provide a workflow runner or save complete demo videos, so the video tool should have a dedicated Playwright CLI entry point.

## Proposed shape

Add a `demo:video` package script and keep the harness in a separate `src/demo/` area so the production browser entry and auth flow do not need demo branches.

1. **Local demo server** — Start separate loopback-only Vite and Hono servers. Vite serves the demo page; Hono mounts `createAPI` against one fresh PGlite database. Seed a synthetic user and sign a short-lived JWT for the Playwright browser context. The runner does not load production database or auth configuration.
2. **Demo browser entry** — Mount the existing `App` with the same styles, an API client pointed at the local Hono server, a fixed device ID, and `createOfflineEngine(emptyState())`. Call the normal sync initialization so race creation and lap scans travel through the app's normal offline queue and API path. Keep state out of browser localStorage and skip service-worker registration.
3. **Scanner driver** — Implement a demo `QrScanner` that displays the supplied racer video in the scanner's video element, crops it to the phone viewport, and invokes the app's decode callback with the stable Caleb fixture payload at a cue time. This exercises the real `Scan` component, offline lap handling, API request, and popup. The scan event is deterministic and supplied by the harness; QR decoding is intentionally faked because the generated QR in the clip may not be valid. If no clip is supplied, show a generated QR/camera placeholder and trigger the same fixture payload.
4. **Fixtures** — Keep the import file and baseline race data under `src/demo/fixtures/`. Use fixed runner IDs, names, and lap timestamps. For the combined run, create the race through the UI, then use a demo-only fixture helper to attach known runners to that race. This lets the scan clip and exported spreadsheet use stable data without changing production API behavior.
5. **Recorder and presentation** — Target a portrait **1080 × 2424 px** recording, matching the Pixel 10 display resolution and its approximately 20:9 aspect ratio ([Google Pixel 10 specifications](https://store.google.com/product/pixel_10_specs?hl=en-US)). Configure Playwright's outer viewport and `recordVideo.size` explicitly to `{ width: 1080, height: 2424 }`; its default recording may scale down to fit 800 × 800 ([Playwright BrowserType API](https://playwright.dev/docs/api/class-browsertype)). Run the app in a 432 × 969.6 CSS-pixel iframe scaled 2.5× to fill the output. This preserves the app's phone-sized layout while making the recorded frame match the device's native resolution. Use touch emulation, a fixed locale, timezone, and controlled clock. Mirror pointer events from the app iframe into the outer recorder and display the transparent fingerprint assets in `demo/finger-hover.png` and `demo/finger-press.png`; use smooth pointer movement plus short hover, press, and scene holds so viewers can follow each interaction. Save videos under an ignored `artifacts/demo-videos/` directory. For the data workflow, parse the actual downloaded CSV and show it in a harness-owned spreadsheet-style overlay, with imported input and exported output clearly labeled. Render cell text safely; keep this presentation layer outside the production app.

## Workflows to record

### 1. Set up a race and share its QR code

- Open the race chooser, choose **New race**, enter `Spring 5k`, and submit.
- Wait until the locally selected race is also present in the in-memory API/database.
- Open **Share** from the app menu.
- Hold on the generated race join QR code and race name long enough to be understood.

### 2. Scan a racer QR code and show lap confirmation

- Open **Scan Back** and show the supplied racer clip cropped in the scanner preview. The default source is `demo-assets/racer-scan.mp4`; accept a clip path, cue time, crop position, and crop zoom as CLI options.
- At the cue, fake a scan for the test racer **Caleb**, regardless of the QR pixels in the clip.
- Wait for the success popup (currently rendered as a `role="status"` message such as `Lap 1 - Caleb`) and hold briefly. This confirms the UI and lap-recording path ran, while the clip provides the human-readable scan scene.

### 3. Import and export race data

- Open **Race**, choose **+ Add racers**, and upload the deterministic CSV fixture with Caleb and Alex plus `team` and `grade` details.
- Pause on the preview showing two existing racers to update, then choose **Upload** and wait for the success popup.
- Open **Download** and select **All race data - flat**. Capture the actual browser download and parse its CSV contents.
- Show a spreadsheet-style result with the imported rows and exported race-data rows. Mark the displayed source and the successful export in the overlay; this makes the round trip legible even when the native download itself is not visible in the browser recording.

The combined `all` workflow should run these scenes in order against one fresh database. Each workflow should also be selectable on its own; standalone scan and import/export runs should seed their own race and fixtures before opening the page.

## CLI and outputs

The output file uses the native portrait Pixel 10 dimensions (1080 × 2424 px):

```sh
pnpm exec playwright install chromium
pnpm demo:video -- --workflow all --out artifacts/demo-videos/all.webm
```

The supplied clip at `demo-assets/racer-scan.mp4` is picked up automatically. Options include `--workflow setup|scan|data|all`, `--out`, `--racer-video`, `--no-racer-video`, `--scan-at`, `--crop-position`, and `--crop-zoom`. Without a clip, the generator uses a synthetic camera view. The run returns a non-zero exit code if an assertion fails and reports the output path. The source clip and generated recordings are git-ignored.

## Implemented pieces

- `scripts/demo-video.ts` starts isolated local servers and a fresh PGlite database, then records each selected workflow.
- `demo/index.html` scales the phone-sized app iframe to the Pixel 10 video canvas; `demo/shell.ts` mirrors pointer events and switches between the hover and press fingerprint images. `demo/browser.tsx` mounts the production app with the test API, deterministic offline state, and demo scanner.
- `src/demo/fixtures/` and `src/demo/fixtures.ts` provide fixed racers, lap data, and the import CSV.
- `src/demo/presentation.ts` displays the captured import and downloaded export as spreadsheet-style tables.
- Outputs go to `artifacts/demo-videos/`; a failed run saves a screenshot and a `.failed.webm` recording when available.

## Completion criteria

- A single local command records `setup`, `scan`, `data`, or all three workflows from a fresh in-memory database.
- The recorded scenes use the actual app components and API handlers. The harness supplies test auth, a disposable PGlite database, scanner input, and spreadsheet-result presentation.
- The setup clip visibly contains the selected race QR, the scan clip visibly shows the racer and the lap popup, and the data clip visibly shows the import and exported spreadsheet result.
- Fixed test records and timestamps make the visible data repeatable across runs.
- The generator needs no production secrets, external database, or manually maintained browser state, and leaves the repo free of generated video files unless the user selects a tracked output path.

## Notes and limits

- The current app shows a lap success toast rather than a modal confirmation dialog; the recording uses the message shown by the existing UI.
- The supplied video is used as the camera scene; the demo scanner emits the deterministic Caleb fixture payload at the cue instead of decoding the generated QR pixels.
- Crop position and zoom are adjustable because the best framing depends on where the racer and code appear in the supplied clip.
