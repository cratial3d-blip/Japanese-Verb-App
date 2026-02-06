const fs = require("fs");
const path = require("path");
const core = require("../src/core/index.js");

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
  const templates = loadJson("data/conjugations/conjugation_templates.v2.json");
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

const failures =
  runConjugationTests() +
  runRomajiTests() +
  runEnabledFormsTests() +
  runSrsDemotionTests() +
  runNewConjugationTests();
if (failures > 0) {
  console.error(`\nTests failed: ${failures}`);
  process.exit(1);
}
console.log("\nAll tests passed.");
