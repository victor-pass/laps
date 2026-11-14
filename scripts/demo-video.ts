#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign } from "hono/jwt";
import {
  chromium,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from "playwright";
import solid from "vite-plugin-solid";
import {
  createServer as createViteServer,
  type Plugin,
  type ViteDevServer,
} from "vite";
import { createAPI } from "../src/api";
import {
  DEMO_RACE_NAME,
  DEMO_USER_ID,
  DEMO_USER_NAME,
  seedDemoUser,
  seedRaceRacers,
  seedStandaloneRace,
} from "../src/demo/fixtures";
import { FIXED_NOW } from "../src/demo/constants";
import { createInMemoryDatabase } from "../src/test/inMemoryDB";
import { parseCsv } from "../src/demo/csv";

const PIXEL_10_VIDEO = { width: 1080, height: 2424 };
const DEFAULT_SCAN_AT = 2.4;
const DEMO_JWT_TTL_SECONDS = 60 * 60;
const POINTER_PACING = { hoverMs: 320, pressMs: 200, settleMs: 280 };
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phoneRouteRewrite: Plugin = {
  name: "laps-demo-phone-routes",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const requestUrl = request.url ?? "/";
      const pathname = requestUrl.split("?", 1)[0];
      if (
        ["/scanFront", "/scanBack", "/sync", "/race", "/share"].includes(
          pathname,
        ) ||
        pathname.startsWith("/join/")
      )
        request.url = `/app.html${requestUrl.slice(pathname.length)}`;
      next();
    });
  },
};

type Workflow = "setup" | "scan" | "data" | "all";

interface Options {
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

function parseOptions(args: string[]): Options | undefined {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  let workflow: Workflow = "all";
  let output = "";
  let racerVideo: string | undefined;
  let disableDefaultVideo = false;
  let scanAt = DEFAULT_SCAN_AT;
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

  const defaultVideo = path.join(projectRoot, "demo-assets/racer-scan.mp4");
  if (!racerVideo && !disableDefaultVideo) racerVideo = defaultVideo;
  if (racerVideo && !path.isAbsolute(racerVideo))
    racerVideo = path.resolve(projectRoot, racerVideo);

  const outputPath = output || `artifacts/demo-videos/laps-demo-${workflow}.webm`;
  const resolvedOutput = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(projectRoot, outputPath);
  if (path.extname(resolvedOutput).toLowerCase() !== ".webm")
    throw new Error("Playwright recording output must use the .webm extension");

  return {
    workflow,
    output: resolvedOutput,
    racerVideo: racerVideo && disableDefaultVideo ? undefined : racerVideo,
    scanAt,
    cropPosition,
    cropZoom,
  };
}

async function startViteServer(assetDirectory?: string): Promise<ViteDevServer> {
  const vite = await createViteServer({
    configFile: false,
    root: path.join(projectRoot, "demo"),
    appType: "spa",
    plugins: [phoneRouteRewrite, solid()],
    resolve: { alias: { "@": path.join(projectRoot, "src") } },
    publicDir: assetDirectory ?? false,
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
      hmr: false,
      fs: { allow: [projectRoot] },
    },
  });
  await vite.listen();
  return vite;
}

function viteOrigin(vite: ViteDevServer): string {
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("Could not determine the local Vite server address");
  return `http://127.0.0.1:${address.port}`;
}

async function startApiServer(
  db: Awaited<ReturnType<typeof createInMemoryDatabase>>["db"],
  webOrigin: string,
): Promise<{ server: ServerType; origin: string; secret: string }> {
  const secret = randomBytes(32).toString("hex");
  const api = new Hono()
    .use(
      "*",
      cors({
        origin: webOrigin,
        allowHeaders: ["Content-Type", "X-Device-Id", "X-Race-Id"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true,
      }),
    )
    .route("/", createAPI(async () => db));
  const bindings = { JWT_SECRET: secret } as unknown as CloudflareBindings;

  const { server, origin } = await new Promise<{
    server: ServerType;
    origin: string;
  }>((resolve, reject) => {
    const server = serve(
      {
        fetch: (request) => api.fetch(request, bindings),
        port: 0,
        hostname: "127.0.0.1",
      },
      ({ port }) => resolve({ server, origin: `http://127.0.0.1:${port}` }),
    );
    server.on("error", reject);
  });

  return { server, origin, secret };
}

async function closeServer(server: ServerType | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error?: Error) => (error ? reject(error) : resolve())),
  );
}

