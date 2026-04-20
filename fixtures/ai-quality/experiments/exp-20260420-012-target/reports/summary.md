# AI Quality Replay Summary

- experiment: `exp-20260420-012-target`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v5`
- runs: `5`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `94.1%`
- false_archive_rate: `9.1%`
- topic_merge_accuracy: `82.4%`
- new_topic_precision: `0.0%`
- cluster_pairwise_f1: `84.7%`
- persist_semantic_correctness: `67.6%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (9.1% <= 0.05)
- destination_accuracy: PASS (94.1% >= 0.85)
- topic_merge_accuracy: PASS (82.4% >= 0.80)

## Current Problem Cases

#### holdout_new_topic_support_macro_001 (score=0.567)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: archive the whole batch to new topic `support-macros-playbook` ("Support macro design: failure-mode grouping, reply structure, and diagn...")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### holdout_import_runtime_overlap_001 (score=0.586)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: archive the whole batch to existing topic `document-markdown-normalization` ("Import adapter fit and runtime ownership boundaries")
- failures: False archive count: 1 | Wrong existing-topic merge on 3/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.

#### dev_meeting_chat_actionables_release_sync_001 (score=0.800)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: send the whole batch to inbox ("Friday demo prep: flow visibility, owner assignments, script, and fallb...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_writing_planning_quality_pipeline_001 (score=0.867)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- actual: archive the whole batch to existing topic `prompt-eval-experimentation` ("AI Quality Pipeline v0.1 Planning Notes")
- why it matters: The batch should reward structural quality concerns over writing polish.

#### dev_task_switching_copy_and_terminal_001 (score=0.927)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- actual: archive 4 captures to existing topic `product-writing-playbook` ("Product messaging and tone guidance for clipboard and homepage"); send 2 captures to inbox ("Terminal cargo check command and Rust compiler error"); discard 2 captures ("Personal errand and file management reminder")
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.
