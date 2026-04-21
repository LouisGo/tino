import { describe, expect, it } from "vitest";

import { resolveProviderAccessConfig } from "./provider-access";

describe("resolveProviderAccessConfig", () => {
  it("treats a valid provider profile as configured", () => {
    const config = resolveProviderAccessConfig({
      vendor: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-123456789012",
      model: "gpt-5.4",
    });

    expect(config.isConfigured).toBe(true);
  });

  it("treats an invalid baseUrl as unavailable", () => {
    const config = resolveProviderAccessConfig({
      vendor: "openai",
      baseUrl: "http://api.openai.com/v1",
      apiKey: "sk-test-123456789012",
      model: "gpt-5.4",
    });

    expect(config.isConfigured).toBe(false);
  });

  it("treats an invalid apiKey as unavailable", () => {
    const config = resolveProviderAccessConfig({
      vendor: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "short-key",
      model: "gpt-5.4",
    });

    expect(config.isConfigured).toBe(false);
  });

  it("treats a whitespace model as unavailable", () => {
    const config = resolveProviderAccessConfig({
      vendor: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-123456789012",
      model: "gpt 5.4",
    });

    expect(config.isConfigured).toBe(false);
  });
});
