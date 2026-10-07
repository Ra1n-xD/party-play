import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const require = createRequire(import.meta.url);
const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirectory = resolve(clientDirectory, "../node_modules/.cache");
const outputDirectory = resolve(clientDirectory, "dist");
const viteExecutable = resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js");

mkdirSync(cacheDirectory, { recursive: true });
const stagingDirectory = mkdtempSync(join(cacheDirectory, "party-side-client-dist-"));
const previousDirectory = `${stagingDirectory}-previous`;
const assetManifest = ".release-assets.json";
const prerenderDirectory = join(stagingDirectory, ".prerender");

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

  // Public routes ship real HTML, metadata and links before JavaScript starts.
  await build({
    root: clientDirectory,
    configFile: resolve(clientDirectory, "vite.config.ts"),
    build: {
      ssr: resolve(clientDirectory, "src/platform/seo/prerender.tsx"),
      copyPublicDir: false,
      outDir: prerenderDirectory,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: "prerender.mjs" } },
    },
  });
  const { renderPage, publicPages, utilityPages, SITE_URL } = await import(
    pathToFileURL(join(prerenderDirectory, "prerender.mjs")).href
  );
  const startupBundle = await build({
    configFile: false,
    build: {
      write: false,
      lib: {
        entry: resolve(clientDirectory, "src/platform/startupHead.ts"),
        name: "PartySideStartup",
        formats: ["iife"],
      },
    },
  });
  const startupOutput = Array.isArray(startupBundle) ? startupBundle[0] : startupBundle;
  const startupScript = startupOutput.output.find((file) => file.type === "chunk").code;
  const startupHash = createHash("sha256").update(startupScript).digest("hex").slice(0, 12);
  const startupFilename = `startup-${startupHash}.js`;
  writeFileSync(join(stagingDirectory, "assets", startupFilename), startupScript);
  const template = readFileSync(join(stagingDirectory, "index.html"), "utf8").replace(
    "<!--app-startup-->",
    `<script src="/assets/${startupFilename}"></script>`,
  );
  const paths = [
    ...publicPages.map((page) => page.path),
    ...utilityPages.map(([path]) => path),
    "/404",
  ];
  for (const path of paths) {
    const filename = path === "/" ? "index.html" : `${path.slice(1)}.html`;
    const destination = join(stagingDirectory, filename);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, renderPage(path, template));
  }
  writeFileSync(
    join(stagingDirectory, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicPages.map((page) => `  <url><loc>${SITE_URL}${page.path}</loc></url>`).join("\n")}\n</urlset>\n`,
  );
  writeFileSync(
    join(stagingDirectory, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /socket.io/\nDisallow: /deployz\nDisallow: /healthz\nDisallow: /readyz\nDisallow: /version.json\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  );
  rmSync(prerenderDirectory, { recursive: true, force: true });

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
