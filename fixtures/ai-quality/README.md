# AI Quality Fixtures

This directory contains the seed corpus for Tino's development-stage AI quality loop.

Current status:

- dataset status: `seed`
- current batches: `12`
- current captures: `78`
- split: `10 dev` + `2 holdout`
- source plan: `docs/03-planning/Tino AI 开发期质量管线计划 v0.1.md`

## Goals

- Simulate realistic clipboard micro-sessions instead of random text piles
- Freeze a reusable benchmark input for replay, scoring, and experiment diffs
- Keep the contract close to the current product runtime

## Directory Layout

```text
fixtures/
  ai-quality/
    README.md
    manifests/
      dataset.v0.1.json
    batches/
      dev/
      holdout/
    goldens/
      dev/
      holdout/
    topics/
      topic-index.v0.1.json
```

## Batch Fixture Contract

Each batch fixture uses `tino.ai_quality.batch_fixture.v0.1` and contains:

- `fixtureId`
- `split`
- `scenarioFamily`
- `difficulty`
- `topicIndexRef`
- `availableTopicSlugs`
- `notes`
- `batch`
- `captures`

The runner should materialize the real `AiBatchPayload` like this:

```ts
const payload = {
  batch: fixture.batch,
  captures: fixture.captures,
  availableTopics: resolveTopicEntries(fixture.availableTopicSlugs),
}
```

`batch` and `captures` intentionally mirror the existing Rust/TS runtime shapes.

## Golden Contract

Each golden file uses `tino.ai_quality.golden.v0.1` and focuses on structural correctness:

- expected clustering
- destination routing
- existing-topic vs new-topic decisions
- critical failure checks

Important rule:

- scorer matching should use `sourceIds` sets, not literal `clusterId`

The `clusterId` in golden files is an annotation-local identifier.

## Seed Corpus Notes

- The seed corpus is intentionally smaller than the v0.1 target of `60` batches.
- This first drop is large enough to start replay runner, scorer, and experiment registry work.
- New fixtures should preserve the same contract and only extend the manifest.
