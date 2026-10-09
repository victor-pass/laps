/** @jsxImportSource hono/jsx */
/** @jsxRuntime automatic */
import { Hono, type Context } from "hono";
import { raw } from "hono/html";
import { createAPI } from "@/api";
import { neonDB } from "@/db/db";
import { renderer } from "./renderer";
import { createApp } from "@/App";
import { createApiProxy } from "./ApiProxy";
import { renderToStringAsync } from "solid-js/web";
import { useAuthenticator, requireAuthPage } from "@/security";
import { noopScanner } from "@/scanner";
import { noopOfflineEngine } from "@/offline";

const api = createAPI(neonDB);
const apiProxy = createApiProxy(api);
const renderPage = async (c: Context) => {
  const url = new URL(c.req.url);
  return c.render(
    <div id="root">
      {raw(
        await renderToStringAsync(() =>
          createApp({
            api: apiProxy(c),
            scanner: noopScanner,
            offline: noopOfflineEngine,
            origin: url.origin,
            url: url.pathname + url.search,
          }),
        ),
      )}
    </div>,
  );
};

// Each client-side route needs its own explicit registration here, scoped to
// its exact path, so it's handled (and auth-guarded) before falling through
// to `.route("/", api)` below. A wildcard "*" would also match API paths
// like /laps and /races, since Hono applies a mounted sub-app's pathless
// `.use()` middleware across the whole parent router, not just its own
// routes.
const root = new Hono<{ Bindings: CloudflareBindings }>()
  .route("/", useAuthenticator(neonDB))
  .use(renderer)
  .get("/", (c) => c.redirect("/scanFront"))
  .use("/scanFront", requireAuthPage)
  .get("/scanFront", renderPage)
  .use("/scanBack", requireAuthPage)
  .get("/scanBack", renderPage)
  .use("/summary", requireAuthPage)
  .get("/summary", renderPage)
  .use("/share", requireAuthPage)
  .get("/share", renderPage)
  .use("/join/:id", requireAuthPage)
  .get("/join/:id", renderPage)
  .route("/", api);

export default root;
