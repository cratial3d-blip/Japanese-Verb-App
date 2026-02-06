# Romaji Input Spec (v1)

This document defines how typed answers work in the app.

Goal:
- User types **romaji** on a standard keyboard.
- The app converts romaji → **hiragana** in real time (IME-like).
- Answers are graded against the expected answer, which is **hiragana-only**.

This spec aims to mimic the feel of Bunpro / WaniKani-style in-app input:
- Fast typing
- Minimal “gotchas”
- Robust normalization so users are not marked wrong for harmless formatting issues

---

## 1) Core behavior

### 1.1 Input mode
- Input field accepts standard keyboard characters (ASCII).
- The app performs live conversion to hiragana using a deterministic romaji mapping.
- Output displayed to the user should be hiragana (not raw romaji), once converted.

### 1.2 Grading target
- Expected answers are generated as **hiragana-only** strings.
- User input is graded after conversion and normalization (see section 5).

### 1.3 No kanji
- The app does not require kanji.
- If a user somehow enters kana/kanji directly (mobile keyboard), the app should still accept it as long as the final normalized string matches the expected hiragana.

---

## 2) Romaji → Hiragana mapping rules

### 2.1 Basic syllables
The converter should support the standard Hepburn-ish romaji used by most in-app keyboards:
- a i u e o
- ka ki ku ke ko
- sa shi su se so
- ta chi tsu te to
- na ni nu ne no
- ha hi fu he ho
- ma mi mu me mo
- ya yu yo
- ra ri ru re ro
- wa wo
- ga gi gu ge go
- za ji zu ze zo
- da di du de do (optional, but common mapping is: ぢ/づ)
- ba bi bu be bo
- pa pi pu pe po
- kya kyu kyo / sha shu sho / cha chu cho / nya nyu nyo / hya hyu hyo / mya myu myo / rya ryu ryo
- gya gyu gyo / ja ju jo / bya byu byo / pya pyu pyo

Minimum required mappings for this project:
- し = shi
- ち = chi
- つ = tsu
- ふ = fu
- じ = ji
- しゃ = sha, しゅ = shu, しょ = sho
- ちゃ = cha, ちゅ = chu, ちょ = cho

### 2.2 Small vowels and small kana
Support standard small-kana inputs:
- ぁ ぃ ぅ ぇ ぉ  (xa/xi/xu/xe/xo or la/li/lu/le/lo)
- ゃ ゅ ょ (xya/xyu/xyo or lya/lyu/lyo)
- っ (small tsu) via double consonant (see 2.3) or xtsu/ltsu

The app only needs these to correctly support:
- small っ for conjugation outputs like いって / いった
- small ゃゅょ for general robustness (future expansion)

### 2.3 Small っ (sokuon) via doubled consonants
Rule:
- A doubled consonant creates a small っ before the next kana.

Examples:
- kitte → きって (because “tt”)
- kittta → きった (triple t is acceptable; see below)
- matte → まって
- yatta → やった

Acceptance rule (to match common in-app behavior):
- Allow both:
  - “double consonant” (tt → っ)
  - “triple consonant” when the next kana starts with that consonant (kittta → きった)

Implementation note:
- A practical approach is to treat any sequence like “...tt...” as producing a small っ and consuming one “t” as the sokuon marker.
- If the user types “kittta”, the converter should still resolve to きった (not fail).

### 2.4 ん (n) handling
This is the most important “trick bit” for a good UX.

Rules:
1) “nn” always produces ん.
   - kanna → かんな
2) “n” before a consonant produces ん.
   - kanpai → かんぱい
3) “n” before a vowel (a/i/u/e/o) or y normally starts the next syllable (na/ni/nya, etc).
   - na → な
4) To force ん before a vowel or y, the user may type:
   - “n ” (n + space), or
   - “n'” (n + apostrophe), or
   - “nn”

Required acceptance (match Bunpro/WK feel):
- Accept “n ” (space) to commit ん.
- Accept “nn” to commit ん.
- Accept “n'” to commit ん (optional but recommended).

