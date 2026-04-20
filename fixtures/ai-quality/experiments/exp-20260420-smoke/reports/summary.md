# AI Quality Replay Summary

- experiment: `exp-20260420-smoke`
- mode: `mock`
- prompt_version: `tino.batch_review.engine.v2`
- runs: `1`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `66.7%`
- false_archive_rate: `33.3%`
- topic_merge_accuracy: `n/a`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `63.6%`
- persist_semantic_correctness: `66.7%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (33.3% <= 0.05)
- destination_accuracy: FAIL (66.7% >= 0.85)
- topic_merge_accuracy: PASS (0.0% >= 0.80)

## Compare To exp-20260420-005

- compared_runs: `1`
- improved_fixtures: `1`
- regressed_fixtures: `0`
- unchanged_fixtures: `0`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `0.0% -> 66.7% (+66.7 pts)`
- false_archive_rate: `100.0% -> 33.3% (-66.7 pts)`
- topic_merge_accuracy: `n/a -> n/a (n/a)`
- new_topic_precision: `n/a -> n/a (n/a)`
- cluster_pairwise_f1: `100.0% -> 63.6% (-36.4 pts)`
- persist_semantic_correctness: `0.0% -> 66.7% (+66.7 pts)`

### Biggest Improvements

#### dev_meeting_chat_actionables_release_sync_001 (+0.154)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- before: archive the whole batch to existing topic `weekly-product-ops` ("Internal Demo Preparation & Owner Assignments")
- after: send 4 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `weekly-product-ops` ("Friday demo needs one visible flow: queue -> batch -> t...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

### Regressions

- none

## Current Problem Cases

#### dev_meeting_chat_actionables_release_sync_001 (score=0.587)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: send 4 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `weekly-product-ops` ("Friday demo needs one visible flow: queue -> batch -> t...")
- failures: False archive count: 2
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.
