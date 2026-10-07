import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";

const resolve = {
  alias: {
    "@": path.resolve(import.meta.dirname, "./src"),
  },
};

export default defineConfig({
  plugins: [solid({ ssr: false })],
  resolve,

  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          include: ["src/**/*.test.ts"],
        },
      },

      // Renders components to HTML in Node, as src/server/index.tsx does, to
      // catch code that only breaks without a DOM. Doesn't extend the root
      // config so it gets its own SSR-compiling Solid plugin.
      {
        plugins: [solid({ ssr: true })],
        resolve,
        test: {
          name: "ssr",
          include: ["src/**/*.ssr.test.tsx"],
          environment: "node",
        },
      },

      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          exclude: ["src/**/*.ssr.test.tsx"],
          setupFiles: ["./src/test/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
