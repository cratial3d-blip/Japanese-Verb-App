# AGENTS.md — Japanese Verb Conjugation SRS App

## Project overview
This repo is a personal Japanese study app focused on **verb conjugation** with **typed answers**.
- Users type **romaji**, app converts to **hiragana**, and grading is **hiragana-only**.
- App uses **spaced repetition (SRS)** and supports targeted drills (e.g., “te-form only”).

## Source of truth (read these before changing behavior)
- docs/DATA_SPEC.md — data fields + grading rules
- docs/ROMAJI_INPUT_SPEC.md — romaji→kana conversion + normalization
- docs/CONJUGATION_SPEC.md — exact conjugation rules (godan/ichidan/irregular)
- docs/SRS_SPEC.md — SRS scheduling rules (if present)

## Repo map (important paths)
- data/verbs/verbs.v1.jsonl — verb inventory (dictionary form + gloss; versioned)
- docs/SRS_IMPLEMENTATION.md — SRS scheduling rules (intervals, lapses, grading impact)
- data/conjugations/conjugation_templates.v1.json — which forms exist in v1
- data/exceptions/verb_exceptions.v1.json — irregulars + godan-ru exceptions + special cases
- schemas/*.schema.json — JSON schemas for data files
- scripts/validate_data.py — schema + data checks
- tests/conjugation_golden_tests.v1.json — verified conjugation cases (must pass)
- tests/romaji_to_kana_tests.v1.json — input conversion cases (must pass, if present)

## Local verification commands (run these every time)
- Validate datasets (schemas + JSONL sanity):
  - `python scripts/validate_data.py`
- If an automated test runner exists later, run it too (do not skip).

## Workflow for implementing changes
1. Identify the governing spec in docs/ and follow it exactly.
2. Make the smallest change that satisfies the spec.
3. Run `python scripts/validate_data.py` and fix errors/warnings.
4. If behavior changes, update/extend the relevant golden tests in `tests/`.
5. Keep diffs tight and readable (prefer many small commits over one giant commit).

## Data rules (critical)
- Do not “invent” Japanese data. If you’re unsure, stop and ask.
- Keep versioning stable (v1 files are append-only unless fixing a known error).
- If adding verbs later, append new JSONL lines (new unique `id`s) and re-run validation.

## Gotchas (common failure points)
- **Hiragana-only grading**: normalize input (trim, ignore casing for romaji, remove spaces/punct as defined).
- **Duplicate kana** must have disambiguation (e.g., ふく=吹く vs 拭く).
- **Irregulars**: する / くる / いく must follow exceptions (いく→いって/いった).
- **Godan-ru exceptions**: some ～る verbs are godan; rely on `data/exceptions/...` list.
- Don’t add kanji-based grading or IME “reading guesses.” Keep it deterministic and spec-driven.

## Review guidelines (if you’re acting as a reviewer)
- Flag any change that contradicts docs/ specs as a high severity issue.
- Require validators + golden tests to pass for approval.
- Avoid adding new dependencies unless clearly necessary and justified.
