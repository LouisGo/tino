import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const rawArgs = process.argv.slice(2);
const [command, ...restArgs] = rawArgs;

if (!command) {
  console.error(
    "Usage: pnpm tauri <dev|build|...> [args]\n" +
      "  pnpm tauri dev\n" +
      "  pnpm tauri build\n" +
      "  pnpm tauri build --production",
  );
  process.exit(1);
}

const productionFlagIndex = restArgs.indexOf("--production");
const isProductionBuild = command === "build" && productionFlagIndex >= 0;
const forwardedArgs =
  productionFlagIndex >= 0
    ? restArgs.filter((_, index) => index !== productionFlagIndex)
    : [...restArgs];

const appEnv =
  command === "dev"
    ? "development"
    : isProductionBuild
      ? "production"
      : command === "build"
        ? "staging"
        : process.env.TINO_APP_ENV ?? "development";

const dataChannel =
  command === "build" && isProductionBuild ? "production" : process.env.TINO_DATA_CHANNEL ?? "shared";

function resolveActiveConfigPath() {
  if (command === "dev") {
    return "src-tauri/tauri.development.conf.json";
  }

  if (command === "build" && isProductionBuild) {
    return "src-tauri/tauri.production.conf.json";
  }

  if (command === "build") {
    return "src-tauri/tauri.staging.conf.json";
  }

  return null;
}

const activeConfigPath = resolveActiveConfigPath();

function mergeConfig(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override ?? base;
  }

  if (
    base
    && override
    && typeof base === "object"
    && typeof override === "object"
  ) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = key in merged ? mergeConfig(merged[key], value) : value;
    }
    return merged;
  }

  return override ?? base;
}

function createEffectiveConfigPath() {
  if (command !== "build" || process.platform !== "darwin") {
    return { path: activeConfigPath, cleanupDir: null };
  }

  const projectRoot = path.resolve(import.meta.dirname, "..");
  const baseConfig = loadJsonConfig(path.join(projectRoot, "src-tauri", "tauri.conf.json"));
  const overrideConfig = activeConfigPath
    ? loadJsonConfig(path.join(projectRoot, activeConfigPath))
    : {};
  const mergedConfig = mergeConfig(baseConfig, overrideConfig);
  mergedConfig.bundle = {
    ...(mergedConfig.bundle ?? {}),
    // We rebuild DMG/ZIP from the post-processed .app ourselves to keep signing stable.
    targets: ["app"],
  };

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "tino-tauri-config-"));
  const tempConfigPath = path.join(tempDir, "tauri.generated.conf.json");
  writeFileSync(tempConfigPath, `${JSON.stringify(mergedConfig, null, 2)}\n`, "utf8");
  return { path: tempConfigPath, cleanupDir: tempDir };
}

const effectiveConfig = createEffectiveConfigPath();

const tauriArgs = [
  "exec",
  "tauri",
  command,
  ...forwardedArgs,
  ...(effectiveConfig.path ? ["--config", effectiveConfig.path] : []),
];

const child = spawn("pnpm", tauriArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    TINO_APP_ENV: appEnv,
    TINO_DATA_CHANNEL: dataChannel,
    VITE_APP_ENV: appEnv,
    VITE_DATA_CHANNEL: dataChannel,
  },
});

