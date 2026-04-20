# AI Quality Replay Summary

- experiment: `exp-20260420-010`
- mode: `live`
- prompt_version: `tino.batch_review.engine.v3`
- runs: `10`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `82.8%`
- false_archive_rate: `4.5%`
- topic_merge_accuracy: `73.8%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `92.1%`
- persist_semantic_correctness: `78.1%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: PASS (4.5% <= 0.05)
- destination_accuracy: FAIL (82.8% >= 0.85)
- topic_merge_accuracy: FAIL (73.8% >= 0.80)

## Compare To exp-20260420-005

- compared_runs: `10`
- improved_fixtures: `5`
- regressed_fixtures: `3`
- unchanged_fixtures: `2`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `71.9% -> 82.8% (+10.9 pts)`
- false_archive_rate: `59.1% -> 4.5% (-54.5 pts)`
- topic_merge_accuracy: `61.9% -> 73.8% (+11.9 pts)`
- new_topic_precision: `0.0% -> n/a (n/a)`
- cluster_pairwise_f1: `81.0% -> 92.1% (+11.1 pts)`
- persist_semantic_correctness: `50.0% -> 78.1% (+28.1 pts)`

### Biggest Improvements

#### dev_topic_overlap_python_vs_eval_001 (+0.434)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 5 captures to existing topic `python-analysis-sidecar`; archive 2 captures to existing topic `prompt-eval-experimentation`
- before: archive 6 captures to new topic `python-eval-analysis` ("Python for post-run evaluation analysis and error clustering"); send 1 captures to inbox ("Pandas DataFrame.groupby documentation link")
- after: archive 5 captures to existing topic `python-analysis-sidecar` ("Python analysis sidecar responsibilities and execution pattern"); archive 2 captures to existing topic `prompt-eval-experimentation` ("Evaluation system ownership and regression reporting requirements")
- why it matters: Correct clustering requires separating Python-side artifact analysis from runner and metric ownership.

