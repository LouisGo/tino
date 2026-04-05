import type { SettingsDraft } from "@/types/shell"

export type ProviderAccessConfig = Pick<SettingsDraft, "baseUrl" | "apiKey" | "model">

export type StructuredObjectRequest = {
  systemPrompt: string
  userPrompt: string
  schemaName: string
}

export type StructuredObjectResult<T> = {
  object: T
  providerLabel: string
}

export interface AiObjectGenerator {
  generateObject<T>(request: StructuredObjectRequest): Promise<StructuredObjectResult<T>>
}

export function resolveProviderAccessConfig(settings: ProviderAccessConfig) {
  return {
    baseUrl: settings.baseUrl.trim(),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    isConfigured:
      settings.baseUrl.trim().length > 0 &&
      settings.apiKey.trim().length > 0 &&
      settings.model.trim().length > 0,
  }
}
