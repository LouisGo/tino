# AI Quality Replay Summary

- experiment: `exp-20260420-014`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v6`
- runs: `10`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `93.8%`
- false_archive_rate: `4.5%`
- topic_merge_accuracy: `95.2%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `95.0%`
- persist_semantic_correctness: `93.8%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: PASS (4.5% <= 0.05)
- destination_accuracy: PASS (93.8% >= 0.85)
- topic_merge_accuracy: PASS (95.2% >= 0.80)

## Compare To exp-20260420-005

- compared_runs: `10`
- improved_fixtures: `8`
- regressed_fixtures: `0`
- unchanged_fixtures: `2`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `71.9% -> 93.8% (+21.9 pts)`
- false_archive_rate: `59.1% -> 4.5% (-54.5 pts)`
- topic_merge_accuracy: `61.9% -> 95.2% (+33.3 pts)`
- new_topic_precision: `0.0% -> n/a (n/a)`
- cluster_pairwise_f1: `81.0% -> 95.0% (+14.0 pts)`
- persist_semantic_correctness: `50.0% -> 93.8% (+43.8 pts)`

### Biggest Improvements

#### dev_topic_overlap_python_vs_eval_001 (+0.434)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 5 captures to existing topic `python-analysis-sidecar`; archive 2 captures to existing topic `prompt-eval-experimentation`
- before: archive 6 captures to new topic `python-eval-analysis` ("Python for post-run evaluation analysis and error clustering"); send 1 captures to inbox ("Pandas DataFrame.groupby documentation link")
- after: archive 5 captures to existing topic `python-analysis-sidecar` ("Python Post-Artifact Analysis Scope"); archive 2 captures to existing topic `prompt-eval-experimentation` ("Evaluation System Ownership and Metrics")
- why it matters: Correct clustering requires separating Python-side artifact analysis from runner and metric ownership.

#### dev_meeting_chat_actionables_release_sync_001 (+0.367)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- before: archive the whole batch to existing topic `weekly-product-ops` ("Internal Demo Preparation & Owner Assignments")
- after: send the whole batch to inbox ("Demo prep: flow visibility, owner assignments, script, and recording fa...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_link_led_context_sparse_eval_links_001 (+0.356)
- scenario: link-heavy sparse research batch
- expected: send the whole batch to inbox
- before: archive 4 captures to existing topic `prompt-eval-experimentation` ("Collection of AI Evaluation Framework Documentation Links"); send 1 captures to inbox ("Vague note about potential future use for scorecards")
- after: send the whole batch to inbox ("Evaluation tool links for potential scorecard use")
- why it matters: Correct behavior is cautious inbox routing rather than optimistic archival.

#### dev_duplicate_near_duplicate_retention_001 (+0.300)
- scenario: near-duplicate durable knowledge notes
- expected: archive the whole batch to existing topic `personal-knowledge-ops`
- before: archive the whole batch to new topic `clipboard-retention-durability` ("Clipboard history as a durable asset with 90-day retention across upgra...")
- after: archive the whole batch to existing topic `personal-knowledge-ops` ("Clipboard retention as a durable user asset")
- why it matters: The scorer should reward grouping all near-duplicates into one durable knowledge cluster.

#### dev_low_value_noise_misc_001 (+0.174)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- before: discard 4 captures ("Transient Codes and File Names"); send 1 captures to inbox ("Action Reminder: Send Invoice"); send 1 captures to inbox ("Map Link to Restaurant"); archive 1 captures to existing topic `personal-knowledge-ops` ("Feature Request: Logs for Filtered/Discarded Captures")
- after: discard 6 captures ("Transient noise and personal reminders"); archive 1 captures to existing topic `personal-knowledge-ops` ("Need for filter logs to debug sensitive snippet discarding")
- why it matters: The useful note still lacks enough context for direct topic archival.

### Regressions

- none

## Current Problem Cases

#### dev_writing_planning_quality_pipeline_001 (score=0.744)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- actual: archive 5 captures to existing topic `prompt-eval-experimentation` ("AI Quality Pipeline v0.1 Planning and Principles"); send 1 captures to inbox ("Development Priority Reminder")
- failures: Wrong existing-topic merge on 1/6 source assignments.
- why it matters: The batch should reward structural quality concerns over writing polish.

#### dev_low_value_noise_misc_001 (score=0.748)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- actual: discard 6 captures ("Transient noise and personal reminders"); archive 1 captures to existing topic `personal-knowledge-ops` ("Need for filter logs to debug sensitive snippet discarding")
- failures: False archive count: 1
- why it matters: The useful note still lacks enough context for direct topic archival.

#### dev_bilingual_mixed_eval_001 (score=0.755)
- scenario: bilingual mixed-language clipboard batch
- expected: split into archive 6 captures to existing topic `prompt-eval-experimentation`; archive 1 captures to existing topic `python-analysis-sidecar`
- actual: archive 5 captures to existing topic `prompt-eval-experimentation` ("Principles for stable evaluation and regression tracking"); archive 1 captures to existing topic `python-analysis-sidecar` ("Python as analysis layer, not runtime source of truth"); send 1 captures to inbox ("LLM evaluators article link for review")
- failures: Wrong existing-topic merge on 1/7 source assignments.
- why it matters: The system should not confuse bilingual wording with topic ambiguity.

#### dev_meeting_chat_actionables_release_sync_001 (score=0.800)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: send the whole batch to inbox ("Demo prep: flow visibility, owner assignments, script, and recording fa...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_link_led_context_sparse_eval_links_001 (score=0.800)
- scenario: link-heavy sparse research batch
- expected: send the whole batch to inbox
- actual: send the whole batch to inbox ("Evaluation tool links for potential scorecard use")
- why it matters: Correct behavior is cautious inbox routing rather than optimistic archival.
