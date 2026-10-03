import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirectory = resolve(clientDirectory, "../node_modules/.cache");
const outputDirectory = resolve(clientDirectory, "dist");
const viteExecutable = resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js");

mkdirSync(cacheDirectory, { recursive: true });
const stagingDirectory = mkdtempSync(join(cacheDirectory, "party-play-client-dist-"));
const previousDirectory = `${stagingDirectory}-previous`;
const assetManifest = ".release-assets.json";

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

  const newAssets = join(stagingDirectory, "assets");
  const currentAssets = readdirSync(newAssets, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const oldAssets = join(outputDirectory, "assets");
  if (existsSync(oldAssets)) {
    const previousManifest = join(outputDirectory, assetManifest);
    const previousAssets = existsSync(previousManifest)
      ? JSON.parse(readFileSync(previousManifest, "utf8"))
      : readdirSync(oldAssets, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name);
    // Retain exactly one previous build, including lazy JS, its CSS and referenced assets.
    for (const name of previousAssets) {
      if (typeof name !== "string" || basename(name) !== name)
        throw new Error("Invalid previous asset manifest");
      if (!existsSync(join(newAssets, name)))
        copyFileSync(join(oldAssets, name), join(newAssets, name));
    }
  }
  writeFileSync(join(stagingDirectory, assetManifest), JSON.stringify(currentAssets));
  chmodSync(stagingDirectory, 0o755);
  if (existsSync(outputDirectory)) renameSync(outputDirectory, previousDirectory);
  try {
    renameSync(stagingDirectory, outputDirectory);
  } catch (error) {
    if (existsSync(previousDirectory)) renameSync(previousDirectory, outputDirectory);
    throw error;
  }
  rmSync(previousDirectory, { recursive: true, force: true });
} catch (error) {
  if (existsSync(stagingDirectory)) {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
  throw error;
}
