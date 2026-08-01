import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirectory = resolve(serverDirectory, "../node_modules/.cache");
const outputDirectory = resolve(serverDirectory, "dist");

mkdirSync(cacheDirectory, { recursive: true });
const stagingDirectory = mkdtempSync(join(cacheDirectory, "party-play-server-dist-"));

try {
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "--project",
      resolve(serverDirectory, "tsconfig.json"),
      "--outDir",
      stagingDirectory,
    ],
    { cwd: serverDirectory, stdio: "inherit" },
  );

  rmSync(outputDirectory, { recursive: true, force: true });
  renameSync(stagingDirectory, outputDirectory);
} catch (error) {
  if (existsSync(stagingDirectory)) {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
  throw error;
}
