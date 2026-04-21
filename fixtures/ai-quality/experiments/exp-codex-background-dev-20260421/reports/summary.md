# AI Quality Replay Summary

- experiment: `exp-codex-background-dev-20260421`
- pipeline: `background`
- mode: `mock`
- prompt_version: `tino.background_compile.provider_prompt.v1`
- runs: `10`

## Metrics

- schema_valid_rate: `100.0%`
- source_assignment_integrity: `100.0%`
- destination_accuracy: `67.2%`
- false_archive_rate: `72.7%`
- topic_merge_accuracy: `83.3%`
- new_topic_precision: `n/a`
- cluster_pairwise_f1: `74.5%`
- persist_semantic_correctness: `62.5%`

## Gates

- schema_valid_rate: PASS (100.0% >= 0.98)
- source_assignment_integrity: PASS (100.0% = 1.00)
- false_archive_rate: FAIL (72.7% <= 0.05)
- destination_accuracy: FAIL (67.2% >= 0.85)
- topic_merge_accuracy: PASS (83.3% >= 0.80)

## Compare To exp-codex-legacy-dev-20260421

- compared_runs: `10`
- improved_fixtures: `7`
- regressed_fixtures: `2`
- unchanged_fixtures: `1`
- missing_in_baseline: `none`

### Metric Delta

- schema_valid_rate: `100.0% -> 100.0% (+0.0 pts)`
- source_assignment_integrity: `100.0% -> 100.0% (+0.0 pts)`
- destination_accuracy: `51.6% -> 67.2% (+15.6 pts)`
- false_archive_rate: `40.9% -> 72.7% (+31.8 pts)`
- topic_merge_accuracy: `33.3% -> 83.3% (+50.0 pts)`
- new_topic_precision: `n/a -> n/a (n/a)`
- cluster_pairwise_f1: `57.8% -> 74.5% (+16.7 pts)`
- persist_semantic_correctness: `35.9% -> 62.5% (+26.6 pts)`

### Biggest Improvements

#### dev_writing_planning_quality_pipeline_001 (+0.291)
- scenario: writing and planning notes
- expected: archive the whole batch to existing topic `prompt-eval-experimentation`
- before: archive 4 captures to existing topic `python-analysis-sidecar` ("先把 routing、clustering、topic merge 跑稳，再谈 prose polish。"); archive 2 captures to existing topic `prompt-eval-experimentation` ("AI Quality Pipeline v0.1")
- after: archive the whole batch to existing topic `prompt-eval-experimentation` ("AI Quality Pipeline v0.1")
- why it matters: The batch should reward structural quality concerns over writing polish.

#### dev_duplicate_near_duplicate_retention_001 (+0.291)
- scenario: near-duplicate durable knowledge notes
- expected: archive the whole batch to existing topic `personal-knowledge-ops`
- before: archive 4 captures to existing topic `rust-background-compiler` ("Retention data is a durable user asset, not disposable ..."); archive 2 captures to existing topic `personal-knowledge-ops` ("Clipboard history should retain 90 days and survive upg...")
- after: archive the whole batch to existing topic `personal-knowledge-ops` ("Clipboard history should retain 90 days and survive upgrad…")
- why it matters: The scorer should reward grouping all near-duplicates into one durable knowledge cluster.

#### dev_focused_research_markitdown_001 (+0.258)
- scenario: focused research notes
- expected: archive the whole batch to existing topic `document-markdown-normalization`
- before: send 4 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `document-markdown-normalization` ("MarkItDown solves file-to-Markdown conversion more than...")
- after: archive 5 captures to existing topic `document-markdown-normalization` ("MarkItDown solves file-to-Markdown conversion more than cl…"); send 1 captures to inbox ("Reference links pending calmer compilation")
- why it matters: The correct durable output is a merge into document-markdown-normalization, not a generic AI quality topic.

#### dev_coding_debugging_pasteback_001 (+0.258)
- scenario: coding and debugging snippets
- expected: archive the whole batch to existing topic `tauri-macos-permissions`
- before: send 4 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `tauri-macos-permissions` ("paste_back failed: Accessibility permission not granted...")
- after: archive 5 captures to existing topic `tauri-macos-permissions` ("paste_back failed: Accessibility permission not granted fo…"); send 1 captures to inbox ("Reference links pending calmer compilation")
- why it matters: The durable knowledge is about signing and Accessibility trust, not the one-off command text.

