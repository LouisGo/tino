# AI Quality Replay Summary

- experiment: `exp-20260420-015`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v6`
- runs: `2`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `85.7%`
- false_archive_rate: `100.0%`
- topic_merge_accuracy: `85.7%`
- new_topic_precision: `0.0%`
- cluster_pairwise_f1: `88.0%`
- persist_semantic_correctness: `42.9%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (100.0% <= 0.05)
- destination_accuracy: PASS (85.7% >= 0.85)
- topic_merge_accuracy: PASS (85.7% >= 0.80)

## Compare To exp-20260420-006

- compared_runs: `2`
- improved_fixtures: `0`
- regressed_fixtures: `0`
- unchanged_fixtures: `2`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `85.7% -> 85.7% (+0.0 pts)`
- false_archive_rate: `100.0% -> 100.0% (+0.0 pts)`
- topic_merge_accuracy: `85.7% -> 85.7% (+0.0 pts)`
- new_topic_precision: `0.0% -> 0.0% (+0.0 pts)`
- cluster_pairwise_f1: `88.0% -> 88.0% (+0.0 pts)`
- persist_semantic_correctness: `42.9% -> 42.9% (+0.0 pts)`

### Biggest Improvements

- none

### Regressions

- none

## Current Problem Cases

#### holdout_new_topic_support_macro_001 (score=0.567)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: archive the whole batch to new topic `support-macro-design-principles-and-structure` ("Support Macro Design Principles and Structure")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### holdout_import_runtime_overlap_001 (score=0.705)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: archive 5 captures to existing topic `document-markdown-normalization` ("Document import adapter selection and normalization boundaries"); archive 2 captures to existing topic `rust-background-compiler` ("Runtime ownership for import adapters and task boundaries"); send 1 captures to inbox ("Priority reminder: clipboard eval before document imports")
- failures: False archive count: 1 | Wrong existing-topic merge on 1/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.
