/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: "development" | "staging" | "production";
  readonly VITE_DATA_CHANNEL?: "shared" | "production";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