function runProcess(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const subprocess = spawn(bin, args, {
      stdio: "inherit",
      ...options,
    });

    subprocess.on("error", reject);
    subprocess.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${bin} exited with signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${bin} exited with code ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

function readCodesignIdentifier(targetPath) {
  const result = spawnSync("codesign", ["-dv", "--verbose=4", targetPath], {
    encoding: "utf8",
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

function loadJsonConfig(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadLocalSigningEnv() {
  const candidatePaths = [
    path.join(path.resolve(import.meta.dirname, ".."), ".local", "macos-signing.env"),
    path.join(os.homedir(), ".config", "tino", "macos-signing.env"),
  ];

  for (const envPath of candidatePaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    const entries = {};
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\""))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      entries[key] = value;
    }

    return entries;
  }

  return {};
}

function resolveCodesignSettings() {
  const localSigningEnv = loadLocalSigningEnv();
  const identity =
    process.env.TINO_MACOS_SIGNING_IDENTITY?.trim()
    || localSigningEnv.TINO_MACOS_SIGNING_IDENTITY?.trim()
    || "-";
  const keychain =
    process.env.TINO_MACOS_SIGNING_KEYCHAIN?.trim()
    || localSigningEnv.TINO_MACOS_SIGNING_KEYCHAIN?.trim()
    || null;
  const keychainPassword =
    process.env.TINO_MACOS_SIGNING_KEYCHAIN_PASSWORD?.trim()
    || localSigningEnv.TINO_MACOS_SIGNING_KEYCHAIN_PASSWORD?.trim()
    || null;

  return { identity, keychain, keychainPassword };
}

function unlockCodesignKeychain(settings) {
  if (!settings.keychain || !settings.keychainPassword) {
    return;
  }

  const result = spawnSync(
    "security",
    ["unlock-keychain", "-p", settings.keychainPassword, settings.keychain],
    { encoding: "utf8" },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `failed to unlock signing keychain ${settings.keychain}: ${summarizeCommandOutput(result)}`,
    );
  }
}

function validateCodesignIdentity(settings) {
  if (!settings.identity || settings.identity === "-") {
    return;
  }

  const args = ["find-identity", "-v", "-p", "codesigning"];
  if (settings.keychain) {
    args.push(settings.keychain);
  }

  const result = spawnSync("security", args, { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `failed to inspect macOS signing identities: ${summarizeCommandOutput(result)}`,
    );
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!output.includes(settings.identity) || output.includes("0 valid identities found")) {
    throw new Error(
      `configured macOS signing identity "${settings.identity}" is not a valid codesigning identity${settings.keychain ? ` in ${settings.keychain}` : ""}. Re-run \`pnpm macos:setup-local-signing\` or clear the stale signing env before rebuilding.`,
    );
  }
}

function summarizeCommandOutput(result) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return output[0] ?? "unknown failure";
}

function resolveTauriBundleMetadata() {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const baseConfigPath = path.join(projectRoot, "src-tauri", "tauri.conf.json");
  const baseConfig = loadJsonConfig(baseConfigPath);
  const overrideConfigPath = activeConfigPath
    ? path.join(projectRoot, activeConfigPath)
    : null;
  const overrideConfig = overrideConfigPath && existsSync(overrideConfigPath)
    ? loadJsonConfig(overrideConfigPath)
    : {};
  const productName = overrideConfig.productName ?? baseConfig.productName;
  const identifier = overrideConfig.identifier ?? baseConfig.identifier;
  const version = overrideConfig.version ?? baseConfig.version;
  const archLabel =
    process.arch === "arm64"
      ? "aarch64"
      : process.arch === "x64"
        ? "x64"
        : process.arch;
  const bundlePath = path.join(
    projectRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    `${productName}.app`,
  );
  const dmgPath = path.join(
    projectRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "dmg",
    `${productName}_${version}_${archLabel}.dmg`,
  );
  const zipPath = path.join(
    projectRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    `${productName}_${version}_${archLabel}.zip`,
  );

  return { bundlePath, dmgPath, zipPath, identifier, productName };
}

function verifyCodesign(targetPath) {
  const result = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=4", targetPath], {
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`codesign verification failed for ${targetPath}: ${summarizeCommandOutput(result)}`);
  }
}

function pruneUnexpectedMacBundles(bundleMetadata) {
  if (!bundleMetadata || process.platform !== "darwin") {
    return;
  }

  const expectedBundleName = path.basename(bundleMetadata.bundlePath);
  const bundleDir = path.dirname(bundleMetadata.bundlePath);
  if (!existsSync(bundleDir)) {
    return;
  }

  for (const entry of readdirSync(bundleDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith(".app") || entry.name === expectedBundleName) {
      continue;
    }

    const staleBundlePath = path.join(bundleDir, entry.name);
    console.log(`[tauri-run] Removing stale macOS bundle artifact ${staleBundlePath}.`);
    rmSync(staleBundlePath, { recursive: true, force: true });
  }
}

async function resignMacBundle() {
  if (command !== "build" || process.platform !== "darwin") {
    return null;
  }

  const metadata = resolveTauriBundleMetadata();
  pruneUnexpectedMacBundles(metadata);
  const { bundlePath, identifier } = metadata;
  const signingSettings = resolveCodesignSettings();
  const signingIdentity = signingSettings.identity;
  if (!existsSync(bundlePath)) {
    console.warn(`[tauri-run] Skipped macOS bundle re-sign because ${bundlePath} was not found.`);
    return null;
  }
  unlockCodesignKeychain(signingSettings);
  validateCodesignIdentity(signingSettings);

  console.log(
    `[tauri-run] Re-signing ${bundlePath} with identifier ${identifier} using ${signingIdentity === "-" ? "ad-hoc signing" : signingIdentity}.`,
  );
  const codesignArgs = [
    "--force",
    "--deep",
    "--sign",
    signingIdentity,
    "--identifier",
    identifier,
    bundlePath,
  ];
  if (signingSettings.keychain) {
    codesignArgs.splice(codesignArgs.length - 1, 0, "--keychain", signingSettings.keychain);
  }
  await runProcess("codesign", codesignArgs);
  const actualIdentifier = readCodesignIdentifier(bundlePath);
  if (actualIdentifier !== identifier) {
    throw new Error(
      `macOS bundle identifier mismatch after re-sign: expected ${identifier}, got ${actualIdentifier ?? "unknown"}`,
    );
  }
  verifyCodesign(bundlePath);
  if (signingIdentity === "-") {
    console.warn(
      "[tauri-run] No persistent macOS signing identity is configured. Accessibility trust can reset after rebuilds because ad-hoc signatures identify only a single build. Run `pnpm macos:setup-local-signing` once, then rebuild.",
    );
  }

  return metadata;
}

