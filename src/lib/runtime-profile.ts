export type AppEnv = "development" | "staging" | "production";
export type DataChannel = "shared" | "production";

function normalizeAppEnv(value: string | undefined): AppEnv | null {
  switch (value) {
    case "development":
    case "staging":
    case "production":
      return value;
    default:
      return null;
  }
}

function normalizeDataChannel(value: string | undefined): DataChannel | null {
  switch (value) {
    case "shared":
    case "production":
      return value;
    default:
      return null;
  }
}

export const appEnv =
  normalizeAppEnv(import.meta.env.VITE_APP_ENV) ??
  (import.meta.env.DEV ? "development" : "production");

export const dataChannel =
  normalizeDataChannel(import.meta.env.VITE_DATA_CHANNEL) ??
  (appEnv === "production" ? "production" : "shared");

export const isProductionDataChannel = dataChannel === "production";
