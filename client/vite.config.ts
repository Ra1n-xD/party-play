import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { resolve } from "path";

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    {
      name: "partyside-build-version",
      generateBundle(_options, bundle) {
        if (isSsrBuild) return;
        const entry = Object.values(bundle).find((file) => file.type === "chunk" && file.isEntry);
        if (entry)
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ version: rootPkg.version, entry: `/${entry.fileName}` }),
          });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
}));
