import type { GenerateSWOptions } from "workbox-build";

// An empty page (no server-rendered content, no data) that the service
// worker caches when it installs and serves for any page load that can't
// reach the server. Served by the worker (see src/server/index.tsx).
export const APP_SHELL_PATH = "/app-shell";

export const workboxOptions = {
  clientsClaim: true,
  globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
  skipWaiting: true,
  runtimeCaching: [
    {
      // Page loads always go to the server, which renders them and handles
      // login. Only when it can't be reached does the cached app shell open
      // the app from this device's own state instead - so the installed
      // app, or a race join link, still opens offline.
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkOnly",
      options: { precacheFallback: { fallbackURL: APP_SHELL_PATH } },
    },
    {
      urlPattern: /\/laps/,
      handler: "NetworkFirst",
      options: {
        cacheName: "hono-rpc-cache",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 3,
        },
        cacheableResponse: {
          statuses: [200],
        },
      },
    },
  ],
} satisfies Pick<
  GenerateSWOptions,
  "clientsClaim" | "globPatterns" | "runtimeCaching" | "skipWaiting"
>;
