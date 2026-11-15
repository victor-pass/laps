import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Frame, Locator, Page } from "playwright";
import { DEMO_RACE_NAME } from "../../src/demo/fixtures";
import { parseCsv } from "../../src/demo/csv";

const POINTER_PACING = { hoverMs: 320, pressMs: 200, settleMs: 280 };

/** The recorded page, the app frame inside its phone mockup, and the app's origin. */
export interface Phone {
  page: Page;
  app: Frame;
  origin: string;
}

async function tap({ page }: Phone, target: Locator): Promise<void> {
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

function waitForApi(
  { page }: Phone,
  method: string,
  pathname: string,
  timeout: number,
) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === pathname &&
      response.request().method() === method,
    { timeout },
  );
}

async function openRacePage({ app, origin }: Phone): Promise<void> {
  await app.goto(`${origin}/race`, { waitUntil: "domcontentloaded" });
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

export async function createRaceThroughUi(phone: Phone) {
  const { app } = phone;
  await openRacePage(phone);
  await app.locator(".race-trigger").waitFor();
  await tap(phone, app.locator(".race-trigger"));
  await tap(phone, app.getByRole("button", { name: "New race" }));
  const input = app.locator("form.create-race input.name");
  await tap(phone, input);
  await input.pressSequentially(DEMO_RACE_NAME, { delay: 90 });

  const createdResponse = waitForApi(phone, "POST", "/races", 20_000);
  const selectedResponse = waitForApi(phone, "PUT", "/races/selected", 20_000);
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

export async function recordShare(phone: Phone): Promise<void> {
  const { page, app } = phone;
  await openRacePage(phone);
  await tap(phone, app.locator(".menu > button"));
  await tap(phone, app.getByRole("link", { name: "Share" }));
  await app.locator(".show-race-qr svg").waitFor({ timeout: 20_000 });
  await app.getByText(`Scan to join: ${DEMO_RACE_NAME}`).waitFor();
  await page.waitForTimeout(3_500);
}

export async function recordScan(phone: Phone): Promise<void> {
  const { page, app } = phone;
  await openRacePage(phone);
  await app.locator(".racer-table tbody tr").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  const scanResponse = waitForApi(phone, "POST", "/runners/scan", 30_000);
  await tap(phone, app.locator(".menu > button"));
  await tap(phone, app.getByRole("link", { name: "Back" }));
  await app.locator(".scan video").waitFor();
  const response = await scanResponse;
  if (!response.ok())
    throw new Error(`Fake lap scan failed with status ${response.status()}`);
  const popup = app.locator(".popup.success");
  await popup.waitFor({ timeout: 10_000 });
  await assertPopupMessage(popup, "Lap 1 - Caleb");
  await page.waitForTimeout(3_000);
}

export async function recordData(phone: Phone, csvPath: string): Promise<void> {
  const { page, app } = phone;
  await openRacePage(phone);
  await app.locator(".racers h2").waitFor({ timeout: 20_000 });
  await app.waitForFunction(
    () => document.querySelectorAll(".racer-table tbody tr").length >= 2,
  );

  await tap(phone, app.getByRole("button", { name: "+ Add racers" }));
  const importedCsv = await readFile(csvPath, "utf8");
  await app.locator(".import-file input[type=file]").setInputFiles({
    name: path.basename(csvPath),
    mimeType: "text/csv",
    buffer: Buffer.from(importedCsv),
  });
  const preview = app.locator(".import-preview .import-summary");
  await preview.waitFor({ timeout: 10_000 });
  assert.match(await preview.textContent() ?? "", /2 to update, 0 new/);
  await page.waitForTimeout(1_800);
  await tap(phone, app.getByRole("button", { name: "Upload" }));
  const importPopup = app.locator(".popup.success");
  await importPopup.waitFor({ timeout: 15_000 });
  await assertPopupMessage(importPopup, "Updated 2, added 0");

  await tap(phone, app.locator(".download-menu summary"));
  const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
  await tap(phone, app.getByRole("button", { name: /All race data - flat/ }));
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
    importedFileName: path.basename(csvPath),
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