#### dev_meeting_chat_actionables_release_sync_001 (+0.367)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- before: archive the whole batch to existing topic `weekly-product-ops` ("Internal Demo Preparation & Owner Assignments")
- after: send the whole batch to inbox ("Friday demo prep: flow visibility, owner assignments, script, and fallb...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_link_led_context_sparse_eval_links_001 (+0.356)
- scenario: link-heavy sparse research batch
- expected: send the whole batch to inbox
- before: archive 4 captures to existing topic `prompt-eval-experimentation` ("Collection of AI Evaluation Framework Documentation Links"); send 1 captures to inbox ("Vague note about potential future use for scorecards")
- after: send the whole batch to inbox ("Evaluation tool links collection")
- why it matters: Correct behavior is cautious inbox routing rather than optimistic archival.

#### dev_duplicate_near_duplicate_retention_001 (+0.300)
- scenario: near-duplicate durable knowledge notes
- expected: archive the whole batch to existing topic `personal-knowledge-ops`
- before: archive the whole batch to new topic `clipboard-retention-durability` ("Clipboard history as a durable asset with 90-day retention across upgra...")
- after: archive the whole batch to existing topic `personal-knowledge-ops` ("Clipboard retention as a durable user asset")
- why it matters: The scorer should reward grouping all near-duplicates into one durable knowledge cluster.

#### dev_low_value_noise_misc_001 (+0.090)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- before: discard 4 captures ("Transient Codes and File Names"); send 1 captures to inbox ("Action Reminder: Send Invoice"); send 1 captures to inbox ("Map Link to Restaurant"); archive 1 captures to existing topic `personal-knowledge-ops` ("Feature Request: Logs for Filtered/Discarded Captures")
- after: discard 5 captures ("Transient clipboard scraps"); send 1 captures to inbox ("Reminder to send invoice"); archive 1 captures to existing topic `personal-knowledge-ops` ("Need filter logs for discarded sensitive snippets")
- why it matters: The useful note still lacks enough context for direct topic archival.

### Regressions

#### dev_writing_planning_quality_pipeline_001 (-0.226)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- before: archive 4 captures to existing topic `prompt-eval-experimentation` ("AI Quality Pipeline Development: Fixtures, Goldens, and Metrics"); archive 1 captures to existing topic `personal-knowledge-ops` ("Development Priority: Structural Decision Correctness Over Prose Polish"); archive 1 captures to existing topic `python-analysis-sidecar` ("Python Sidecar Usage After Contract Freeze")
- after: send the whole batch to inbox ("AI Quality Pipeline v0.1 Planning Notes")
- why it matters: The batch should reward structural quality concerns over writing polish.

#### dev_task_switching_copy_and_terminal_001 (-0.126)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- before: archive 4 captures to existing topic `product-writing-playbook` ("Product copy and tone principles for capture and synthesis"); archive 2 captures to existing topic `rust-background-compiler` ("Rust/Tauri build and compilation error"); send 2 captures to inbox ("Miscellaneous personal and workflow reminders")
- after: archive 3 captures to existing topic `personal-knowledge-ops` ("Clipboard and capture philosophy"); send 2 captures to inbox ("Rust build check and compile error"); send 2 captures to inbox ("Personal reminders: adapter purchase and screenshot task"); archive 1 captures to existing topic `product-writing-playbook` ("Homepage tone guidance")
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.

#### dev_bilingual_mixed_eval_001 (-0.062)
- scenario: bilingual mixed-language clipboard batch
- expected: split into archive 6 captures to existing topic `prompt-eval-experimentation`; archive 1 captures to existing topic `python-analysis-sidecar`
- before: archive 4 captures to existing topic `prompt-eval-experimentation` ("Principles for Prompt Evaluation and Regression Discipline"); archive 1 captures to existing topic `python-analysis-sidecar` ("Python's Role as Analysis Layer"); send 1 captures to inbox ("External Link on LLM Evaluators"); archive 1 captures to existing topic `prompt-eval-experimentation` ("Target Quality Metrics for Eval System")
- after: archive 4 captures to existing topic `prompt-eval-experimentation` ("Core principles for stable evaluation and regression detection"); archive 1 captures to existing topic `python-analysis-sidecar` ("Python as analysis layer, not runtime source of truth"); send 1 captures to inbox ("LLM evaluators article link for review"); send 1 captures to inbox ("Schema and assignment integrity metric targets")
- why it matters: The system should not confuse bilingual wording with topic ambiguity.

## Current Problem Cases

#### dev_writing_planning_quality_pipeline_001 (score=0.433)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- actual: send the whole batch to inbox ("AI Quality Pipeline v0.1 Planning Notes")
- failures: Wrong existing-topic merge on 6/6 source assignments.
- why it matters: The batch should reward structural quality concerns over writing polish.

#### dev_bilingual_mixed_eval_001 (score=0.636)
- scenario: bilingual mixed-language clipboard batch
- expected: split into archive 6 captures to existing topic `prompt-eval-experimentation`; archive 1 captures to existing topic `python-analysis-sidecar`
- actual: archive 4 captures to existing topic `prompt-eval-experimentation` ("Core principles for stable evaluation and regression detection"); archive 1 captures to existing topic `python-analysis-sidecar` ("Python as analysis layer, not runtime source of truth"); send 1 captures to inbox ("LLM evaluators article link for review"); send 1 captures to inbox ("Schema and assignment integrity metric targets")
- failures: Wrong existing-topic merge on 2/7 source assignments.
- why it matters: The system should not confuse bilingual wording with topic ambiguity.

#### dev_low_value_noise_misc_001 (score=0.664)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- actual: discard 5 captures ("Transient clipboard scraps"); send 1 captures to inbox ("Reminder to send invoice"); archive 1 captures to existing topic `personal-knowledge-ops` ("Need filter logs for discarded sensitive snippets")
- failures: False archive count: 1
- why it matters: The useful note still lacks enough context for direct topic archival.

#### dev_task_switching_copy_and_terminal_001 (score=0.676)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- actual: archive 3 captures to existing topic `personal-knowledge-ops` ("Clipboard and capture philosophy"); send 2 captures to inbox ("Rust build check and compile error"); send 2 captures to inbox ("Personal reminders: adapter purchase and screenshot task"); archive 1 captures to existing topic `product-writing-playbook` ("Homepage tone guidance")
- failures: Wrong existing-topic merge on 3/4 source assignments.
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.

#### dev_meeting_chat_actionables_release_sync_001 (score=0.800)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: send the whole batch to inbox ("Friday demo prep: flow visibility, owner assignments, script, and fallb...")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.
