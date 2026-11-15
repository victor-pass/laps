#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign } from "hono/jwt";
import {
  chromium,
  type Browser,
  type BrowserContext,
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
  DEMO_USER_ID,
  DEMO_USER_NAME,
  seedDemoUser,
  seedRaceRacers,
  seedStandaloneRace,
} from "../src/demo/fixtures";
import { FIXED_NOW } from "../src/demo/constants";
import { createInMemoryDatabase } from "../src/test/inMemoryDB";
import {
  createRaceThroughUi,
  recordData,
  recordScan,
  recordShare,
  type Phone,
} from "./demo-video/steps";
import { parseOptions } from "./demo-video/options";

const PIXEL_10_VIDEO = { width: 1080, height: 2424 };
const DEMO_JWT_TTL_SECONDS = 60 * 60;
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

async function newPhoneContext(
  browser: Browser,
  recordingDirectory: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: PIXEL_10_VIDEO,
    deviceScaleFactor: 2.5,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "America/Denver",
    acceptDownloads: true,
    recordVideo: { dir: recordingDirectory, size: PIXEL_10_VIDEO },
  });
  await installDeterministicDate(context);
  await installDemoPointer(context);
  return context;
}

async function signIn(
  context: BrowserContext,
  api: { origin: string; secret: string },
): Promise<void> {
  const token = await sign(
    {
      sub: DEMO_USER_ID,
      name: DEMO_USER_NAME,
      exp: Math.floor(Date.now() / 1_000) + DEMO_JWT_TTL_SECONDS,
    },
    api.secret,
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
}

/** Loads the phone mockup and attaches to the app frame inside it. */
async function openPhone(page: Page, webOrigin: string): Promise<Phone> {
  page.on("pageerror", (error) => console.error("Browser error:", error));
  await page.goto(webOrigin, { waitUntil: "domcontentloaded" });
  await page.locator("#app-frame").waitFor();
  await page
    .frameLocator("#app-frame")
    .locator("#root")
    .waitFor({ timeout: 20_000 });
  const app = page.frame({ name: "laps-mobile-app" });
  if (!app) throw new Error("Could not attach to the mobile app frame");
  return { page, app, origin: webOrigin };
}

/** Closes the context so Playwright finishes the video, then copies it out. */
async function saveRecording(
  page: Page,
  context: BrowserContext,
  output: string,
): Promise<void> {
  await context.close();
  const video = await page.video()?.path();
  if (!video) throw new Error("Playwright did not create a video recording");
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(video, output);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2), projectRoot);
  if (!options) return;
  const { racerVideo } = options;

  const database = await createInMemoryDatabase();
  let vite: ViteDevServer | undefined;
  let apiServer: ServerType | undefined;
  let browser: Browser | undefined;
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
      racerVideoUrl = `/racer-scan${path.extname(racerVideo).toLowerCase()}`;
      await copyFile(racerVideo, path.join(assets, racerVideoUrl));
    }

    vite = await startViteServer(racerVideo ? assets : undefined);
    const webOrigin = viteOrigin(vite);
    const api = await startApiServer(database.db, webOrigin);
    apiServer = api.server;

    browser = await chromium.launch({ headless: true }).catch((error: unknown) => {
      throw new Error(
        `Could not launch Chromium. Install it with "pnpm exec playwright install chromium". ${String(error)}`,
      );
    });
    context = await newPhoneContext(browser, recordingDirectory);
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
    await signIn(context, api);
    page = await context.newPage();
    const phone = await openPhone(page, webOrigin);

    const { workflow } = options;
    if (workflow === "setup" || workflow === "all") {
      const race = await createRaceThroughUi(phone);
      if (workflow === "all") await seedRaceRacers(database.db, race.id);
      await recordShare(phone);
    }
    if (workflow === "scan" || workflow === "all") await recordScan(phone);
    if (workflow === "data" || workflow === "all")
      await recordData(
        phone,
        path.join(projectRoot, "src/demo/fixtures/racers.csv"),
      );

    await saveRecording(page, context, options.output);
    console.log(
      `Saved ${workflow} demo video (${PIXEL_10_VIDEO.width}x${PIXEL_10_VIDEO.height}): ${options.output}`,
    );
  } catch (error) {
    if (page && context) {
      const screenshot = options.output.replace(/\.webm$/i, ".failure.png");
      const failedOutput = options.output.replace(/\.webm$/i, ".failed.webm");
      await mkdir(path.dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot, fullPage: true }).then(
        () => console.error(`Failure screenshot: ${screenshot}`),
        () => {},
      );
      await saveRecording(page, context, failedOutput).then(
        () => console.error(`Failed-run recording: ${failedOutput}`),
        () => {},
      );
    }
    throw error;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
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
