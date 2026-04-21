# AI Quality Replay Summary

- experiment: `exp-codex-background-holdout-20260421`
- pipeline: `background`
- mode: `mock`
- prompt_version: `tino.background_compile.provider_prompt.v1`
- runs: `2`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `78.6%`
- false_archive_rate: `100.0%`
- topic_merge_accuracy: `28.6%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `72.7%`
- persist_semantic_correctness: `14.3%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (100.0% <= 0.05)
- destination_accuracy: FAIL (78.6% >= 0.85)
- topic_merge_accuracy: FAIL (28.6% >= 0.80)

## Compare To exp-codex-legacy-holdout-20260421

- compared_runs: `2`
- improved_fixtures: `1`
- regressed_fixtures: `1`
- unchanged_fixtures: `0`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `64.3% -> 78.6% (+14.3 pts)`
- false_archive_rate: `0.0% -> 100.0% (+100.0 pts)`
- topic_merge_accuracy: `14.3% -> 28.6% (+14.3 pts)`
- new_topic_precision: `n/a -> n/a (n/a)`
- cluster_pairwise_f1: `46.8% -> 72.7% (+25.9 pts)`
- persist_semantic_correctness: `14.3% -> 14.3% (+0.0 pts)`

### Biggest Improvements

#### holdout_new_topic_support_macro_001 (+0.091)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- before: archive 4 captures to existing topic `weekly-product-ops` ("Support macros: permission reset, knowledge root missin..."); archive 2 captures to existing topic `product-writing-playbook` ("Thanks for reporting the duplicate clipboard capture. H...")
- after: archive the whole batch to existing topic `product-writing-playbook` ("Thanks for reporting the duplicate clipboard capture. Here…")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

### Regressions

#### holdout_import_runtime_overlap_001 (-0.051)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- before: send 6 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `document-markdown-normalization` ("MarkItDown is useful for dropped PDF or DOCX imports, n...")
- after: archive 6 captures to existing topic `document-markdown-normalization` ("MarkItDown is useful for dropped PDF or DOCX imports, not …"); send 2 captures to inbox ("Reference links pending calmer compilation")
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.

## Current Problem Cases

#### holdout_import_runtime_overlap_001 (score=0.449)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: archive 6 captures to existing topic `document-markdown-normalization` ("MarkItDown is useful for dropped PDF or DOCX imports, not …"); send 2 captures to inbox ("Reference links pending calmer compilation")
- failures: False archive count: 1 | Wrong existing-topic merge on 5/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.

#### holdout_new_topic_support_macro_001 (score=0.567)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: archive the whole batch to existing topic `product-writing-playbook` ("Thanks for reporting the duplicate clipboard capture. Here…")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.
