const fs = require("fs");
const path = require("path");
const core = require("../src/core/index.js");
const lessonEngine = require("../src/core/lesson_engine.js");

const root = path.resolve(__dirname, "..");

function loadJson(relPath) {
  const full = path.join(root, relPath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function loadJsonl(relPath) {
  const full = path.join(root, relPath);
  const text = fs.readFileSync(full, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function runConjugationTests() {
  const tests = loadJson("tests/conjugation_golden_tests.v1.json");
  const verbs = loadJsonl("data/verbs/verbs.v2.jsonl");
  const exceptions = loadJson("data/exceptions/verb_exceptions.v1.json");
  const verbsById = {};
  verbs.forEach((verb) => {
    verbsById[verb.id] = verb;
  });

  let failures = 0;
  tests.cases.forEach((testCase) => {
    const verb = verbsById[testCase.verb_id];
    if (!verb) {
      console.error(`Missing verb id: ${testCase.verb_id}`);
      failures += 1;
      return;
    }
    const actual = core.conjugate(verb, testCase.template_id, exceptions);
    if (actual !== testCase.expected_kana) {
      console.error(
        `Conjugation mismatch ${testCase.case_id}: expected ${testCase.expected_kana}, got ${actual}`
      );
      failures += 1;
    }
  });

  if (failures === 0) {
    console.log("Conjugation tests: PASS");
  }
  return failures;
}

function runConjugationV2Tests() {
  const relPath = "tests/conjugation_golden_tests.v2.json";
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    console.log("Conjugation v2 tests: SKIP (no file present)");
    return 0;
  }

  const tests = loadJson(relPath);
  const verbs = loadJsonl("data/verbs/verbs.v2.jsonl");
  const exceptions = loadJson("data/exceptions/verb_exceptions.v1.json");
  const verbsById = {};
  verbs.forEach((verb) => {
    verbsById[verb.id] = verb;
  });

  let failures = 0;
  tests.cases.forEach((testCase) => {
    const verb = verbsById[testCase.verb_id];
    if (!verb) {
      console.error(`Missing verb id: ${testCase.verb_id}`);
      failures += 1;
      return;
    }
    const actual = core.conjugate(verb, testCase.template_id, exceptions);
    if (actual !== testCase.expected_kana) {
      console.error(
        `Conjugation v2 mismatch ${testCase.case_id}: expected ${testCase.expected_kana}, got ${actual}`
      );
      failures += 1;
    }
  });

  if (failures === 0) {
    console.log("Conjugation v2 tests: PASS");
  }
  return failures;
}

function runRomajiTests() {
  const relPath = "tests/romaji_to_kana_tests.v1.json";
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    console.log("Romaji tests: SKIP (no file present)");
    return 0;
  }
  const tests = loadJson(relPath);
  let failures = 0;
  tests.cases.forEach((testCase) => {
    const actual = core.normalizeAnswer(testCase.input);
    if (actual !== testCase.expected_kana) {
      console.error(
        `Romaji mismatch ${testCase.case_id}: expected ${testCase.expected_kana}, got ${actual}`
      );
      failures += 1;
    }
  });
  if (failures === 0) {
    console.log("Romaji tests: PASS");
  }
  return failures;
}

function runEnabledFormsTests() {
  const templates = loadJson("data/conjugations/conjugation_templates.v3.json");
  let failures = 0;

  const all = core.normalizeEnabledForms(templates, null);
  if (!Array.isArray(all) || all.length === 0) {
    console.error("Enabled forms mismatch: expected default to include all templates.");
    failures += 1;
  }

  const excluded = all.slice(1);
  const filtered = core.normalizeEnabledForms(templates, excluded);
  if (filtered.includes(all[0])) {
    console.error("Enabled forms mismatch: excluded form still present.");
    failures += 1;
  }

  const none = core.normalizeEnabledForms(templates, []);
  if (none.length !== 0) {
    console.error("Enabled forms mismatch: empty selection should stay empty.");
    failures += 1;
  }

  const now = new Date("2020-01-01T00:00:00Z");
  const cardA = core.createCard("verb_a", "plain_past", now);
  const cardB = core.createCard("verb_b", "plain_past", now);
  const reviewResult = core.applyReviewResult(cardA, { correct: true, now });
  const focusedResult = core.applyReviewResult(cardB, { correct: true, now });
  if (reviewResult.card.due_at !== focusedResult.card.due_at) {
    console.error("Focused review mismatch: SRS scheduling differs from reviews.");
    failures += 1;
  }

  if (failures === 0) {
    console.log("Enabled forms tests: PASS");
  }
  return failures;
}

function runLessonPracticeOutcomeTests() {
  let failures = 0;
  if (typeof core.getLessonPracticeOutcome !== "function") {
    console.error("Lesson practice outcome tests: missing core.getLessonPracticeOutcome");
    return 1;
  }

  const pass = core.getLessonPracticeOutcome(true);
  if (!pass.advance || pass.requeue || !pass.decrementLessonBank || !pass.recordCompletedLesson) {
    console.error("Lesson practice outcome mismatch for correct answers.");
    failures += 1;
  }

  const fail = core.getLessonPracticeOutcome(false);
  if (fail.advance || !fail.requeue || fail.decrementLessonBank || fail.recordCompletedLesson) {
    console.error("Lesson practice outcome mismatch for incorrect answers.");
    failures += 1;
  }

  if (failures === 0) {
    console.log("Lesson practice outcome tests: PASS");
  }
  return failures;
}

function runUnlockContextTests() {
  let failures = 0;
  if (typeof core.buildUnlockContext !== "function") {
    console.error("Unlock context tests: missing core.buildUnlockContext");
    return 1;
  }

  const now = new Date("2026-02-22T10:00:00Z");
  const fixed = core.buildUnlockContext(
    { unlockTime: "09:30", lastUnlockAt: "2026-02-21T01:00:00Z" },
    now,
  );
  if (!fixed || fixed.mode !== "fixed_time" || !fixed.nextUnlockAtIso) {
    console.error("Unlock context mismatch: expected fixed_time context.");
    failures += 1;
  } else {
    const next = new Date(fixed.nextUnlockAtIso);
    if (Number.isNaN(next.getTime()) || next.getTime() <= now.getTime()) {
      console.error("Unlock context mismatch: fixed next unlock should be in the future.");
      failures += 1;
    }
  }

  const rolling = core.buildUnlockContext(
    { unlockTime: "", lastUnlockAt: "2026-02-21T10:00:00.000Z" },
    now,
  );
  if (!rolling || rolling.mode !== "rolling") {
    console.error("Unlock context mismatch: expected rolling mode.");
    failures += 1;
  } else {
    const next = new Date(rolling.nextUnlockAtIso);
    if (next.toISOString() !== "2026-02-22T10:00:00.000Z") {
      console.error("Unlock context mismatch: rolling next unlock should be +24h from last unlock.");
      failures += 1;
    }
  }

  if (failures === 0) {
    console.log("Unlock context tests: PASS");
  }
  return failures;
}

function runStorageRecoveryTests() {
  let failures = 0;
  if (typeof core.recoverStoredJson !== "function") {
    console.error("Storage recovery tests: missing core.recoverStoredJson");
    return 1;
  }

  const fromPrimary = core.recoverStoredJson({
    primaryRaw: JSON.stringify({ value: 1 }),
    backupRaw: JSON.stringify({ saved_at: "2026-02-22T00:00:00.000Z", data: { value: 2 } }),
    fallbackValue: { value: 0 },
    isValid: (value) => Boolean(value && typeof value === "object" && typeof value.value === "number"),
  });
  if (fromPrimary.source !== "primary" || fromPrimary.value.value !== 1) {
    console.error("Storage recovery mismatch: expected primary source.");
    failures += 1;
  }

  const fromBackup = core.recoverStoredJson({
    primaryRaw: "{bad json",
    backupRaw: JSON.stringify({ saved_at: "2026-02-22T00:00:00.000Z", data: { value: 7 } }),
    fallbackValue: { value: 0 },
    isValid: (value) => Boolean(value && typeof value === "object" && typeof value.value === "number"),
  });
  if (
    fromBackup.source !== "backup" ||
    fromBackup.value.value !== 7 ||
    !fromBackup.restoredFromBackup ||
    !fromBackup.primaryParseError
  ) {
    console.error("Storage recovery mismatch: expected backup recovery after primary parse failure.");
    failures += 1;
  }

  const fallback = core.recoverStoredJson({
    primaryRaw: "{bad json",
    backupRaw: "{also bad",
    fallbackValue: { value: 0 },
    isValid: (value) => Boolean(value && typeof value === "object" && typeof value.value === "number"),
  });
  if (fallback.source !== "default" || fallback.value.value !== 0 || !fallback.primaryParseError) {
    console.error("Storage recovery mismatch: expected default fallback when no valid data exists.");
    failures += 1;
  }

  if (failures === 0) {
    console.log("Storage recovery tests: PASS");
  }
  return failures;
}

function runSrsDemotionTests() {
  let failures = 0;
  const now = new Date("2020-01-01T00:00:00Z");
  const tomorrow = new Date("2020-01-02T00:00:00Z").toISOString();

  const cardS4 = core.createCard("verb_c", "plain_past", now);
  cardS4.stage = "S4";
  const resultS4 = core.applyReviewResult(cardS4, { correct: false, now });
  if (resultS4.card.stage !== "S2") {
    console.error(`SRS demotion mismatch: expected S4 -> S2, got ${resultS4.card.stage}`);
    failures += 1;
  }
  if (resultS4.card.due_at !== tomorrow) {
    console.error("SRS demotion mismatch: expected due tomorrow after incorrect.");
    failures += 1;
  }

  const cardS1 = core.createCard("verb_d", "plain_past", now);
  cardS1.stage = "S1";
  const resultS1 = core.applyReviewResult(cardS1, { correct: false, now });
  if (resultS1.card.stage !== "S1") {
    console.error(`SRS demotion mismatch: expected S1 to stay S1, got ${resultS1.card.stage}`);
    failures += 1;
  }
  if (resultS1.card.due_at !== tomorrow) {
    console.error("SRS demotion mismatch: expected due tomorrow after incorrect.");
    failures += 1;
  }

  if (failures === 0) {
    console.log("SRS demotion tests: PASS");
  }
  return failures;
}

function runNewConjugationTests() {
  const verbs = loadJsonl("data/verbs/verbs.v2.jsonl");
  const exceptions = loadJson("data/exceptions/verb_exceptions.v1.json");
  let failures = 0;

  const sample = verbs.find(
    (verb) => verb && verb.new_conjugations && verb.new_conjugations.plain_tai
  );
  if (!sample) {
    console.warn("New conjugation tests: SKIP (no sample with new_conjugations)");
    return failures;
  }

  const expectedTai = sample.new_conjugations.plain_tai;
  const actualTai = core.conjugate(sample, "plain_tai", exceptions);
  if (expectedTai !== actualTai) {
    console.error(
      `New conjugation mismatch: expected plain_tai ${expectedTai}, got ${actualTai}`
    );
    failures += 1;
  }

  const teForm = core.conjugate(sample, "plain_te_form", exceptions);
  const expectedTeIru = `${teForm}いる`;
  const actualTeIru = core.conjugate(sample, "plain_te_iru", exceptions);
  if (expectedTeIru !== actualTeIru) {
    console.error(
      `New conjugation mismatch: expected plain_te_iru ${expectedTeIru}, got ${actualTeIru}`
    );
    failures += 1;
  }

  if (failures === 0) {
    console.log("New conjugation tests: PASS");
  }
  return failures;
}

function runObligationAliasTests() {
  const verbs = loadJsonl("data/verbs/verbs.v2.jsonl");
  const exceptions = loadJson("data/exceptions/verb_exceptions.v1.json");
  let failures = 0;

  const samples = ["よむ_01", "たべる_01", "する_01", "ある_exist_have_01"];
  const byId = {};
  verbs.forEach((verb) => {
    byId[verb.id] = verb;
  });

  samples.forEach((verbId) => {
    const verb = byId[verbId];
    if (!verb) {
      console.error(`Obligation aliases: missing verb ${verbId}`);
      failures += 1;
      return;
    }

    const negative = core.conjugate(verb, "plain_negative", exceptions);
    if (!negative.endsWith("ない")) {
      console.error(`Obligation aliases: negative does not end with ない for ${verbId}`);
      failures += 1;
      return;
    }
    const stem = negative.slice(0, -2);
    const expected = [
      `${stem}なければいけない`,
      `${stem}なきゃいけない`,
      `${stem}なくちゃいけない`,
    ];
    const accepted = core.conjugateAccepted(verb, "plain_nakereba_ikenai", exceptions);

    expected.forEach((variant) => {
      if (!accepted.includes(variant)) {
        console.error(`Obligation aliases: missing accepted variant ${variant} for ${verbId}`);
        failures += 1;
      }
    });
  });

  if (failures === 0) {
    console.log("Obligation alias tests: PASS");
  }
  return failures;
}

function runLessonEngineTests() {
  const guided = loadJson("data/learning_paths/learning_path.guided.v1.json");
  const genki = loadJson("data/learning_paths/learning_path.genki_aligned.v1.json");
  let failures = 0;

  const day1 = lessonEngine.computeCompositionWindow({
    pathType: "guided",
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    currentStage: { id: "s01_polite", template_ids: ["polite_dictionary", "polite_negative", "polite_past", "polite_past_negative"] },
    dailyCount: 10,
    nowIso: "2026-02-01T12:00:00Z",
  });
  if (day1.counts.current !== 6 || day1.counts.previous !== 3 || day1.counts.weakness !== 1) {
    console.error("Lesson engine guided day1 composition mismatch.");
    failures += 1;
  }

  const day4 = lessonEngine.computeCompositionWindow({
    pathType: "guided",
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    currentStage: { id: "s01_polite", template_ids: ["polite_dictionary", "polite_negative", "polite_past", "polite_past_negative"] },
    dailyCount: 10,
    nowIso: "2026-02-04T12:00:00Z",
  });
  if (day4.counts.current !== 4 || day4.counts.previous !== 4 || day4.counts.weakness !== 2) {
    console.error("Lesson engine guided day4 composition mismatch.");
    failures += 1;
  }

  const midCourse = lessonEngine.computeCompositionWindow({
    pathType: "guided",
    pathConfig: guided,
    pathState: { stage_index: 8, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    currentStage: { id: "s09_desire", template_ids: ["plain_tai"] },
    dailyCount: 10,
    nowIso: "2026-02-10T12:00:00Z",
  });
  if (midCourse.counts.current !== 2 || midCourse.counts.recent !== 5 || midCourse.counts.weakness !== 3) {
    console.error("Lesson engine guided mid-course composition mismatch.");
    failures += 1;
  }

  const genkiDay1 = lessonEngine.computeCompositionWindow({
    pathType: "textbook_genki",
    pathConfig: genki,
    pathState: { stage_index: 0, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    currentStage: { id: "g01_polite", template_ids: ["polite_dictionary"] },
    dailyCount: 10,
    nowIso: "2026-02-01T12:00:00Z",
  });
  if (genkiDay1.counts.current !== 7 || genkiDay1.counts.previous !== 2 || genkiDay1.counts.weakness !== 1) {
    console.error("Lesson engine genki day1 composition mismatch.");
    failures += 1;
  }

  const narrowStage = lessonEngine.computeCompositionWindow({
    pathType: "guided",
    pathConfig: guided,
    pathState: { stage_index: 12, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    currentStage: { id: "s13_te_shimau", template_ids: ["plain_te_shimau"] },
    dailyCount: 10,
    nowIso: "2026-02-06T12:00:00Z",
  });
  const narrowPrev = Math.max(0, Number(narrowStage.counts.previous || 0) + Number(narrowStage.counts.recent || 0));
  if (narrowPrev < 5) {
    console.error("Lesson engine narrow-stage previous mix floor mismatch.");
    failures += 1;
  }

  const unseenPairs = [];
  for (let i = 1; i <= 10; i += 1) {
    unseenPairs.push({ verb_id: `c${i}`, conjugation_id: "plain_past" });
  }
  for (let i = 1; i <= 10; i += 1) {
    unseenPairs.push({ verb_id: `p${i}`, conjugation_id: "plain_negative" });
  }
  for (let i = 1; i <= 10; i += 1) {
    unseenPairs.push({ verb_id: `t${i}`, conjugation_id: "plain_te_form" });
  }
  const queueResult = lessonEngine.buildLessonQueue({
    pathType: "guided",
    pathConfig: guided,
    pathState: {
      stage_index: 3,
      stage_started_at: "2026-02-10T00:00:00Z",
      failed_gate_count: 0,
    },
    unseenPairs,
    cardsById: {},
    verbsById: {},
    mistakeTemplateCounts: { plain_negative: 15 },
    dailyCount: 10,
    nowIso: "2026-02-10T12:00:00Z",
    rng: () => 0.11,
  });
  const queue = queueResult.queue || [];
  const currentCount = queue.filter((item) => item.conjugation_id === "plain_past").length;
  const weakCount = queue.filter((item) => item.conjugation_id === "plain_negative").length;
  if (queue.length !== 10 || currentCount !== 6 || weakCount < 1) {
    console.error("Lesson engine queue composition mismatch for guided intro window.");
    failures += 1;
  }

  const boosted = lessonEngine.applyConfusablePairBoost({
    baseTemplateIds: ["plain_te_mo_ii"],
    confusablePairs: [["plain_te_mo_ii", "plain_te_wa_ikenai"]],
    triggerErrors: 2,
    mistakeTemplateCounts: { plain_te_mo_ii: 3 },
    allowedTemplateIds: ["plain_te_mo_ii", "plain_te_wa_ikenai"],
  });
  if (!boosted.includes("plain_te_wa_ikenai")) {
    console.error("Lesson engine confusable pair boost mismatch.");
    failures += 1;
  }

  const cardsById = {
    "v1::polite_dictionary": {
      card_id: "v1::polite_dictionary",
      verb_id: "v1",
      conjugation_id: "polite_dictionary",
      success_count_total: 10,
      failure_count_total: 10,
    },
    "v2::polite_dictionary": {
      card_id: "v2::polite_dictionary",
      verb_id: "v2",
      conjugation_id: "polite_dictionary",
      success_count_total: 0,
      failure_count_total: 4,
    },
    "v3::polite_dictionary": {
      card_id: "v3::polite_dictionary",
      verb_id: "v3",
      conjugation_id: "polite_dictionary",
      success_count_total: 0,
      failure_count_total: 4,
    },
  };
  const verbsById = {
    v1: { id: "v1", verb_class: "godan" },
    v2: { id: "v2", verb_class: "ichidan" },
    v3: { id: "v3", verb_class: "irregular" },
  };

  const failEval = lessonEngine.evaluatePathAdvance({
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    cardsById,
    verbsById,
    nowIso: "2026-02-10T00:00:00Z",
  });
  if (!failEval.pathState.hold_until) {
    console.error("Lesson engine gate fail did not set hold_until.");
    failures += 1;
  }

  const holdEval = lessonEngine.evaluatePathAdvance({
    pathConfig: guided,
    pathState: failEval.pathState,
    cardsById,
    verbsById,
    nowIso: "2026-02-10T12:00:00Z",
  });
  if (!holdEval.gate || holdEval.gate.reason !== "hold_active") {
    console.error("Lesson engine hold did not block advance.");
    failures += 1;
  }

  const passCards = {
    "v1::polite_dictionary": {
      card_id: "v1::polite_dictionary",
      verb_id: "v1",
      conjugation_id: "polite_dictionary",
      success_count_total: 9,
      failure_count_total: 0,
    },
    "v2::polite_dictionary": {
      card_id: "v2::polite_dictionary",
      verb_id: "v2",
      conjugation_id: "polite_dictionary",
      success_count_total: 9,
      failure_count_total: 0,
    },
    "v3::polite_dictionary": {
      card_id: "v3::polite_dictionary",
      verb_id: "v3",
      conjugation_id: "polite_dictionary",
      success_count_total: 9,
      failure_count_total: 0,
    },
  };
  const passEval = lessonEngine.evaluatePathAdvance({
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    cardsById: passCards,
    verbsById,
    nowIso: "2026-02-10T00:00:00Z",
  });
  if (!passEval.advanced || passEval.pathState.stage_index !== 1) {
    console.error("Lesson engine gate pass did not advance stage.");
    failures += 1;
  }

  const minDaysEval = lessonEngine.evaluatePathAdvance({
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-02-10T00:00:00Z", failed_gate_count: 0 },
    cardsById: passCards,
    verbsById,
    nowIso: "2026-02-10T12:00:00Z",
  });
  if (minDaysEval.advanced || !(minDaysEval.gate && minDaysEval.gate.failed_reasons || []).includes("min_days_in_stage")) {
    console.error("Lesson engine min-days gate mismatch.");
    failures += 1;
  }

  const stuckEval = lessonEngine.evaluatePathAdvance({
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-01-20T00:00:00Z", failed_gate_count: 1 },
    cardsById,
    verbsById,
    nowIso: "2026-02-10T00:00:00Z",
  });
  if (!stuckEval.pathState.stabilization_until) {
    console.error("Lesson engine stall stabilization mismatch.");
    failures += 1;
  }

  const strictBandEval = lessonEngine.evaluatePathAdvance({
    pathConfig: guided,
    pathState: { stage_index: 19, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0 },
    cardsById: {
      "a::plain_passive": { verb_id: "v1", conjugation_id: "plain_passive", success_count_total: 4, failure_count_total: 1 },
      "b::plain_passive": { verb_id: "v2", conjugation_id: "plain_passive", success_count_total: 4, failure_count_total: 1 },
      "c::plain_passive": { verb_id: "v3", conjugation_id: "plain_passive", success_count_total: 4, failure_count_total: 1 },
    },
    verbsById,
    nowIso: "2026-02-10T00:00:00Z",
  });
  if (strictBandEval.advanced || !(strictBandEval.gate && strictBandEval.gate.failed_reasons || []).includes("min_answered")) {
    console.error("Lesson engine stage-band strictness mismatch.");
    failures += 1;
  }

  const stageOnePairs = [
    { verb_id: "v1", conjugation_id: "polite_dictionary" },
    { verb_id: "v2", conjugation_id: "polite_negative" },
    { verb_id: "v3", conjugation_id: "polite_past" },
    { verb_id: "v4", conjugation_id: "polite_past_negative" },
    { verb_id: "v5", conjugation_id: "polite_dictionary" },
    { verb_id: "v6", conjugation_id: "polite_negative" },
    { verb_id: "v7", conjugation_id: "polite_past" },
    { verb_id: "v8", conjugation_id: "polite_past_negative" },
    { verb_id: "v9", conjugation_id: "plain_te_form" },
  ];
  const stageOneEarly = lessonEngine.buildLessonQueue({
    pathType: "guided",
    pathConfig: guided,
    pathState: { stage_index: 0, stage_started_at: "2026-02-10T00:00:00Z", failed_gate_count: 0 },
    unseenPairs: stageOnePairs,
    cardsById: {},
    verbsById,
    mistakeTemplateCounts: {},
    dailyCount: 6,
    nowIso: "2026-02-10T12:00:00Z",
    rng: () => 0.1,
  });
  const earlyUsesPast = (stageOneEarly.queue || []).some(
    (item) => item.conjugation_id === "polite_past" || item.conjugation_id === "polite_past_negative"
  );
  if (earlyUsesPast) {
    console.error("Lesson engine stage-1 subphase mismatch: early queue should focus on polite present/negative.");
    failures += 1;
  }

  const irregularVerbsById = {
    s1: { id: "s1", kana: "する", verb_class: "irregular" },
    k1: { id: "k1", kana: "くる", verb_class: "irregular" },
    i1: { id: "i1", kana: "いく", verb_class: "godan" },
    g1: { id: "g1", kana: "よむ", verb_class: "godan" },
    g2: { id: "g2", kana: "かく", verb_class: "godan" },
    i2: { id: "i2", kana: "たべる", verb_class: "ichidan" },
  };
  const irregularPairs = [];
  ["s1", "k1", "i1", "g1", "g2", "i2"].forEach((verbId) => {
    irregularPairs.push({ verb_id: verbId, conjugation_id: "plain_past" });
    irregularPairs.push({ verb_id: verbId, conjugation_id: "plain_negative" });
  });
  const irregularQueue = lessonEngine.buildLessonQueue({
    pathType: "guided",
    pathConfig: guided,
    pathState: { stage_index: 3, stage_started_at: "2026-02-01T00:00:00Z", failed_gate_count: 0, lesson_session_count: 1, last_iku_session: 0 },
    unseenPairs: irregularPairs,
    cardsById: {},
    verbsById: irregularVerbsById,
    mistakeTemplateCounts: {},
    dailyCount: 6,
    nowIso: "2026-02-10T12:00:00Z",
    rng: () => 0.2,
  });
  const irregularCount = (irregularQueue.queue || []).filter((item) => {
    const verb = irregularVerbsById[item.verb_id];
    return verb && verb.verb_class === "irregular";
  }).length;
  const hasSuru = (irregularQueue.queue || []).some((item) => item.verb_id === "s1");
  const hasKuru = (irregularQueue.queue || []).some((item) => item.verb_id === "k1");
  const hasIku = (irregularQueue.queue || []).some((item) => item.verb_id === "i1");
  if (irregularCount < 2 || !hasSuru || !hasKuru || !hasIku) {
    console.error("Lesson engine irregular quota mismatch.");
    failures += 1;
  }
  if (!irregularQueue.pathStatePatch || irregularQueue.pathStatePatch.lesson_session_count !== 2 || irregularQueue.pathStatePatch.last_iku_session !== 2) {
    console.error("Lesson engine irregular path state patch mismatch.");
    failures += 1;
  }

  if (failures === 0) {
    console.log("Lesson engine tests: PASS");
  }
  return failures;
}

function runSettingsNormalizationTests() {
  let failures = 0;

  function normalizeLearningPathFields(imported) {
    const normalized = { ...(imported || {}) };
    if (
      normalized.learning_path !== "guided" &&
      normalized.learning_path !== "textbook_genki" &&
      normalized.learning_path !== "custom"
    ) {
      if (imported && imported.lesson_content_mode === "custom") {
        normalized.learning_path = "custom";
      } else {
        normalized.learning_path = "guided";
      }
    }
    const nowIso = "2026-02-10T00:00:00Z";
    normalized.learning_path_state = {
      guided: {},
      textbook_genki: {},
      custom: {},
      ...(imported && imported.learning_path_state ? imported.learning_path_state : {}),
    };
    Object.keys(normalized.learning_path_state).forEach((pathKey) => {
      normalized.learning_path_state[pathKey] = lessonEngine.normalizePathState(
        normalized.learning_path_state[pathKey],
        nowIso,
      );
    });
    return normalized;
  }

  const legacyCustom = normalizeLearningPathFields({ lesson_content_mode: "custom" });
  if (legacyCustom.learning_path !== "custom") {
    console.error("Settings normalization mismatch: legacy custom mode not mapped to custom path.");
    failures += 1;
  }

  const legacyDefault = normalizeLearningPathFields({});
  if (legacyDefault.learning_path !== "guided") {
    console.error("Settings normalization mismatch: default path should be guided.");
    failures += 1;
  }

  const missingState = normalizeLearningPathFields({ learning_path: "textbook_genki" });
  if (
    !missingState.learning_path_state.guided ||
    !missingState.learning_path_state.textbook_genki ||
    !missingState.learning_path_state.custom
  ) {
    console.error("Settings normalization mismatch: missing learning_path_state defaults.");
    failures += 1;
  }

  if (failures === 0) {
    console.log("Settings normalization tests: PASS");
  }
  return failures;
}

const failures =
  runConjugationTests() +
  runConjugationV2Tests() +
  runRomajiTests() +
  runEnabledFormsTests() +
  runLessonPracticeOutcomeTests() +
  runUnlockContextTests() +
  runStorageRecoveryTests() +
  runSrsDemotionTests() +
  runNewConjugationTests() +
  runObligationAliasTests() +
  runLessonEngineTests() +
  runSettingsNormalizationTests();
if (failures > 0) {
  console.error(`\nTests failed: ${failures}`);
  process.exit(1);
}
console.log("\nAll tests passed.");
