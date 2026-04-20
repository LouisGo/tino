# AI Quality Replay Summary

- experiment: `exp-20260420-002`
- mode: `mock`
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

## Top Failures

- dev_topic_overlap_python_vs_eval_001: score=0.421
  Wrong existing-topic merge on 5/7 source assignments.
- dev_bilingual_mixed_eval_001: score=0.442
  Wrong existing-topic merge on 5/7 source assignments.
- dev_low_value_noise_misc_001: score=0.447
  False archive count: 2
- dev_task_switching_copy_and_terminal_001: score=0.475
  False archive count: 4
  Wrong existing-topic merge on 2/4 source assignments.
- dev_focused_research_markitdown_001: score=0.487
  Wrong existing-topic merge on 4/6 source assignments.
