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
- Verify the latest deployed GitHub Pages build after UI and learning-path updates.
- Continue collecting expert-feedback data for pacing/unlock tuning.

## Current Repo State (Important)
- Latest pushed commit on `main`: `e869fc8` (`Implement learning-path updates and lesson/review UI refinements`).
- Includes learning-path remediation, header lesson-jump improvements, home widget parity, and review-card label simplification.
- Current local working tree:
  - only untracked `temp/*` research/reference files remain
  - no tracked-file changes pending after push

## Completed Work Snapshot
- Lessons in-session navigation UI moved from lesson card body to header pill interaction:
  - removed large in-card previous/jump controls in lesson phase
  - made `Lesson X of Y` header pill interactive when prior lessons are available
  - tapping/clicking the pill opens header dropdown with previously viewed lessons
  - selecting an entry jumps back to that lesson card for reread
  - files: `src/app.js`, `src/styles.css`
- Implemented phased learning-path remediation checklist from expert feedback:
  - checklist artifact: `temp/Learning_Path_Phased_Implementation_Checklist.md`
  - **Phase 1 (logic):**
    - guided stage-band gates (`gate_bands`) with per-band thresholds
    - unlock min-days floor + stall stabilization/relaxation support
    - reason-aware gate-fail boost inputs in lesson composition
    - stage-1 polite internal subphase (`polite_dictionary`/`polite_negative` first, then full stage)
    - narrow-stage prior-mix floor after day 2
    - irregular policy support with guaranteed quota + `する`/`くる` priority + `いく` cadence
    - class-aware current-stage sampling and class-biased reinforcement sampling
  - **Phase 2 (telemetry):**
    - wired lesson delivery session logging with served-card details (`verb_id`, `template_id`, `verb_class`, source bucket)
    - kept per-day template/class attempt+correct aggregation
    - kept stage history event persistence and gate snapshots
  - **Phase 3 (UI):**
    - progress card and roadmap now show `Started` and `Stable` counts
    - current stage progress bar now reflects started-progress
    - unlock target text now resolves against active stage gate profile (including min-days)
- Updated learning-path configs and schema for new behavior fields:
  - `data/learning_paths/learning_path.guided.v1.json`
  - `data/learning_paths/learning_path.genki_aligned.v1.json`
  - `schemas/learning_path.schema.json`
- Updated lesson engine tests to cover new pacing/queue rules:
  - min-days gate
  - stall stabilization trigger
  - stricter late-band gate checks
  - stage-1 subphase behavior
  - irregular quota + `いく` cadence path-state patching
- Created expert-facing behavior report for pacing/unlock analysis request:
  - `temp/Learning_Expert_App_Behavior_Report.md`
  - covers unlock logic, lesson generator behavior, SRS intervals, stage definitions, mode differences, irregular handling, telemetry availability/gaps, and current defaults
- Implemented all Group 1 engineering fixes from `temp/1_Week_Analysis.txt`:
  - lesson quiz no longer passes incorrect responses
  - incorrect lesson input remains visible for compare-against-correct feedback
  - drill mode now tracks attempts/first-try accuracy and shows completion summary
  - lessons header now shows `New Left` and separate `Daily Cap` (no misleading constant 10)
  - lesson phase now supports `Previous` + jump selector for rereading viewed lesson cards
  - lesson empty/completion/header messaging now explains rolling unlock vs fixed-time unlock
  - persistence hardening added with auto local snapshots + restore-on-primary-failure behavior
- Added storage and scheduling helpers in core:
  - `buildUnlockContext`
  - `getRequeueInsertIndex`
  - `getLessonPracticeOutcome`
  - `recoverStoredJson`
- Added automated coverage for new logic in `scripts/run_tests.js`:
  - lesson practice outcome tests
  - unlock context tests
  - storage recovery tests
- Added settings snapshot status UI:
  - `index.html` includes `#settings-snapshot-status`
  - `src/app.js` renders latest snapshot timestamp and backup-recovery note
