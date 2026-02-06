# BOOTSTRAP_MVP.md

## Goal
Ship a minimal local-only MVP for Japanese verb conjugation practice with romaji->kana input, conjugation generation, basic SRS scaffolding, and a simple UI.

## Phases
- Audit + specs: confirm data files, specs, and constraints.
- Core engine: romaji/kana normalization, conjugation engine, SRS queue helpers.
- Tests: golden conjugation runner + romaji conversion tests.
- UI shell: Daily Reviews, Focused Drill, Weakness Mode screens.
- Verification: validate data + run tests; fix any failures.

## Notes
- No language data edits unless required by specs/tests.
- UI is static (no build tooling) and runs via a local web server.
