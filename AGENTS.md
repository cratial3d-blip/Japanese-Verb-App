# AGENTS.md - Japanese Verb Conjugation SRS App

## Project Overview
This repo is a Japanese study app focused on typed verb conjugation practice.
- Input: users type romaji; app normalizes and grades in hiragana.
- Core loops: lessons, reviews, drills, weakness-focused practice.
- Scheduling: SRS-based card progression.

## Session Handoff (Required)
- At the start of every session, read `docs/SESSION_HANDOFF.md`.
- At the end of every session, update `docs/SESSION_HANDOFF.md` with:
  - latest completed work
  - current in-progress work
  - next priorities/blockers
  - latest validation results

## Source Of Truth (Read Before Behavior Changes)
- `docs/DATA_SPEC.md`
- `docs/ROMAJI_INPUT_SPEC.md`
- `docs/CONJUGATION_SPEC.md`
- `docs/SRS_IMPLEMENTATION.md`

## Repo Map (Important Paths)
- Verbs: `data/verbs/verbs.v2.jsonl`
- Conjugation templates: `data/conjugations/conjugation_templates.v3.json`
- Exceptions: `data/exceptions/verb_exceptions.v1.json`
- Learning paths:
  - `data/learning_paths/learning_path.guided.v1.json`
  - `data/learning_paths/learning_path.genki_aligned.v1.json`
- Example sentences: `data/ui_text/example_sentences.v4.json`
- Schemas: `schemas/*.schema.json`
- Data validator: `scripts/validate_data.py`
- Test runner: `scripts/run_tests.js`
- Core logic:
  - `src/core/index.js`
  - `src/core/lesson_engine.js`
- App shell/UI logic: `src/app.js`

## Required Validation Every Session
1. `python scripts/validate_data.py`
2. `npm run test`

Do not skip either command when behavior or data changes.

## Workflow Expectations
1. Identify governing spec(s) first.
2. Make the smallest correct change.
3. Update tests when behavior changes.
4. Keep diffs tight and reviewable.
5. If learning-path config changes, keep schema + tests in sync.

## Data Rules (Critical)
- Do not invent Japanese content.
- Use dataset-driven behavior where specified.
- Keep grading deterministic and hiragana-based.
- Keep versioned data stable unless intentionally version-bumping.

## High-Risk Gotchas
- Hiragana-only grading and normalization must remain spec-compliant.
- Irregular handling must stay correct (`suru`, `kuru`, `iku` special cases).
- Godan-ru exceptions must come from exceptions data, not guesswork.
- Do not add kanji-based grading or reading inference logic.

## Review Guidelines
- Treat spec violations as high-severity.
- Require validator + tests to pass before signoff.
- Avoid new dependencies unless clearly justified.
