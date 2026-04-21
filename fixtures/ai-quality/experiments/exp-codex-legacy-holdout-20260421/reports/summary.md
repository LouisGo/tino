# AI Quality Replay Summary

- experiment: `exp-codex-legacy-holdout-20260421`
- pipeline: `legacy`
- mode: `mock`
- prompt_version: `tino.batch_review.engine.v6`
- runs: `2`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `64.3%`
- false_archive_rate: `0.0%`
- topic_merge_accuracy: `14.3%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `46.8%`
- persist_semantic_correctness: `14.3%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: PASS (0.0% <= 0.05)
- destination_accuracy: FAIL (64.3% >= 0.85)
- topic_merge_accuracy: FAIL (14.3% >= 0.80)

## Current Problem Cases

#### holdout_new_topic_support_macro_001 (score=0.476)
- scenario: writing and planning notes
- expected: archive the whole batch to new topic `support-macro-library`
- actual: archive 4 captures to existing topic `weekly-product-ops` ("Support macros: permission reset, knowledge root missin..."); archive 2 captures to existing topic `product-writing-playbook` ("Thanks for reporting the duplicate clipboard capture. H...")
- why it matters: This is a holdout new-topic precision case and should not be overfit by prompt repair.

#### holdout_import_runtime_overlap_001 (score=0.500)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 4 captures to existing topic `document-markdown-normalization`; archive 3 captures to existing topic `rust-background-compiler`; send 1 captures to inbox
- actual: send 6 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `document-markdown-normalization` ("MarkItDown is useful for dropped PDF or DOCX imports, n...")
- failures: Wrong existing-topic merge on 6/7 source assignments.
- why it matters: This holdout should expose whether the model over-merges adjacent architecture concepts.
