# AI Quality Replay Summary

- experiment: `exp-20260420-001`
- mode: `mock`
- runs: `2`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `33.3%`
- false_archive_rate: `0.0%`
- topic_merge_accuracy: `33.3%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `63.6%`
- persist_semantic_correctness: `33.3%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: PASS (0.0% <= 0.05)
- destination_accuracy: FAIL (33.3% >= 0.85)
- topic_merge_accuracy: FAIL (33.3% >= 0.80)

## Top Failures

- dev_focused_research_markitdown_001: score=0.487
  Wrong existing-topic merge on 4/6 source assignments.
- dev_coding_debugging_pasteback_001: score=0.487
  Wrong existing-topic merge on 4/6 source assignments.