async function tap(page: Page, target: Locator): Promise<void> {
  await target.waitFor({ state: "visible" });
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("Could not find the demo interaction target");

  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    { steps: 20 },
  );
  await page.waitForTimeout(POINTER_PACING.hoverMs);
  await page.mouse.down();
  await page.waitForTimeout(POINTER_PACING.pressMs);
  await page.mouse.up();
  await page.waitForTimeout(POINTER_PACING.settleMs);
}

async function installDemoPointer(context: BrowserContext): Promise<void> {
  await context.addInitScript(`
    if (window.top !== window) {
      const reportDemoPointer = function (event) {
        const frame = window.frameElement;
        if (!frame || window.innerWidth === 0 || window.innerHeight === 0) return;
        const bounds = frame.getBoundingClientRect();
        window.parent.postMessage(
          {
            source: "laps-demo-pointer",
            type: event.type,
            x: bounds.left + (event.clientX * bounds.width) / window.innerWidth,
            y: bounds.top + (event.clientY * bounds.height) / window.innerHeight,
          },
          window.location.origin,
        );
      };

      window.addEventListener("pointermove", reportDemoPointer, true);
      window.addEventListener("pointerdown", reportDemoPointer, true);
      window.addEventListener("pointerup", reportDemoPointer, true);
      window.addEventListener("pointercancel", reportDemoPointer, true);
    }
  `);
}

async function createRaceThroughUi(page: Page, app: Frame, webOrigin: string) {
  await app.goto(`${webOrigin}/race`, { waitUntil: "domcontentloaded" });
  await app.locator(".race-trigger").waitFor();
  await tap(page, app.locator(".race-trigger"));
  await tap(page, app.getByRole("button", { name: "New race" }));
  const input = app.locator("form.create-race input.name");
  await tap(page, input);
  await input.pressSequentially(DEMO_RACE_NAME, { delay: 90 });

  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/races" &&
      response.request().method() === "POST",
    { timeout: 20_000 },
  );
  const selectedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/races/selected" &&
      response.request().method() === "PUT",
    { timeout: 20_000 },
  );
  await input.press("Enter");
  const created = await createdResponse;
  const selected = await selectedResponse;
  if (!created.ok()) throw new Error("Race creation failed in the demo API");
  if (!selected.ok()) throw new Error("Could not select the created demo race");
  const race = (await created.json()) as { id: string; name: string };
  await app.waitForFunction(
    (name) =>
      document.querySelector(".race-trigger .race-name")?.textContent === name,
    DEMO_RACE_NAME,
  );
  return race;
}

async function recordShare(
  page: Page,
  app: Frame,
  webOrigin: string,
): Promise<void> {
  await app.goto(`${webOrigin}/race`, { waitUntil: "domcontentloaded" });
  await tap(page, app.locator(".menu > button"));
  await tap(page, app.getByRole("link", { name: "Share" }));
  await app.locator(".show-race-qr svg").waitFor({ timeout: 20_000 });
  await app.getByText(`Scan to join: ${DEMO_RACE_NAME}`).waitFor();
  await page.waitForTimeout(3_500);
}

async function recordScan(
  page: Page,
  app: Frame,
  webOrigin: string,
): Promise<void> {
  await app.goto(`${webOrigin}/race`, { waitUntil: "domcontentloaded" });
  await app.locator(".racer-table tbody tr").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  const scanResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/runners/scan" &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await tap(page, app.locator(".menu > button"));
  await tap(page, app.getByRole("link", { name: "Back" }));
  await app.locator(".scan video").waitFor();
  const response = await scanResponse;
  if (!response.ok())
    throw new Error(`Fake lap scan failed with status ${response.status()}`);
  const popup = app.locator(".popup.success");
  await popup.waitFor({ timeout: 10_000 });
  await assertPopupMessage(popup, "Lap 1 - Caleb");
  await page.waitForTimeout(3_000);
}

async function assertPopupMessage(
  popup: Locator,
  expected: string,
): Promise<void> {
  await popup.evaluate((element, message) => {
    if (element.textContent?.trim() !== message)
      throw new Error(`Expected popup ${message}; saw ${element.textContent}`);
  }, expected);
}

