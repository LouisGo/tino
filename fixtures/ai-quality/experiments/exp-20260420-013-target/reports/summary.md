# AI Quality Replay Summary

- experiment: `exp-20260420-013-target`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v6`
- runs: `5`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `91.2%`
- false_archive_rate: `9.1%`
- topic_merge_accuracy: `94.1%`
- new_topic_precision: `0.0%`
- cluster_pairwise_f1: `93.7%`
- persist_semantic_correctness: `73.5%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (9.1% <= 0.05)
- destination_accuracy: PASS (91.2% >= 0.85)
- topic_merge_accuracy: PASS (94.1% >= 0.80)

## Current Problem Cases

#### holdout_new_topic_support_macro_001 (score=0.567)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: archive the whole batch to new topic `support-macros-playbook` ("Support Macro Design: Failure-Mode Grouping and Reply Structure")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### holdout_import_runtime_overlap_001 (score=0.705)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: archive 5 captures to existing topic `document-markdown-normalization` ("Document import adapter fit and normalization separation"); archive 2 captures to existing topic `rust-background-compiler` ("Runtime ownership and task boundaries for import adapters"); send 1 captures to inbox ("Priority reminder: ship clipboard eval before document imports")
- failures: False archive count: 1 | Wrong existing-topic merge on 1/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.

#### dev_meeting_chat_actionables_release_sync_001 (score=0.800)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: send the whole batch to inbox ("Friday demo prep: flow, owners, script, and fallback")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_writing_planning_quality_pipeline_001 (score=0.867)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- actual: archive the whole batch to existing topic `prompt-eval-experimentation` ("AI Quality Pipeline v0.1 Planning and Principles")
- why it matters: The batch should reward structural quality concerns over writing polish.

#### dev_task_switching_copy_and_terminal_001 (score=0.940)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- actual: archive 4 captures to existing topic `product-writing-playbook` ("Product messaging principles for capture and synthesis"); send 2 captures to inbox ("Rust compiler check and error during Tauri development"); send 1 captures to inbox ("Personal reminder to buy HDMI adapter"); send 1 captures to inbox ("Slack note about renaming screenshots")
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.
