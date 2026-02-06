# Conjugation Spec (v2)

This document defines the exact conjugation rules the app must implement for verb drills and SRS reviews.

Scope for v2:
- Verb dataset: `data/verbs/verbs.v2.jsonl`
- Templates: `data/conjugations/conjugation_templates.v2.json`
- Exceptions: `data/exceptions/verb_exceptions.v1.json`
- Output and grading are hiragana-only (see `docs/DATA_SPEC.md` and `docs/ROMAJI_INPUT_SPEC.md`).

The app should generate the expected answer by:
1) Selecting a verb record (by `id`) from `verbs.v2.jsonl`
2) Selecting a conjugation template (by `template_id`)
3) Producing a single canonical hiragana string for the expected answer
4) Applying overrides from `verb_exceptions.v1.json` (special cases)

---

## Supported templates (v2)

These are the template IDs and their meaning.

Plain (casual):
- `plain_dictionary`: dictionary form (辞書形)
- `plain_negative`: plain negative (ない-form)
- `plain_past`: plain past (た-form)
- `plain_past_negative`: plain past negative (なかった-form)
- `plain_te_form`: te-form (て/で form)

Polite:
- `polite_dictionary`: polite present affirmative (ます-form)
- `polite_negative`: polite present negative (ません-form)
- `polite_past`: polite past (ました-form)
- `polite_past_negative`: polite past negative (ませんでした-form)
- `polite_te_form`: polite request pattern, te-form + ください


Additional templates (v2):
- `plain_te_iru`: progressive/state (???)
- `polite_te_imasu`: progressive/state polite (????)
- `polite_te_imasen`: progressive/state polite negative (?????)
- `polite_te_imashita`: progressive/state polite past (?????)
- `polite_te_imasen_deshita`: progressive/state polite past negative (????????)
- `plain_tai`: desire (??)
- `plain_tai_negative`: desire negative (????)
- `plain_tai_past`: desire past (????)
- `plain_tai_past_negative`: desire past negative (??????)
- `plain_te_mo_ii`: permission (????)
- `plain_te_wa_ikenai`: prohibition (??????)
- `plain_nai_de_kudasai`: negative request (???????)
- `plain_volitional`: volitional plain (??/??)
- `polite_volitional`: volitional polite (????)
- `potential_plain`: potential (can do)


Notes:
- `polite_te_form` is included for consistency and drillability. Some verbs (especially ??) make unnatural ?requests? in real life, but the form is still mechanically well-defined.
- **Data-driven templates (v2):** `plain_tai`, `plain_tai_negative`, `plain_tai_past`, `plain_tai_past_negative`, `plain_te_mo_ii`, `plain_te_wa_ikenai`, `plain_nai_de_kudasai`, `plain_volitional`, `polite_volitional`, `potential_plain` are sourced from `verbs.v2.jsonl` via `new_conjugations`.
- **Rule-based templates (v2):** the ??? family is derived from the plain te-form.

---

## Verb classes and where they come from

Each verb record includes `verb_class`:
- `godan`
- `ichidan`
- `irregular`

Codex should not guess verb class at runtime. It should use the `verb_class` in the data file.

### る-ending verbs
Some verbs ending in る are godan (the “godan-ru exceptions”). These should already be classified as `godan` in the verbs file. The list is also stored in `verb_exceptions.v1.json` as `godan_ru_exceptions` for auditing and future reclassification.

---

## Output rules (important)

1) Output is hiragana-only.
   - Use the verb’s `kana` field as the base.
   - Ignore `kanji` for output generation.
2) Output should contain no leading or trailing whitespace.
3) Output should not include punctuation.
4) Small っ, ゃ, ゅ, ょ are valid hiragana and must be produced correctly.
5) When a verb contains internal particles or multi-part kana (example: `やくにたつ`), treat the conjugation target as the final kana of the whole string.

---

## Special-case overrides (from `verb_exceptions.v1.json`)

The exceptions file may contain `special_cases` for certain templates.

Example:
- `いく`:
  - te-form: `いって`
  - plain past: `いった`

Rule:
- When generating `plain_te_form` or `plain_past`, check `special_cases` first.
- If a special-case mapping exists for the verb’s `kana`, use it as the base output for that template.
- Then proceed normally for any wrapping rule (example: for `polite_te_form`, append `ください`).

Example:
- `polite_te_form` for `いく` becomes `いってください` (because te-form is overridden to `いって`).

---

## Conjugation rules

### A) Ichidan verbs (一段, “る-verbs”)

Let:
- `kana` be the dictionary form in hiragana
- `stem` = `kana` with the final `る` removed

Templates:
- `plain_dictionary`: `kana`
- `plain_negative`: `stem + ない`
- `plain_past`: `stem + た`
- `plain_past_negative`: `stem + なかった`
- `plain_te_form`: `stem + て`

Polite (based on the same `stem`):
- `polite_dictionary`: `stem + ます`
- `polite_negative`: `stem + ません`
- `polite_past`: `stem + ました`
- `polite_past_negative`: `stem + ませんでした`
- `polite_te_form`: `(stem + て) + ください`

