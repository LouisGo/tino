# AI Quality Replay Summary

- experiment: `exp-20260420-006`
- mode: `live`
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

## Top Failures

- holdout_new_topic_support_macro_001: score=0.567
- holdout_import_runtime_overlap_001: score=0.705
  False archive count: 1
  Wrong existing-topic merge on 1/7 source assignments.
