# AI Quality Replay Summary

- experiment: `exp-codex-legacy-dev-20260421`
- pipeline: `legacy`
- mode: `mock`
- prompt_version: `tino.batch_review.engine.v6`
- runs: `10`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `51.6%`
- false_archive_rate: `40.9%`
- topic_merge_accuracy: `33.3%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `57.8%`
- persist_semantic_correctness: `35.9%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (40.9% <= 0.05)
- destination_accuracy: FAIL (51.6% >= 0.85)
- topic_merge_accuracy: FAIL (33.3% >= 0.80)

## Current Problem Cases

#### dev_topic_overlap_python_vs_eval_001 (score=0.421)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 5 captures to existing topic `python-analysis-sidecar`; archive 2 captures to existing topic `prompt-eval-experimentation`
- actual: send 5 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `python-analysis-sidecar` ("Use Python notebooks to cluster failure cases after eac...")
- failures: Wrong existing-topic merge on 5/7 source assignments.
- why it matters: Correct clustering requires separating Python-side artifact analysis from runner and metric ownership.

#### dev_bilingual_mixed_eval_001 (score=0.442)
- scenario: bilingual mixed-language clipboard batch
- expected: split into archive 6 captures to existing topic `prompt-eval-experimentation`; archive 1 captures to existing topic `python-analysis-sidecar`
- actual: send 5 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `prompt-eval-experimentation` ("先把 mock batch 和 golden 固定，再谈 prompt polish。")
- failures: Wrong existing-topic merge on 5/7 source assignments.
- why it matters: The system should not confuse bilingual wording with topic ambiguity.

#### dev_low_value_noise_misc_001 (score=0.447)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- actual: send 5 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `personal-knowledge-ops` ("482911")
- failures: False archive count: 2
- why it matters: The useful note still lacks enough context for direct topic archival.

#### dev_task_switching_copy_and_terminal_001 (score=0.475)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- actual: archive 6 captures to existing topic `rust-background-compiler` ("cargo check --manifest-path src-tauri/Cargo.toml"); archive 2 captures to existing topic `product-writing-playbook` ("The clipboard should feel like a quiet inbox, not a das...")
- failures: False archive count: 4 | Wrong existing-topic merge on 2/4 source assignments.
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.

#### dev_focused_research_markitdown_001 (score=0.487)
- scenario: focused research notes
- expected: archive the whole batch to existing topic `document-markdown-normalization`
- actual: send 4 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `document-markdown-normalization` ("MarkItDown solves file-to-Markdown conversion more than...")
- failures: Wrong existing-topic merge on 4/6 source assignments.
- why it matters: The correct durable output is a merge into document-markdown-normalization, not a generic AI quality topic.