#### dev_bilingual_mixed_eval_001 (+0.237)
- scenario: bilingual mixed-language clipboard batch
- expected: split into archive 6 captures to existing topic `prompt-eval-experimentation`; archive 1 captures to existing topic `python-analysis-sidecar`
- before: send 5 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `prompt-eval-experimentation` ("先把 mock batch 和 golden 固定，再谈 prompt polish。")
- after: archive 6 captures to existing topic `prompt-eval-experimentation` ("先把 mock batch 和 golden 固定，再谈 prompt polish。没有固定基准时，所谓模型变好了…"); send 1 captures to inbox ("Reference links pending calmer compilation")
- why it matters: The system should not confuse bilingual wording with topic ambiguity.

### Regressions

#### dev_meeting_chat_actionables_release_sync_001 (-0.142)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- before: send 4 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `weekly-product-ops` ("Friday demo needs one visible flow: queue -> batch -> t...")
- after: archive 5 captures to existing topic `weekly-product-ops` ("Friday demo needs one visible flow: queue -> batch -> topi…"); send 1 captures to inbox ("Reference links pending calmer compilation")
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_low_value_noise_misc_001 (-0.077)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- before: send 5 captures to inbox ("Provider access references need manual confirmation"); archive 2 captures to existing topic `personal-knowledge-ops` ("482911")
- after: archive 6 captures to existing topic `personal-knowledge-ops` ("482911"); send 1 captures to inbox ("Reference links pending calmer compilation")
- why it matters: The useful note still lacks enough context for direct topic archival.

## Current Problem Cases

#### dev_low_value_noise_misc_001 (score=0.369)
- scenario: low-value mixed clipboard noise
- expected: split into discard 6 captures; send 1 captures to inbox
- actual: archive 6 captures to existing topic `personal-knowledge-ops` ("482911"); send 1 captures to inbox ("Reference links pending calmer compilation")
- failures: False archive count: 6
- why it matters: The useful note still lacks enough context for direct topic archival.

#### dev_meeting_chat_actionables_release_sync_001 (score=0.444)
- scenario: meeting and demo actionables
- expected: send the whole batch to inbox
- actual: archive 5 captures to existing topic `weekly-product-ops` ("Friday demo needs one visible flow: queue -> batch -> topi…"); send 1 captures to inbox ("Reference links pending calmer compilation")
- failures: False archive count: 5
- why it matters: Correct routing is inbox because these are actionables with owners and immediate deadlines.

#### dev_topic_overlap_python_vs_eval_001 (score=0.604)
- scenario: overlapping Python-analysis and eval-system notes
- expected: split into archive 5 captures to existing topic `python-analysis-sidecar`; archive 2 captures to existing topic `prompt-eval-experimentation`
- actual: archive 6 captures to existing topic `python-analysis-sidecar` ("Use Python notebooks to cluster failure cases after each e…"); send 1 captures to inbox ("Reference links pending calmer compilation")
- failures: Wrong existing-topic merge on 3/7 source assignments.
- why it matters: Correct clustering requires separating Python-side artifact analysis from runner and metric ownership.

#### dev_task_switching_copy_and_terminal_001 (score=0.622)
- scenario: task-switching operational notes
- expected: split into archive 4 captures to existing topic `product-writing-playbook`; send 3 captures to inbox; discard 1 captures
- actual: archive the whole batch to existing topic `product-writing-playbook` ("The clipboard should feel like a quiet inbox, not a dashbo…")
- failures: False archive count: 4
- why it matters: The correct result requires one durable copywriting cluster, one inbox cluster, and one discard.

#### dev_link_led_context_sparse_eval_links_001 (score=0.664)
- scenario: link-heavy sparse research batch
- expected: send the whole batch to inbox
- actual: send 4 captures to inbox ("Reference links pending calmer compilation"); archive 1 captures to existing topic `prompt-eval-experimentation` ("maybe useful later for scorecards")
- failures: False archive count: 1
- why it matters: Correct behavior is cautious inbox routing rather than optimistic archival.
