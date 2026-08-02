import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirectory = resolve(clientDirectory, "../node_modules/.cache");
const outputDirectory = resolve(clientDirectory, "dist");
const viteExecutable = resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js");

mkdirSync(cacheDirectory, { recursive: true });
const stagingDirectory = mkdtempSync(join(cacheDirectory, "party-play-client-dist-"));

try {
  execFileSync(
    process.execPath,
    [require.resolve("typescript/bin/tsc"), "--project", resolve(clientDirectory, "tsconfig.json")],
    { cwd: clientDirectory, stdio: "inherit" },
  );

  execFileSync(
    process.execPath,
    [viteExecutable, "build", "--outDir", stagingDirectory, "--emptyOutDir"],
    { cwd: clientDirectory, stdio: "inherit" },
  );

  rmSync(outputDirectory, { recursive: true, force: true });
  renameSync(stagingDirectory, outputDirectory);
} catch (error) {
  if (existsSync(stagingDirectory)) {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
  throw error;
}
