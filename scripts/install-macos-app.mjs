import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2);
const isProductionBuild = rawArgs.includes("--production");
const projectRoot = path.resolve(import.meta.dirname, "..");

function loadJsonConfig(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function summarizeCommandOutput(result) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return output[0] ?? "unknown failure";
}

function verifyCodesign(targetPath) {
  const result = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=4", targetPath], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`codesign verification failed for ${targetPath}: ${summarizeCommandOutput(result)}`);
  }
}

function readCodesignIdentifier(targetPath) {
  const result = spawnSync("codesign", ["-dv", "--verbose=4", targetPath], {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `codesign exited with code ${result.status ?? 1}`);
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const identifierLine = output
    .split("\n")
    .find((line) => line.startsWith("Identifier="));

  return identifierLine?.slice("Identifier=".length).trim() ?? null;
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${bin} exited with code ${result.status ?? 1}`);
  }
}

const baseConfig = loadJsonConfig(path.join(projectRoot, "src-tauri", "tauri.conf.json"));
const overrideConfig = isProductionBuild
  ? loadJsonConfig(path.join(projectRoot, "src-tauri", "tauri.production.conf.json"))
  : loadJsonConfig(path.join(projectRoot, "src-tauri", "tauri.staging.conf.json"));
const productName = overrideConfig.productName ?? baseConfig.productName;
const expectedIdentifier = overrideConfig.identifier ?? baseConfig.identifier;
const sourceBundlePath = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "macos",
  `${productName}.app`,
);
const destinationBundlePath = path.join("/Applications", `${productName}.app`);

if (!existsSync(sourceBundlePath)) {
  console.error(`[install-macos-app] Built app bundle not found: ${sourceBundlePath}`);
  console.error(
    `[install-macos-app] Run ${isProductionBuild ? "`pnpm tauri build --production`" : "`pnpm tauri build`"} first.`,
  );
  process.exit(1);
}

verifyCodesign(sourceBundlePath);
const sourceIdentifier = readCodesignIdentifier(sourceBundlePath);
if (sourceIdentifier !== expectedIdentifier) {
  console.error(
    `[install-macos-app] Refusing to install ${sourceBundlePath} because its identifier is ${sourceIdentifier ?? "unknown"} instead of ${expectedIdentifier}.`,
  );
  process.exit(1);
}

console.log(`[install-macos-app] Installing ${sourceBundlePath} to ${destinationBundlePath}.`);
rmSync(destinationBundlePath, { recursive: true, force: true });
run("ditto", [sourceBundlePath, destinationBundlePath]);
verifyCodesign(destinationBundlePath);

const installedIdentifier = readCodesignIdentifier(destinationBundlePath);
if (installedIdentifier !== expectedIdentifier) {
  console.error(
    `[install-macos-app] Installed app identifier mismatch: expected ${expectedIdentifier}, got ${installedIdentifier ?? "unknown"}.`,
  );
  process.exit(1);
}

console.log(
  `[install-macos-app] Installed ${destinationBundlePath} with identifier ${installedIdentifier}.`,
);
