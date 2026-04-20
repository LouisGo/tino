# AI Quality Replay Summary

- experiment: `exp-20260420-011-target`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v4`
- runs: `5`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `76.5%`
- false_archive_rate: `0.0%`
- topic_merge_accuracy: `41.2%`
- new_topic_precision: `0.0%`
- cluster_pairwise_f1: `94.1%`
- persist_semantic_correctness: `50.0%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: PASS (0.0% <= 0.05)
- destination_accuracy: FAIL (76.5% >= 0.85)
- topic_merge_accuracy: FAIL (41.2% >= 0.80)

## Current Problem Cases

#### dev_writing_planning_quality_pipeline_001 (score=0.433)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- actual: send the whole batch to inbox ("AI Quality Pipeline v0.1 Planning Notes")
- failures: Wrong existing-topic merge on 6/6 source assignments.
- why it matters: The batch should reward structural quality concerns over writing polish.

#### holdout_new_topic_support_macro_001 (score=0.567)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: archive the whole batch to new topic `support-macros` ("Support Macro Design and Structure")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### dev_task_switching_copy_and_terminal_001 (score=0.687)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- actual: archive 3 captures to existing topic `personal-knowledge-ops` ("Clipboard as quiet inbox and capture-first philosophy"); send 2 captures to inbox ("Rust cargo check and type error during development"); archive 1 captures to existing topic `product-writing-playbook` ("Homepage tone guidance: warmer but technical"); send 1 captures to inbox ("Personal reminder to buy HDMI adapter"); send 1 captures to inbox ("Workflow note about renaming screenshots")
- failures: Wrong existing-topic merge on 3/4 source assignments.
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.

#### dev_meeting_chat_actionables_release_sync_001 (score=0.800)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: send the whole batch to inbox ("Friday demo prep: flow visibility, owner assignments, script, and fallb...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### holdout_import_runtime_overlap_001 (score=0.911)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: archive 4 captures to existing topic `document-markdown-normalization` ("MarkItDown role for file imports vs. clipboard normalization"); archive 2 captures to existing topic `rust-background-compiler` ("Import adapter runtime ownership and async boundaries"); send 1 captures to inbox ("Benchmark ask for import adapter fidelity and cost"); send 1 captures to inbox ("Priority reminder: clipboard eval before document imports")
- failures: Wrong existing-topic merge on 1/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.