- Processed 1-week real-device QA notes from `temp/1_Week_Analysis.txt` and mapped all 13 issues into:
  - Group 1: engineering bugs/logic fixes (implementation-ready)
  - Group 2: learning-design topics requiring external expert guidance
- Created external-review brief for Group 2:
  - `temp/Group2_Expert_Review_Brief.md`
  - includes observed issues, current app behavior references, and explicit questions for Japanese/SRS experts
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
- No active coding task in progress.
- Remaining work is deployment verification + manual QA on target tablet/mobile flows.

## Most Recent UI Work (This Session)
- Lessons header interaction update:
  - lesson-progress pill now acts as jump control (`Lesson X of Y` -> dropdown)
  - lesson card body remains clean (no embedded previous/jump row)
- Learning Path progress panel updates:
  - split current-stage status into `Started` vs `Stable`
  - roadmap rows now show status + started/stable counts per stage
  - unlock target copy now reflects stage-specific gate profile values
- Lessons screen/header polish:
  - non-session lessons header now reports `New Left` + `Daily Cap`
  - no-lessons and post-lesson messages now show explicit rolling/fixed unlock schedule context
- Lesson phase UX:
  - added `Previous` button and jump selector for revisiting prior lessons in-session
- Settings screen:
  - added local snapshot status line with latest snapshot timestamp and recovery notice
- Lesson jump dropdown context labels:
  - each jump row now includes lesson number plus verb + conjugation label (not lesson number only)
  - example format: `Lesson 3` + `食べる (たべる) • Polite past`
- Home screen widget parity polish:
  - `New Lessons` card now uses the same count-first layout/styling pattern as `Reviews`
  - `Reviews Waiting` text capitalization fixed on home card label/state
- Review-card conjugation label simplification:
  - review-mode card tag now strips parenthetical kana-form hints from template labels
  - applies to daily Reviews, Drill, Weakness, and Recent Mistake quiz cards
  - lesson cards remain unchanged

## Known Notes / Risks
- Terminal output may show mojibake for some Japanese strings in some files; verify actual file encoding before changing text.
- Large uncommitted refactor increases merge risk; prefer small, focused commit batches.
- If visual changes look stale on device, force reload to bypass cached CSS/JS.

## Next-Step Priorities
1. Verify GitHub Pages deployment from commit `e869fc8` on desktop + cheap Android tablet:
   - confirm lesson header pill jump dropdown opens and shows verb/conjugation context rows
   - confirm home `New Lessons` widget matches `Reviews` widget styling
   - confirm review/drill/weakness/recent-mistake card tags hide parenthetical kana hints
2. Run focused manual QA on cheap Android tablet for new learning-path logic:
   - stage-1 polite subphase behavior (Day 1-2 vs Day 3+ template mix)
   - irregular quota (`suru`/`kuru`) and `iku` cadence behavior
   - narrow-stage prior-mix floor behavior after day 2
   - started/stable progress readability on small screens
3. Export backup JSON after several sessions and verify telemetry completeness for specialist review:
   - `lessonDeliveryLog`
   - `template_performance_by_day`
   - `class_performance_by_day`
   - `stageHistory`
4. Route updated telemetry snapshot + behavior notes to learning expert for threshold recommendations.

## Validation Commands
- `python scripts/validate_data.py`
- `npm run test`

## Last Validation Status
- `python scripts/validate_data.py`: pass (2026-02-22, final pre-push run before `e869fc8`)
- `npm run test`: pass (2026-02-22, final pre-push run before `e869fc8`)

## End-of-Session Update Checklist
1. Update `## Completed Work Snapshot` and `## Most Recent UI Work`.
2. Update `## Current Repo State` if file set changed significantly.
3. Refresh `## Next-Step Priorities` based on the latest user direction.
4. Run validation commands and update `## Last Validation Status`.

## Last Updated
- 2026-02-22


