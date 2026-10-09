import { Hono } from "hono";
import { expect, describe, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decode } from "hono/jwt";
import { inMemoryDB } from "@/test/inMemoryDB";
import { uuid } from "@/test/fixtures";
import { requireAuthPage, useAuthenticator } from "@/security";

const env = { JWT_SECRET: randomBytes(32).toString("hex") };

const app = () =>
  new Hono()
    .route("/", useAuthenticator(inMemoryDB))
    .use("/join/:id", requireAuthPage)
    .get("/join/:id", (c) => c.text("joined"))
    .use("/summary", requireAuthPage)
    .get("/summary", (c) => c.text("summary"));

// Just the name=value pairs, as a browser would send them back.
const cookies = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const login = (cookie = "") =>
  app().request("/auth/google", { headers: { cookie } }, env);

describe("login", () => {
  it("lasts a week, so volunteers who join early are still signed in on race day", async () => {
    const week = 60 * 60 * 24 * 7;
    const loggedIn = await login();

    const cookie = loggedIn.headers
      .getSetCookie()
      .find((c) => c.startsWith("auth_token="))!;
    expect(cookie).toContain(`Max-Age=${week}`);

    const token = cookie.split(";")[0]!.slice("auth_token=".length);
    const { exp } = decode(token).payload as { exp: number };
    expect(exp - Date.now() / 1000).toBeCloseTo(week, -1);
  });
});

describe("login redirect", () => {
  it("returns to the join link that required login, name included", async () => {
    const page = await app().request(`/join/${uuid(1)}?name=Trail+Run`, {}, env);
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/auth/google");

    const loggedIn = await login(cookies(page));
    expect(loggedIn.headers.get("location")).toBe(
      `/join/${uuid(1)}?name=Trail+Run`,
    );
    expect(loggedIn.headers.getSetCookie().join()).toMatch(
      /auth_return_to=;.*Max-Age=0/,
    );

    const joined = await app().request(
      `/join/${uuid(1)}`,
      { headers: { cookie: cookies(loggedIn) } },
      env,
    );
    expect(await joined.text()).toBe("joined");
  });

  it("goes home after logging in from any other page", async () => {
    const page = await app().request("/summary", {}, env);
    expect(page.headers.getSetCookie().join()).not.toContain("auth_return_to");

    const loggedIn = await login(cookies(page));
    expect(loggedIn.headers.get("location")).toBe("/");
  });

  it("keeps a tampered return cookie on this site", async () => {
    const loggedIn = await login(
      `auth_return_to=${encodeURIComponent(`https://evil.example/join/${uuid(1)}`)}`,
    );
    expect(loggedIn.headers.get("location")).toBe(`/join/${uuid(1)}`);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/summary",
    `/join/${uuid(1)}/../../evil`,
  ])("ignores a tampered return cookie: %s", async (path) => {
    const loggedIn = await login(
      `auth_return_to=${encodeURIComponent(path)}`,
    );
    expect(loggedIn.headers.get("location")).toBe("/");
  });
});