Examples:
- `たべる` → `たべない`, `たべた`, `たべなかった`, `たべて`, `たべます`, `たべません`

---

### B) Godan verbs (五段, “う-verbs”)

Godan rules depend on the final kana of the verb.

Let:
- `kana` be the dictionary form in hiragana
- `last` = the final kana (one character)
- `base` = `kana` with `last` removed

#### 1) Plain negative (ない-form)
Replace `last` with its a-row counterpart, then append `ない`.

A-row mapping:
- う → わ
- く → か
- ぐ → が
- す → さ
- つ → た
- ぬ → な
- ぶ → ば
- む → ま
- る → ら

Rule:
- `plain_negative` = `base + A(last) + ない`

Example:
- `のむ` → `のまない`
- `あう` → `あわない` (important: う becomes わ)

#### 2) Plain past (た-form)
Use the standard sound change groups.

Past (た-form) mapping by `last`:
- う / つ / る → `base + った`
- ぶ / む / ぬ → `base + んだ`
- く → `base + いた`
- ぐ → `base + いだ`
- す → `base + した`

Rule:
- `plain_past` = apply mapping above
- Then apply special-case overrides if present (example: `いく` → `いった`)

#### 3) Plain te-form (て/で form)
Te-form mapping by `last` (parallel to た-form):

- う / つ / る → `base + って`
- ぶ / む / ぬ → `base + んで`
- く → `base + いて`
- ぐ → `base + いで`
- す → `base + して`

Rule:
- `plain_te_form` = apply mapping above
- Then apply special-case overrides if present (example: `いく` → `いって`)

#### 4) Plain past negative (なかった-form)
Derived from the plain negative:
- `plain_past_negative` = `plain_negative` with final `ない` replaced by `なかった`

Example:
- `のむ` → `のまなかった`

#### 5) Polite forms (ます-family)
Polite forms use the i-stem, then append ます/ません/ました/ませんでした.

I-row mapping:
- う → い
- く → き
- ぐ → ぎ
- す → し
- つ → ち
- ぬ → に
- ぶ → び
- む → み
- る → り

Define:
- `masu_stem` = `base + I(last)`

Then:
- `polite_dictionary` = `masu_stem + ます`
- `polite_negative` = `masu_stem + ません`
- `polite_past` = `masu_stem + ました`
- `polite_past_negative` = `masu_stem + ませんでした`

Examples:
- `のむ` → `のみます`, `のみません`
- `かく` → `かきます`
- `まつ` → `まちます`
- `あう` → `あいます`

#### 6) Polite te-form (request)
- `polite_te_form` = `plain_te_form + ください`
- Apply special-case override for te-form first (example: `いく` → `いってください`)

---

### C) Irregular verbs (v1)

Irregular verbs are handled by direct tables (not by godan/ichidan rules). In v1, treat these as irregular:
- `する`
- `くる`
- `ある` (because the negative is `ない`)

#### する
- `plain_dictionary`: `する`
- `plain_negative`: `しない`
- `plain_past`: `した`
- `plain_past_negative`: `しなかった`
- `plain_te_form`: `して`
- `polite_dictionary`: `します`
- `polite_negative`: `しません`
- `polite_past`: `しました`
- `polite_past_negative`: `しませんでした`
- `polite_te_form`: `してください`

Note:
- `してください` is the canonical polite request for する.
- Optionally, the grader may accept `して + ください` style variants later, but canonical output should be `してください`.

#### くる
- `plain_dictionary`: `くる`
- `plain_negative`: `こない`
- `plain_past`: `きた`
- `plain_past_negative`: `こなかった`
- `plain_te_form`: `きて`
- `polite_dictionary`: `きます`
- `polite_negative`: `きません`
- `polite_past`: `きました`
- `polite_past_negative`: `きませんでした`
- `polite_te_form`: `きてください`

#### ある
- `plain_dictionary`: `ある`
- `plain_negative`: `ない`
- `plain_past`: `あった`
- `plain_past_negative`: `なかった`
- `plain_te_form`: `あって`
- `polite_dictionary`: `あります`
- `polite_negative`: `ありません`
- `polite_past`: `ありました`
- `polite_past_negative`: `ありませんでした`
- `polite_te_form`: `あってください`

Note:
- The request form for ある is not common in real usage, but the string is mechanically defined and keeps the drill system consistent.

---

## Ordering of operations (implementation detail)

For any `(verb_id, template_id)` pair:

1) Load verb by `id`.
2) If `verb_class == irregular`, use the irregular table for the base form.
3) Else, compute base form with the class rules above.
4) If template is `plain_past` or `plain_te_form`, check `exceptions.special_cases` overrides by `kana` and replace base output if present.
5) If template is `polite_te_form`, generate te-form first (with overrides), then append `ください` (except する which outputs `してください`).
6) Return the canonical answer string (hiragana).

---

## Future expansion notes (vNext)

This spec is intentionally focused on the v1 conjugations used for drills:
- dictionary
- negative
- past
- past negative
- te-form
- polite variants

Adding N4+ forms later should extend `conjugation_templates` and append rules here, without changing existing template IDs or outputs.