async function recordData(
  page: Page,
  app: Frame,
  webOrigin: string,
): Promise<void> {
  await app.goto(`${webOrigin}/race`, { waitUntil: "domcontentloaded" });
  await app.locator(".racers h2").waitFor({ timeout: 20_000 });
  await app.waitForFunction(
    () => document.querySelectorAll(".racer-table tbody tr").length >= 2,
  );

  await tap(page, app.getByRole("button", { name: "+ Add racers" }));
  const csvPath = path.join(projectRoot, "src/demo/fixtures/racers.csv");
  const importedCsv = await readFile(csvPath, "utf8");
  await app.locator(".import-file input[type=file]").setInputFiles({
    name: "racers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(importedCsv),
  });
  const preview = app.locator(".import-preview .import-summary");
  await preview.waitFor({ timeout: 10_000 });
  assert.match(await preview.textContent() ?? "", /2 to update, 0 new/);
  await page.waitForTimeout(1_800);
  await tap(page, app.getByRole("button", { name: "Upload" }));
  const importPopup = app.locator(".popup.success");
  await importPopup.waitFor({ timeout: 15_000 });
  await assertPopupMessage(importPopup, "Updated 2, added 0");

  await tap(page, app.locator(".download-menu summary"));
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await tap(page, app.getByRole("button", { name: /All race data - flat/ }));
  const download = await downloadPromise;
  const failure = await download.failure();
  if (failure) throw new Error(`Race data download failed: ${failure}`);
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("Playwright did not save the CSV download");
  const exportedCsv = await readFile(downloadedPath, "utf8");
  const exportedRows = parseCsv(exportedCsv);
  assert(exportedRows.length >= 3, "Expected two exported racers and a header");
  assert(exportedRows.some((row) => row[0] === "Caleb" && row.includes("Blue")));

  const payload = {
    raceName: DEMO_RACE_NAME,
    importedFileName: "racers.csv",
    importedCsv,
    exportedFileName: download.suggestedFilename(),
    exportedCsv,
  };
  await app.evaluate((data) => {
    const show = window.__LAPS_DEMO_SHOW_SPREADSHEET__;
    if (!show) throw new Error("The demo spreadsheet presentation is unavailable");
    show(data);
  }, payload);
  await app
    .getByRole("region", { name: "Imported and exported race data" })
    .waitFor();
  await page.waitForTimeout(6_000);
}