async function rebuildMacDmg(bundleMetadata) {
  if (!bundleMetadata || process.platform !== "darwin") {
    return false;
  }

  const { bundlePath, dmgPath, productName } = bundleMetadata;
  const parentDir = path.dirname(bundlePath);
  const stagedDir = mkdtempSync(path.join(os.tmpdir(), "tino-dmg-stage-"));
  const stagedBundlePath = path.join(stagedDir, path.basename(bundlePath));
  const applicationsAliasPath = path.join(stagedDir, "Applications");

  try {
    rmSync(dmgPath, { force: true });
    await runProcess("ditto", [bundlePath, stagedBundlePath]);
    verifyCodesign(stagedBundlePath);
    symlinkSync("/Applications", applicationsAliasPath);
    console.log(
      `[tauri-run] Rebuilding ${dmgPath} from the re-signed app bundle so installed copies keep the same Accessibility identity.`,
    );
    try {
      await runProcess("hdiutil", [
        "create",
        "-volname",
        productName,
        "-srcfolder",
        stagedDir,
        "-ov",
        "-format",
        "UDZO",
        dmgPath,
      ], { cwd: parentDir });
      return true;
    } catch (error) {
      console.warn(
        `[tauri-run] Skipped DMG rebuild because hdiutil failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  } finally {
    rmSync(stagedDir, { recursive: true, force: true });
  }
}

async function buildMacZip(bundleMetadata) {
  if (!bundleMetadata || process.platform !== "darwin") {
    return;
  }

  const { bundlePath, zipPath } = bundleMetadata;
  const bundleParentDir = path.dirname(bundlePath);
  const bundleName = path.basename(bundlePath);

  console.log(
    `[tauri-run] Creating ${zipPath} from the signed app bundle so installation can bypass the DMG path if needed.`,
  );
  rmSync(zipPath, { force: true });
  await runProcess("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    bundleName,
    zipPath,
  ], { cwd: bundleParentDir });
}

async function revealInstallableMacBundle(bundleMetadata) {
  if (!bundleMetadata || process.platform !== "darwin" || !isProductionBuild) {
    return;
  }

  const { bundlePath } = bundleMetadata;
  if (!existsSync(bundlePath)) {
    console.warn(`[tauri-run] Skipped Finder reveal because ${bundlePath} was not found.`);
    return;
  }

  console.log(
    `[tauri-run] Revealing the installable app bundle in Finder: ${bundlePath}`,
  );

  try {
    await runProcess("open", ["-R", bundlePath]);
  } catch (error) {
    console.warn(
      `[tauri-run] Failed to reveal the installable app bundle in Finder: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

child.on("exit", async (code, signal) => {
  if (signal) {
    if (effectiveConfig.cleanupDir) {
      rmSync(effectiveConfig.cleanupDir, { recursive: true, force: true });
    }
    process.kill(process.pid, signal);
    return;
  }

  if (code !== 0) {
    if (effectiveConfig.cleanupDir) {
      rmSync(effectiveConfig.cleanupDir, { recursive: true, force: true });
    }
    process.exit(code ?? 1);
    return;
  }

  try {
    const bundleMetadata = await resignMacBundle();
    await rebuildMacDmg(bundleMetadata);
    await buildMacZip(bundleMetadata);
    await revealInstallableMacBundle(bundleMetadata);
    if (effectiveConfig.cleanupDir) {
      rmSync(effectiveConfig.cleanupDir, { recursive: true, force: true });
    }
    process.exit(0);
  } catch (error) {
    if (effectiveConfig.cleanupDir) {
      rmSync(effectiveConfig.cleanupDir, { recursive: true, force: true });
    }
    console.error(
      `[tauri-run] Failed to post-process the macOS bundle: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
});
