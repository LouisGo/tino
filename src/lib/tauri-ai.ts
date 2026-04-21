import { commands as tauriCommands } from "@/bindings/tauri";
import {
  buildMockApplyBatchDecisionResult,
  getMockAiBatchPayload,
  getMockAiBatchSummaries,
  getMockTopicIndexEntries,
  isMockAiBatchId,
} from "@/features/ai/lib/mock-fixtures";
import { isTauriRuntime, unwrapTauriResult } from "@/lib/tauri-core";
import type {
  AiBatchPayload as RustAiBatchPayload,
  AiBatchSummary as RustAiBatchSummary,
  ApplyBatchDecisionResult as RustApplyBatchDecisionResult,
  BatchCompilePreviewResult as RustBatchCompilePreviewResult,
  TopicIndexEntry as RustTopicIndexEntry,
} from "@/bindings/tauri";
import type {
  AiBatchPayload,
  AiBatchSummary,
  ApplyBatchDecisionRequest,
  ApplyBatchDecisionResult,
  BatchCompilePreviewResult,
  TopicIndexEntry,
} from "@/types/shell";

function normalizeAiBatchSummary(batch: RustAiBatchSummary): AiBatchSummary {
  return batch;
}

function normalizeAiBatchPayload(payload: RustAiBatchPayload): AiBatchPayload {
  return payload;
}

function normalizeTopicIndexEntries(entries: RustTopicIndexEntry[]): TopicIndexEntry[] {
  return entries;
}

function normalizeApplyBatchDecisionResult(
  result: RustApplyBatchDecisionResult,
): ApplyBatchDecisionResult {
  return result;
}

function normalizeBatchCompilePreviewResult(
  result: RustBatchCompilePreviewResult,
): BatchCompilePreviewResult {
  return result;
}

export async function getReadyAiBatches(): Promise<AiBatchSummary[]> {
  if (!isTauriRuntime()) {
    return getMockAiBatchSummaries();
  }

  const batches = await unwrapTauriResult(tauriCommands.listReadyAiBatches());
  return batches.map(normalizeAiBatchSummary);
}

export async function getAiBatchPayload(batchId: string): Promise<AiBatchPayload> {
  if (!isTauriRuntime() || isMockAiBatchId(batchId)) {
    return getMockAiBatchPayload(batchId);
  }

  return normalizeAiBatchPayload(
    await unwrapTauriResult(tauriCommands.getAiBatchPayload(batchId)),
  );
}

export async function getTopicIndexEntries(): Promise<TopicIndexEntry[]> {
  if (!isTauriRuntime()) {
    return getMockTopicIndexEntries();
  }

  return normalizeTopicIndexEntries(
    await unwrapTauriResult(tauriCommands.getTopicIndexEntries()),
  );
}

export async function applyBatchDecision(
  request: ApplyBatchDecisionRequest,
): Promise<ApplyBatchDecisionResult> {
  if (!isTauriRuntime() || isMockAiBatchId(request.batchId)) {
    return buildMockApplyBatchDecisionResult(request);
  }

  return normalizeApplyBatchDecisionResult(
    await unwrapTauriResult(tauriCommands.applyBatchDecision(request)),
  );
}

export async function previewAiBatchCompile(batchId: string): Promise<BatchCompilePreviewResult> {
  return normalizeBatchCompilePreviewResult(
    await unwrapTauriResult(tauriCommands.previewAiBatchCompile(batchId)),
  );
}