async function installDeterministicDate(context: BrowserContext): Promise<void> {
  await context.addInitScript((isoDate) => {
    const fixedTime = new Date(isoDate).getTime();
    const OriginalDate = Date;
    const FixedDate = new Proxy(OriginalDate, {
      construct(target, args, newTarget) {
        return Reflect.construct(
          target,
          args.length ? args : [fixedTime],
          newTarget,
        );
      },
      apply() {
        return new OriginalDate(fixedTime).toString();
      },
      get(target, property, receiver) {
        if (property === "now") return () => fixedTime;
        return Reflect.get(target, property, receiver);
      },
    });
    Object.defineProperty(globalThis, "Date", {
      configurable: true,
      value: FixedDate,
    });
  }, FIXED_NOW);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;

  let racerVideo = options.racerVideo;
  if (racerVideo) {
    try {
      await readFile(racerVideo);
    } catch {
      if (racerVideo === path.join(projectRoot, "demo-assets/racer-scan.mp4"))
        racerVideo = undefined;
      else throw new Error(`Racer video does not exist: ${racerVideo}`);
    }
  }

  const database = await createInMemoryDatabase();
  let vite: ViteDevServer | undefined;
  let apiServer: ServerType | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const assets = await mkdtemp(path.join(tmpdir(), "laps-demo-assets-"));
  const recordingDirectory = await mkdtemp(
    path.join(tmpdir(), "laps-demo-recording-"),
  );

  try {
    if (options.workflow === "scan" || options.workflow === "data") {
      await seedStandaloneRace(database.db, {
        includeLaps: options.workflow === "data",
      });
    } else {
      await seedDemoUser(database.db);
    }

    let racerVideoUrl: string | undefined;
    if (racerVideo) {
      const extension = path.extname(racerVideo).toLowerCase();
      if (![".mp4", ".webm", ".mov", ".m4v"].includes(extension))
        throw new Error("Use an MP4, WebM, MOV, or M4V racer clip");
      const servedVideo = path.join(assets, `racer-scan${extension}`);
      await copyFile(racerVideo, servedVideo);
      racerVideoUrl = `/racer-scan${extension}`;
    }

    vite = await startViteServer(racerVideo ? assets : undefined);
    const webOrigin = viteOrigin(vite);
    const api = await startApiServer(database.db, webOrigin);
    apiServer = api.server;

    const token = await sign(
      {
        sub: DEMO_USER_ID,
        name: DEMO_USER_NAME,
        exp: Math.floor(Date.now() / 1_000) + DEMO_JWT_TTL_SECONDS,
      },
      api.secret,
    );

    browser = await chromium.launch({ headless: true }).catch((error: unknown) => {
      throw new Error(
        `Could not launch Chromium. Install it with "pnpm exec playwright install chromium". ${String(error)}`,
      );
    });
    context = await browser.newContext({
      viewport: PIXEL_10_VIDEO,
      deviceScaleFactor: 2.5,
      isMobile: true,
      hasTouch: true,
      locale: "en-US",
      timezoneId: "America/Denver",
      acceptDownloads: true,
      recordVideo: {
        dir: recordingDirectory,
        size: PIXEL_10_VIDEO,
      },
    });
    await installDeterministicDate(context);
    await installDemoPointer(context);
    await context.addInitScript(
      (config) => {
        window.__LAPS_DEMO_CONFIG__ = config;
      },
      {
        apiOrigin: api.origin,
        racerVideo: racerVideoUrl,
        scanAt: options.scanAt,
        cropPosition: options.cropPosition,
        cropZoom: options.cropZoom,
        fixedNow: FIXED_NOW,
      },
    );
    await context.addCookies([
      {
        name: "auth_token",
        value: token,
        url: api.origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    page = await context.newPage();
    page.on("pageerror", (error) => console.error("Browser error:", error));
    await page.goto(webOrigin, { waitUntil: "domcontentloaded" });
    await page.locator("#app-frame").waitFor();
    await page
      .frameLocator("#app-frame")
      .locator("#root")
      .waitFor({ timeout: 20_000 });
    const app = page.frame({ name: "laps-mobile-app" });
    if (!app) throw new Error("Could not attach to the mobile app frame");

    if (options.workflow === "setup" || options.workflow === "all") {
      const race = await createRaceThroughUi(page, app, webOrigin);
      if (options.workflow === "all")
        await seedRaceRacers(database.db, race.id);
      await recordShare(page, app, webOrigin);
      if (options.workflow === "all") {
        await recordScan(page, app, webOrigin);
        await recordData(page, app, webOrigin);
      }
    } else if (options.workflow === "scan") {
      await recordScan(page, app, webOrigin);
    } else {
      await recordData(page, app, webOrigin);
    }

    await context.close();
    context = undefined;
    const videoPath = await page.video()?.path();
    if (!videoPath) throw new Error("Playwright did not create a video recording");
    await mkdir(path.dirname(options.output), { recursive: true });
    await copyFile(videoPath, options.output);
    console.log(
      `Saved ${options.workflow} demo video (${PIXEL_10_VIDEO.width}x${PIXEL_10_VIDEO.height}): ${options.output}`,
    );
  } catch (error) {
    if (page && context) {
      const failureScreenshot = options.output.replace(/\.webm$/i, ".failure.png");
      await mkdir(path.dirname(failureScreenshot), { recursive: true });
      await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
      await context.close().catch(() => {});
      context = undefined;
      const failedVideo = await page.video()?.path().catch(() => undefined);
      if (failedVideo) {
        const failedOutput = options.output.replace(/\.webm$/i, ".failed.webm");
        await copyFile(failedVideo, failedOutput).catch(() => {});
        console.error(`Failed-run recording: ${failedOutput}`);
      }
      console.error(`Failure screenshot: ${failureScreenshot}`);
    }
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await closeServer(apiServer).catch(() => {});
    await vite?.close().catch(() => {});
    await database.close().catch(() => {});
    await rm(assets, { recursive: true, force: true }).catch(() => {});
    await rm(recordingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
