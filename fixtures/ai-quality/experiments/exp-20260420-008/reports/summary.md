# AI Quality Replay Summary

- experiment: `exp-20260420-008`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v2`
- runs: `2`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `50.0%`
- false_archive_rate: `100.0%`
- topic_merge_accuracy: `57.1%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `71.6%`
- persist_semantic_correctness: `28.6%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (100.0% <= 0.05)
- destination_accuracy: FAIL (50.0% >= 0.85)
- topic_merge_accuracy: FAIL (57.1% >= 0.80)

## Compare To exp-20260420-006

- compared_runs: `2`
- improved_fixtures: `0`
- regressed_fixtures: `2`
- unchanged_fixtures: `0`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `85.7% -> 50.0% (-35.7 pts)`
- false_archive_rate: `100.0% -> 100.0% (+0.0 pts)`
- topic_merge_accuracy: `85.7% -> 57.1% (-28.6 pts)`
- new_topic_precision: `0.0% -> n/a (n/a)`
- cluster_pairwise_f1: `88.0% -> 71.6% (-16.4 pts)`
- persist_semantic_correctness: `42.9% -> 28.6% (-14.3 pts)`

### Biggest Improvements

- none

### Regressions

#### holdout_new_topic_support_macro_001 (-0.133)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- before: archive the whole batch to new topic `support-macros` ("Support Macro Development and Structure")
- after: send the whole batch to inbox ("Support Macro Development and Reply Structure")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### holdout_import_runtime_overlap_001 (-0.119)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- before: archive 5 captures to existing topic `document-markdown-normalization` ("Document Import Adapters and Clipboard Normalization Trade-offs"); archive 2 captures to existing topic `rust-background-compiler` ("Runtime Contract and Isolation for Import Adapters"); send 1 captures to inbox ("Priority for Clipboard Eval Over Document Imports")
- after: archive the whole batch to existing topic `document-markdown-normalization` ("Document import adapter design and runtime integration")
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.

## Current Problem Cases

#### holdout_new_topic_support_macro_001 (score=0.433)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: send the whole batch to inbox ("Support Macro Development and Reply Structure")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### holdout_import_runtime_overlap_001 (score=0.586)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: archive the whole batch to existing topic `document-markdown-normalization` ("Document import adapter design and runtime integration")
- failures: False archive count: 1 | Wrong existing-topic merge on 3/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.
