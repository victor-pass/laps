import { defineConfig } from "vite";
import { spawn, type ChildProcess } from "child_process";
import type { AddressInfo } from "net";
import baseConfig from "../vite.config.ts";

export default defineConfig({
  ...baseConfig,
  server: { ...baseConfig.server, allowedHosts: [".ts.net"] },
  plugins: [
    ...(baseConfig.plugins || []),
    {
      name: "remote-bridge",
      configureServer(server) {
        const http = server.httpServer;
        if (!http) return;

        let bridge: ChildProcess | undefined;
        const stopBridge = () => {
          bridge?.kill();
          bridge = undefined;
        };
        // Close Vite properly on Ctrl-C / kill; closing the server stops the bridge.
        const onSignal = () => {
          void server.close().finally(() => process.exit());
        };

        http.on("listening", () => {
          const port = (http.address() as Partial<AddressInfo> | null)?.port;
          if (!port) return;

          console.log(`[Remote] Detected active project port: ${port}`);
          stopBridge();
          bridge = spawn("remote", ["expose", String(port)], {
            stdio: "inherit",
          });
          bridge.on("error", (e) =>
            console.error(`[Remote] remote expose failed: ${e.message}`),
          );
        });

        // Runs on shutdown and on restarts, where Vite closes the old server.
        http.on("close", () => {
          stopBridge();
          process.off("exit", stopBridge);
          process.off("SIGINT", onSignal);
          process.off("SIGTERM", onSignal);
        });
        process.on("exit", stopBridge);
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
      },
    },
  ],
});
