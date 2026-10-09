import { Hono, MiddlewareHandler, Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { googleAuth } from "@hono/oauth-providers/google";
import { sign, jwt, verify } from "hono/jwt";
import { noAuth } from "@/noAuthHandler";
import { type LoadDB } from "@/db/db";
import { user } from "@/db/schema";
import { joinPath, parseJoinUrl } from "@/qr";

const AUTH_TOKEN = "auth_token";
const AUTH_PATH = "/auth/google";
const RETURN_TO = "auth_return_to";
const LOGIN_LIFETIME_SECONDS = 60 * 60 * 24 * 7;
const JWT_PAYLOAD = "jwtPayload";
const GOOGLE_AUTH_VARIABLE = "user-google";

const alg = "HS256";

export interface User {
  sub: string;
  name: string;
  email?: string;
  exp: number;
}

interface AuthenticatorUser {
  id: string;
  name: string;
  email: string;
}

export const authUser = (c: Context) => c.get(JWT_PAYLOAD) as User;

type ENV = { GOOGLE_ID: string; GOOGLE_SECRET: string };

const useAuth = (env: ENV) =>
  import.meta.env.PROD ||
  (env.GOOGLE_ID !== undefined && env.GOOGLE_SECRET !== undefined);

const realAuth = (env: ENV) =>
  googleAuth({
    client_id: env.GOOGLE_ID,
    client_secret: env.GOOGLE_SECRET,
    scope: ["openid", "email", "profile"],
  });

const fakeAuth = noAuth<AuthenticatorUser>(GOOGLE_AUTH_VARIABLE, {
  id: "dev",
  name: "Developer",
  email: "dev@example.com",
});

const selectAuth = (env: ENV) => (useAuth(env) ? realAuth(env) : fakeAuth);

export const useAuthenticator = (loadDB: LoadDB) =>
  new Hono<{
    Bindings: CloudflareBindings;
  }>()
    .use(AUTH_PATH, (c, next) => selectAuth(c.env)(c, next))
    .get(AUTH_PATH, async (c) => {
      const googleUser = c.get(GOOGLE_AUTH_VARIABLE);
      if (!googleUser) return c.text("Google authentication failed", 401);

      const payload = {
        sub: googleUser.id!,
        email: googleUser.email!,
        name: googleUser.name!,
        exp: Math.floor(Date.now() / 1000) + LOGIN_LIFETIME_SECONDS,
      };
      const token = await sign(payload, c.env.JWT_SECRET!);

      const db = await loadDB(c.env);
      await db
        .insert(user)
        .values({ sub: payload.sub, name: payload.name })
        .onConflictDoUpdate({
          target: user.sub,
          set: { name: payload.name },
        });

      setCookie(c, AUTH_TOKEN, token, {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: "lax",
        path: "/",
        maxAge: LOGIN_LIFETIME_SECONDS,
      });
      const saved = getCookie(c, RETURN_TO);
      const link =
        saved && URL.canParse(saved, c.req.url)
          ? parseJoinUrl(new URL(saved, c.req.url))
          : undefined;
      deleteCookie(c, RETURN_TO, { path: "/" });
      return c.redirect(link ? joinPath(link) : "/");
    });

export const requireAuthCookie: MiddlewareHandler = (c, next) =>
  jwt({ secret: c.env.JWT_SECRET, alg, cookie: AUTH_TOKEN })(c, next);

export const requireAuthPage: MiddlewareHandler = async (c, next) => {
  try {
    const token = getCookie(c, AUTH_TOKEN);
    const payload = await verify(token!, c.env.JWT_SECRET, alg);
    c.set(JWT_PAYLOAD, payload);
    return await next();
  } catch {
    const link = parseJoinUrl(new URL(c.req.url));
    if (link)
      setCookie(c, RETURN_TO, joinPath(link), {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
      });
    return c.redirect(AUTH_PATH);
  }
};