Examples:
- kin'en (or kin'en) → きんえん
- kin en (n + space) → きんえん
- kinen → きねん (because ne starts a syllable)

Implementation note:
- On desktop, space is the simplest “commit” mechanism.
- On mobile, users may input kana directly, so this mostly matters for physical keyboards.

### 2.5 Long vowels
For v1 (verb conjugation drills), long-vowel normalization is not essential, but the converter should not behave strangely.

Recommended minimal behavior:
- Convert as typed, no special macron handling.
- Support common patterns:
  - ou → おう (ex: とう)
  - oo → おお
  - uu → うう
This is standard romaji-kana mapping.

---

## 3) Non-romaji input (mobile friendliness)

If the user inputs kana directly (hiragana keyboard):
- Accept it as-is.
- Run the same normalization rules as section 5.
- Grade against expected hiragana.

If the user inputs katakana:
- Option A (recommended): convert katakana → hiragana before grading.
- Option B: treat katakana as invalid.
Recommendation: use Option A for a smoother experience.

If the user inputs kanji:
- Do not attempt IME conversion or reading guesses.
- Treat kanji as-is. It will not match expected hiragana and will be incorrect.
This keeps the system simple and avoids incorrect “reading” guesses.

---

## 4) When conversion happens

Preferred UX:
- Live conversion as the user types (IME-like).
- Backspace should remove characters in a natural way (ideally by kana chunks, not raw romaji fragments).

Acceptable v1 alternative (simpler):
- Store raw typed romaji.
- Convert on “Check Answer”.
- Still apply the same mapping + normalization.
This is easier to implement and still works well.

If choosing the simpler approach, the UI should still show the converted kana on submit feedback so the user learns from their exact input.

---

## 5) Grading normalization rules

Goal: don’t mark answers wrong for harmless formatting.

Before comparing user_answer vs expected_answer:

### 5.1 Trim and collapse whitespace
- Trim leading/trailing whitespace.
- Collapse internal repeated whitespace to a single space.
- Then remove all spaces entirely (recommended) for this app, because conjugations do not require spaces.

Result:
- “  たべ  ました  ” → “たべました”

### 5.2 Case-insensitive for romaji
- If the user enters romaji, treat A-Z same as a-z before conversion.

### 5.3 Ignore common punctuation noise (optional but recommended)
- Remove: periods, commas, exclamation marks, question marks.
This reduces accidental wrong answers.

### 5.4 Normalize kana width / type
- If katakana is present, convert to hiragana.
- Normalize small/large kana correctly (do not change meaning).

### 5.5 No “fuzzy” spelling acceptance
Do not accept near-misses like:
- たべて vs たべた
- のまない vs のみない
The goal is strict conjugation accuracy.

The only “flexibility” should be in input convenience (spaces, casing, romaji typing variants), not in conjugation correctness.

---

## 6) Multiple valid answers (v1)

For v1, each prompt has one canonical expected answer.

However, some future expansions may introduce multiple acceptable answers (for example, dialect variants or alternate politeness patterns).

If needed later, implement:
- `accepted_answers`: array of additional valid normalized answers

For now:
- One expected answer only.

---

## 7) Test coverage requirement

To keep behavior stable, add unit tests in:
- `tests/romaji_to_kana_tests.v1.json`

Minimum test cases should include:
- small っ via double consonant: kitte → きって
- triple consonant acceptance: kittta → きった
- ん via nn: nn → ん
- ん via n + space: n  + vowel start
- shi/chi/tsu cases
- fu case
- kya/sha/cha group cases
- katakana → hiragana normalization (if supported)

---

## 8) Summary of required v1 behavior

Required:
- Romaji → hiragana conversion supports standard mappings
- Small っ via doubled consonants, accept triple consonant pattern used by many learners
- ん handling supports `nn` and `n + space` (and ideally `n'`)
- Grading ignores casing and accidental spaces
- Expected answers are hiragana-only

Recommended (nice-to-have):
- Katakana → hiragana normalization
- Light punctuation stripping
- Live conversion (IME-like) rather than submit-time conversion
