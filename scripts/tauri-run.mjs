import { spawn } from "node:child_process";

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

const tauriArgs = [
  "exec",
  "tauri",
  command,
  ...forwardedArgs,
  ...(command === "build" && isProductionBuild
    ? ["--config", "src-tauri/tauri.production.conf.json"]
    : []),
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

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
