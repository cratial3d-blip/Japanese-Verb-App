```markdown
# SRS_SPEC.md
## Spaced Repetition System (SRS) Plan — Japanese Verb Conjugation App (N5)

This document defines the SRS behavior for the app. It is the source of truth for scheduling logic, promotions/demotions, and in-session relearning.  
Scope: N5 conjugation mastery using typed answers graded in **hiragana only**.

---

## 1) Core Concepts

### 1.1 What is a “card” (SRS unit)?
A single SRS item (aka “card”) is defined as:

- **card = (verb_id + conjugation_id)**

Example:  
- (いく + plain_past) is different from (いく + te_form)

Reason: learners can know one conjugation of a verb but fail another. Scheduling must be per-conjugation.

### 1.2 Key principles implemented
- **Active recall**: user must type the answer (no multiple choice).
- **Immediate feedback**: show correct answer on miss.
- **Early reinforcement**: new items get multiple day-0 reps within the same session.
- **Expanding intervals**: successful recalls push the next review further out.
- **Adaptive scheduling**: hint use and failures shorten scheduling.
- **Finite scope**: items can be “retired” after reaching the final stage.

---

## 2) SRS Stages and Default Intervals

### 2.1 Stage labels (UI-friendly)
Stages are optional for UI, but required for logic:

- **Learning**: L0–L2 (in-session steps)
- **Apprentice**: S1–S3
- **Guru**: S4–S5
- **Mastered**: S6
- **Retired**: no longer scheduled (unless Maintenance Mode is enabled)

### 2.2 Interval schedule (days)
After Learning steps, cards move through these spaced intervals:

- **S1**: 1 day
- **S2**: 3 days
- **S3**: 7 days
- **S4**: 14 days
- **S5**: 30 days
- **S6**: 60 days
- **Retired**: no due date by default

### 2.3 Maintenance Mode (optional)
If enabled, retired cards can be reintroduced on a long interval:

- **Maintenance interval**: 90–120 days (configurable later)
Default: Maintenance Mode OFF.

---

## 3) Session-Level Learning Steps (Day 0)

### 3.1 Purpose
Replicate “immediate reviews” without requiring timers or background scheduling.  
All Learning steps happen within the same study session.

### 3.2 Learning steps
When a new card is introduced, it follows:

- **L0**: ask immediately (first exposure test)
- **L1**: re-ask after a short delay (after ~5–10 other prompts)
- **L2**: re-ask later in the same session (after ~15–25 other prompts, or near session end)

Implementation detail:
- L1/L2 should be scheduled using a “requeue later” mechanism, not real time delays.
- If there are not enough other prompts, L1/L2 still must occur before session completion.

### 3.3 Graduation from Learning
A card graduates from Learning only after passing L0, L1, and L2 according to grading rules below.

On graduation:
- schedule the next review at **S1 (tomorrow)**.

---

## 4) Grading Outcomes and Scheduling Rules

Grading is based on:
- correct/incorrect comparison after normalization
- whether a hint was used (or multiple attempts)
- (optional later) time-to-answer

### 4.1 Outcome: Correct, no hint used
Action:
- **Promote** to next step/stage
- Set due date based on stage interval:
  - Learning: move to next Learning step
  - Spaced (S1–S6): move to the next S-stage interval
  - S6 correct: move to **Retired** (unless Maintenance Mode ON)

### 4.2 Outcome: Correct, but hint used (or multiple attempts)
Treat as “Hard”. MVP rule (simple + consistent):

- **Do NOT promote**
- Reschedule sooner:
  - If in Learning: keep the same Learning step and requeue later in-session
  - If in Spaced stages: keep the same S-stage and set due date to:
    - **max(1 day, floor(current_interval_days * 0.5))**

Example:
- At S3 (7 days), hint-used correct => stay at S3, due in 3 days.
- At S1 (1 day), hint-used correct => stay at S1, due in 1 day.

### 4.3 Outcome: Incorrect
Incorrect means the normalized answer does not match expected hiragana.

Actions:
1. Immediately show:
   - correct answer (hiragana)
   - one-line rule reminder (optional UI)
2. Put the card into **relearn** in the same session:
   - enqueue for a short-delay re-ask (same as L1 behavior)
3. After the session, schedule a follow-up at:
   - **S1 (1 day)**

MVP simplification:
- Wrong always drops to Learning and next-day review, regardless of previous stage.

Optional later improvement:
- If a card was at a high stage (S5/S6) and misses once, drop to S3 instead of full reset.

---

## 5) Re-asking Missed Cards Within Session

### 5.1 Requirement
If a user misses a card, they must see it again later in the same session at least once.

### 5.2 Recommended behavior
- On wrong:
  - enqueue card to appear again after ~5–10 other prompts
- If wrong again:
  - enqueue again, but avoid immediate repeats (keep it effortful)

---

## 6) Leech / Weakness Handling

### 6.1 Definition (MVP)
A **leech** is a card that is repeatedly missed.

Suggested thresholds (pick one, MVP):
- **3 wrongs within last 14 days**, OR
- **4 total wrongs lifetime**

### 6.2 Behavior
When a card becomes a leech:
- mark card as `is_leech = true`
- prioritize it in **Weakness Mode**
- optionally show stronger hints in review UI (verb type, stem)

Weakness Mode should pull from:
- highest failure rate cards
- leeches first
- recently missed cards

---

## 7) Data Model Requirements (Scheduling Fields)

Each card (verb_id + conjugation_id) should store at minimum:

- `card_id` (stable deterministic id)
- `verb_id`
- `conjugation_id`
- `stage` enum: `LEARNING`, `S1`, `S2`, `S3`, `S4`, `S5`, `S6`, `RETIRED`
- `learning_step` enum or int (0,1,2) if stage == LEARNING
- `due_at` timestamp/date (null if RETIRED and Maintenance Mode off)
- `last_reviewed_at`
- `success_streak` (optional)
- `failure_count_total`
- `failure_count_recent` (optional)
- `hint_used_last` boolean (optional)
- `is_leech` boolean

---

## 8) Queue Composition Rules

When generating a session queue:

1. **Due reviews first** (cards with due_at <= now)
2. **Relearn queue** (missed cards that must be re-asked today)
3. **New items** (if user enabled new lessons)
4. **Learning step scheduling**
   - ensure L1 and L2 items are interleaved among other cards
   - ensure L2 happens before session end

Avoid:
- showing the same card back-to-back (unless session is very small)

---

## 9) “Retired” Behavior

Default:
- After a correct review at S6, card becomes **Retired** and stops appearing.

Optional:
- Maintenance Mode can periodically sample retired cards.
- Weakness Mode can still surface retired cards if the user manually selects them.

---

## 10) Summary of the Default Path (No Hints, No Errors)

New card in a lesson:
- L0 (now) → L1 (later) → L2 (later) → S1 (1d) → S2 (3d) → S3 (7d) → S4 (14d) → S5 (30d) → S6 (60d) → Retired

---

## 11) Notes for Implementation
- The system must be deterministic and testable.
- Avoid complex prediction models for MVP; use the fixed intervals + hint/fail adjustments above.
- All scheduling should be based on date/time in local device timezone.
- Provide export/import of card scheduling data for backup.

End of spec.
```
