import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, UserConfig } from "vite";
import solid from "vite-plugin-solid";
import ssrPlugin from "vite-ssr-components/plugin";
import path from "path";

export const viteConfig: UserConfig = {
  plugins: [
    cloudflare(),
    ssrPlugin(),
    solid({ ssr: true, exclude: "src/server/**" }),
  ],
  esbuild: { jsx: "automatic", jsxImportSource: "hono/jsx" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  css: {
    modules: false,
  },
};

export default defineConfig(viteConfig);
