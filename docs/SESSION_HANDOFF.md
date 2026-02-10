# Session Handoff

Use this file at the start of every coding session.

## Start-of-Session Checklist
1. Read this file fully.
2. Read `AGENTS.md` and required specs before behavior changes:
   - `docs/DATA_SPEC.md`
   - `docs/ROMAJI_INPUT_SPEC.md`
   - `docs/CONJUGATION_SPEC.md`
   - `docs/SRS_IMPLEMENTATION.md`
3. Run `git status --short` and review in-progress local changes before editing.
4. Confirm current priorities in `## Current Focus`.

## Current Focus
- Stabilize and polish the new learning-path architecture (Guided / Genki / Custom).
- Finalize UI consistency and mobile behavior after the recent Progress page redesign.
- Prepare the next release commit(s) from the current large working-tree diff.

## Current Repo State (Important)
- The working tree is intentionally dirty with a large cross-cutting refactor.
- Core modified files include:
  - `src/app.js`
  - `src/core/index.js`
  - `src/core/lesson_engine.js` (new)
  - `index.html`
  - `src/styles.css`
  - `schemas/conjugation_templates.schema.json`
  - `schemas/learning_path.schema.json` (new)
  - `scripts/validate_data.py`
  - `scripts/run_tests.js`
- New data artifacts include:
  - `data/conjugations/conjugation_templates.v3.json`
  - `data/ui_text/rule_hints.v3.json`
  - `data/ui_text/example_sentences.v4.json`
  - `data/learning_paths/learning_path.guided.v1.json`
  - `data/learning_paths/learning_path.genki_aligned.v1.json`
- Do not discard local changes unless explicitly requested by the user.

## Completed Work Snapshot
- Implemented learning-path model and flow:
  - `learning_path`: `guided | textbook_genki | custom`
  - path-aware onboarding/settings wiring
  - path state/progression support and curriculum data loading
- Added dedicated lesson queue engine:
  - `src/core/lesson_engine.js`
  - path-window composition and weakness mixing logic moved out of UI rendering
- Added/expanded conjugation coverage and tests:
  - v3 template metadata + new form handling in core logic
  - expanded golden tests (`tests/conjugation_golden_tests.v2.json`)
  - alias handling tests and lesson engine tests in `scripts/run_tests.js`
- Added new Progress widgets:
  - Learning Path Summary
  - Path Roadmap (with mobile-friendly collapse behavior)
- Progress page visual polish completed:
  - consistent icon-led card headers across all stats cards
  - cohesive sage/orange palette alignment
  - `Next Unlock` callout now uses orange accent styling
- Lessons header pill copy bug fixed:
  - removed duplicated prefix text (`Focus Focus: ...` -> `Focus ...`)
  - change in `src/app.js` lesson mode pill value builder
- Drill/Weakness session usability fix:
  - removed in-session abandon button approach
  - added in-app leave-confirm modal (`Are you sure you want to quit?`) when navigating away from active Drill/Weakness sessions
  - on confirm, session resets and user is moved to the requested tab
- Last 24h mistake practice flow updated:
  - same in-app leave-confirm modal behavior now applies when navigating away from an active mistake quiz on Progress
- Answer feedback animation refresh implemented (animation-only change):
  - added quick card flash pulse (success/error), incorrect input shake, and icon pop-in
  - added transient Check-button state animation using existing success/danger palette
  - preserved existing feedback text/details/info-toggle behavior and review-card content structure

## Current In-Progress Work
- No active coding task in progress after the latest bug fixes.
- Next likely pass: mobile UX QA for leave-confirm flow, answer animations, and progress/header interactions.

## Most Recent UI Work (This Session)
- Fixed lesson header meta pill duplication so focus labels render once.
- Replaced abandon button and browser/system confirm with an in-app styled confirmation modal for active Drill/Weakness sessions.
- Added the same in-app confirmation modal behavior for active Last 24h mistake quiz sessions in Progress.
- Updated correct/incorrect feedback animations to match mockup behavior while keeping existing app copy/details and interaction logic.

## Known Notes / Risks
- Terminal output may show mojibake for some Japanese strings in some files; verify actual file encoding before changing text.
- Large uncommitted refactor increases merge risk; prefer small, focused commit batches.
- If visual changes look stale on device, force reload to bypass cached CSS/JS.

## Next-Step Priorities
1. Do a focused QA pass on mobile/tablet for Progress page and header/footer interactions.
2. Verify Drill/Weakness/Last24h mistake leave-confirm flow on mobile and desktop (including return-to-tab behavior).
3. QA correct/incorrect animation behavior on mobile/tablet (input shake, card flash pulse, button state transition, info toggle behavior).
4. Review and clean up any remaining inconsistent copy/labels tied to old terminology (for example legacy "study level" wording).
5. Split and commit changes in logical batches:
   - core/path/data
   - UI polish
   - tests/validation updates
6. Continue roadmap feature work:
   - richer conjugation reference page (planned after stabilization)
   - deeper stage breakdown on Progress screen (future enhancement)

## Validation Commands
- `python scripts/validate_data.py`
- `npm run test`

## Last Validation Status
- `python scripts/validate_data.py`: pass (2026-02-10)
- `npm run test`: pass (2026-02-10)

## End-of-Session Update Checklist
1. Update `## Completed Work Snapshot` and `## Most Recent UI Work`.
2. Update `## Current Repo State` if file set changed significantly.
3. Refresh `## Next-Step Priorities` based on the latest user direction.
4. Run validation commands and update `## Last Validation Status`.

## Last Updated
- 2026-02-10
