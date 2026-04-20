# AI Quality Replay Summary

- experiment: `exp-20260420-005`
- mode: `live`
- runs: `10`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `71.9%`
- false_archive_rate: `59.1%`
- topic_merge_accuracy: `61.9%`
- new_topic_precision: `0.0%`
- cluster_pairwise_f1: `81.0%`
- persist_semantic_correctness: `50.0%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (59.1% <= 0.05)
- destination_accuracy: FAIL (71.9% >= 0.85)
- topic_merge_accuracy: FAIL (61.9% >= 0.80)

## Top Failures

- dev_topic_overlap_python_vs_eval_001: score=0.432
  Wrong existing-topic merge on 7/7 source assignments.
- dev_meeting_chat_actionables_release_sync_001: score=0.433
  False archive count: 6
- dev_link_led_context_sparse_eval_links_001: score=0.444
  False archive count: 4
- dev_duplicate_near_duplicate_retention_001: score=0.567
  Wrong existing-topic merge on 6/6 source assignments.
- dev_low_value_noise_misc_001: score=0.574
  False archive count: 1
