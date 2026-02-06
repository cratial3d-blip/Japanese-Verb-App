(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.JapaneseSrsCore = factory();
  }
})(typeof window !== "undefined" ? window : global, function () {
  const VOWELS = new Set(["a", "i", "u", "e", "o"]);
  const CONSONANTS = new Set("bcdfghjklmnpqrstvwxyz".split(""));

  const ROMAJI_MAP = {
    a: "あ",
    i: "い",
    u: "う",
    e: "え",
    o: "お",
    ka: "か",
    ki: "き",
    ku: "く",
    ke: "け",
    ko: "こ",
    sa: "さ",
    shi: "し",
    si: "し",
    su: "す",
    se: "せ",
    so: "そ",
    ta: "た",
    chi: "ち",
    ti: "ち",
    tsu: "つ",
    tu: "つ",
    te: "て",
    to: "と",
    na: "な",
    ni: "に",
    nu: "ぬ",
    ne: "ね",
    no: "の",
    ha: "は",
    hi: "ひ",
    fu: "ふ",
    hu: "ふ",
    he: "へ",
    ho: "ほ",
    ma: "ま",
    mi: "み",
    mu: "む",
    me: "め",
    mo: "も",
    ya: "や",
    yu: "ゆ",
    yo: "よ",
    ra: "ら",
    ri: "り",
    ru: "る",
    re: "れ",
    ro: "ろ",
    wa: "わ",
    wo: "を",
    ga: "が",
    gi: "ぎ",
    gu: "ぐ",
    ge: "げ",
    go: "ご",
    za: "ざ",
    ji: "じ",
    zi: "じ",
    zu: "ず",
    ze: "ぜ",
    zo: "ぞ",
    da: "だ",
    di: "ぢ",
    du: "づ",
    de: "で",
    do: "ど",
    ba: "ば",
    bi: "び",
    bu: "ぶ",
    be: "べ",
    bo: "ぼ",
    pa: "ぱ",
    pi: "ぴ",
    pu: "ぷ",
    pe: "ぺ",
    po: "ぽ",
    kya: "きゃ",
    kyu: "きゅ",
    kyo: "きょ",
    sha: "しゃ",
    shu: "しゅ",
    sho: "しょ",
    cha: "ちゃ",
    chu: "ちゅ",
    cho: "ちょ",
    nya: "にゃ",
    nyu: "にゅ",
    nyo: "にょ",
    hya: "ひゃ",
    hyu: "ひゅ",
    hyo: "ひょ",
    mya: "みゃ",
    myu: "みゅ",
    myo: "みょ",
    rya: "りゃ",
    ryu: "りゅ",
    ryo: "りょ",
    gya: "ぎゃ",
    gyu: "ぎゅ",
    gyo: "ぎょ",
    ja: "じゃ",
    ju: "じゅ",
    jo: "じょ",
    bya: "びゃ",
    byu: "びゅ",
    byo: "びょ",
    pya: "ぴゃ",
    pyu: "ぴゅ",
    pyo: "ぴょ",
    xa: "ぁ",
    xi: "ぃ",
    xu: "ぅ",
    xe: "ぇ",
    xo: "ぉ",
    la: "ぁ",
    li: "ぃ",
    lu: "ぅ",
    le: "ぇ",
    lo: "ぉ",
    xya: "ゃ",
    xyu: "ゅ",
    xyo: "ょ",
    lya: "ゃ",
    lyu: "ゅ",
    lyo: "ょ",
    xtsu: "っ",
    ltsu: "っ",
  };

  function isHiraganaChar(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0x3041 && code <= 0x309f;
  }

  function isKatakanaChar(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30ff;
  }

  function toHiragana(input) {
    let out = "";
    for (const ch of input) {
      if (isKatakanaChar(ch)) {
        const code = ch.charCodeAt(0) - 0x60;
        out += String.fromCharCode(code);
      } else {
        out += ch;
      }
    }
    return out;
  }

  function isAsciiLetter(ch) {
    return ch >= "a" && ch <= "z";
  }

  function isConsonant(ch) {
    return CONSONANTS.has(ch);
  }

  function countRun(input, index, ch) {
    let i = index;
    while (i < input.length && input[i] === ch) {
      i += 1;
    }
    return i - index;
  }

  function romajiToKana(input) {
    if (input == null) return "";
    const raw = String(input);
    const lower = raw.toLowerCase();
    let out = "";
    let i = 0;

    while (i < lower.length) {
      const ch = lower[i];

      if (isHiraganaChar(ch)) {
        out += ch;
        i += 1;
        continue;
      }

      if (isKatakanaChar(ch)) {
        out += toHiragana(ch);
        i += 1;
        continue;
      }

      if (/\s/.test(ch)) {
        out += " ";
        i += 1;
        continue;
      }

      if (ch === "'") {
        i += 1;
        continue;
      }

      if (!isAsciiLetter(ch)) {
        out += ch;
        i += 1;
        continue;
      }

      const next = lower[i + 1] || "";

      if (ch === "n") {
        if (next === "'" || next === " ") {
          out += "ん";
          i += 2;
          continue;
        }
        if (next === "n") {
          out += "ん";
          i += 2;
          continue;
        }
        if (!next || (!VOWELS.has(next) && next !== "y")) {
          out += "ん";
          i += 1;
          continue;
        }
      }

      if (isConsonant(ch) && ch !== "n" && next === ch) {
        const runLen = countRun(lower, i, ch);
        out += "っ";
        i += Math.max(1, runLen - 1);
        continue;
      }

      let matched = null;
      for (const len of [4, 3, 2, 1]) {
        const chunk = lower.slice(i, i + len);
        if (ROMAJI_MAP[chunk]) {
          matched = ROMAJI_MAP[chunk];
          i += len;
          break;
        }
      }

      if (matched) {
        out += matched;
        continue;
      }

      out += ch;
      i += 1;
    }

    return out;
  }

  function normalizeAnswer(input) {
    if (input == null) return "";
    let text = String(input);
    text = text.replace(/[.,!?]/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    text = text.toLowerCase();
    const kana = romajiToKana(text);
    const normalized = toHiragana(kana);
    return normalized.replace(/\s+/g, "");
  }

  const A_ROW = {
    "う": "わ",
    "く": "か",
    "ぐ": "が",
    "す": "さ",
    "つ": "た",
    "ぬ": "な",
    "ぶ": "ば",
    "む": "ま",
    "る": "ら",
  };

  const I_ROW = {
    "う": "い",
    "く": "き",
    "ぐ": "ぎ",
    "す": "し",
    "つ": "ち",
    "ぬ": "に",
    "ぶ": "び",
    "む": "み",
    "る": "り",
  };

  const IRREGULAR_TABLE = {
    "する": {
      plain_dictionary: "する",
      plain_negative: "しない",
      plain_past: "した",
      plain_past_negative: "しなかった",
      plain_te_form: "して",
      polite_dictionary: "します",
      polite_negative: "しません",
      polite_past: "しました",
      polite_past_negative: "しませんでした",
      polite_te_form: "してください",
    },
    "くる": {
      plain_dictionary: "くる",
      plain_negative: "こない",
      plain_past: "きた",
      plain_past_negative: "こなかった",
      plain_te_form: "きて",
      polite_dictionary: "きます",
      polite_negative: "きません",
      polite_past: "きました",
      polite_past_negative: "きませんでした",
      polite_te_form: "きてください",
    },
    "ある": {
      plain_dictionary: "ある",
      plain_negative: "ない",
      plain_past: "あった",
      plain_past_negative: "なかった",
      plain_te_form: "あって",
      polite_dictionary: "あります",
      polite_negative: "ありません",
      polite_past: "ありました",
      polite_past_negative: "ありませんでした",
      polite_te_form: "あってください",
    },
  };

  function godanPast(base, last) {
    if (last === "う" || last === "つ" || last === "る") {
      return base + "った";
    }
    if (last === "ぶ" || last === "む" || last === "ぬ") {
      return base + "んだ";
    }
    if (last === "く") {
      return base + "いた";
    }
    if (last === "ぐ") {
      return base + "いだ";
    }
    if (last === "す") {
      return base + "した";
    }
    throw new Error(`Unsupported godan ending for past: ${last}`);
  }

  function godanTe(base, last) {
    if (last === "う" || last === "つ" || last === "る") {
      return base + "って";
    }
    if (last === "ぶ" || last === "む" || last === "ぬ") {
      return base + "んで";
    }
    if (last === "く") {
      return base + "いて";
    }
    if (last === "ぐ") {
      return base + "いで";
    }
    if (last === "す") {
      return base + "して";
    }
    throw new Error(`Unsupported godan ending for te-form: ${last}`);
  }

  function applySpecialCase(templateId, kana, exceptions, generated) {
    const special = exceptions && exceptions.special_cases ? exceptions.special_cases : {};
    if (templateId === "plain_te_form") {
      return (special.te_form && special.te_form[kana]) || generated;
    }
    if (templateId === "plain_past") {
      return (special.plain_past && special.plain_past[kana]) || generated;
    }
    return generated;
  }

  function conjugateIchidan(kana, templateId) {
    const stem = kana.slice(0, -1);
    switch (templateId) {
      case "plain_dictionary":
        return kana;
      case "plain_negative":
        return stem + "ない";
      case "plain_past":
        return stem + "た";
      case "plain_past_negative":
        return stem + "なかった";
      case "plain_te_form":
        return stem + "て";
      case "polite_dictionary":
        return stem + "ます";
      case "polite_negative":
        return stem + "ません";
      case "polite_past":
        return stem + "ました";
      case "polite_past_negative":
        return stem + "ませんでした";
      case "polite_te_form":
        return stem + "てください";
      default:
        throw new Error(`Unsupported template: ${templateId}`);
    }
  }

  function conjugateGodan(kana, templateId, exceptions) {
    const last = kana.slice(-1);
    const base = kana.slice(0, -1);

    switch (templateId) {
      case "plain_dictionary":
        return kana;
      case "plain_negative":
        return base + A_ROW[last] + "ない";
      case "plain_past": {
        const past = godanPast(base, last);
        return applySpecialCase(templateId, kana, exceptions, past);
      }
      case "plain_past_negative": {
        const negative = base + A_ROW[last] + "ない";
        return negative.replace(/ない$/, "なかった");
      }
      case "plain_te_form": {
        const te = godanTe(base, last);
        return applySpecialCase(templateId, kana, exceptions, te);
      }
      case "polite_dictionary":
        return base + I_ROW[last] + "ます";
      case "polite_negative":
        return base + I_ROW[last] + "ません";
      case "polite_past":
        return base + I_ROW[last] + "ました";
      case "polite_past_negative":
        return base + I_ROW[last] + "ませんでした";
      case "polite_te_form": {
        const te = applySpecialCase("plain_te_form", kana, exceptions, godanTe(base, last));
        return te + "ください";
      }
      default:
        throw new Error(`Unsupported template: ${templateId}`);
    }
  }

  function conjugate(verb, templateId, exceptions) {
    if (!verb) {
      throw new Error("Missing verb record.");
    }
    const kana = verb.kana;
    const verbClass = verb.verb_class;
    const manual = verb.new_conjugations ? verb.new_conjugations[templateId] : null;
    if (typeof manual === "string" && manual.length > 0) {
      return manual;
    }

    const teIruSuffixes = {
      plain_te_iru: "いる",
      polite_te_imasu: "います",
      polite_te_imasen: "いません",
      polite_te_imashita: "いました",
      polite_te_imasen_deshita: "いませんでした",
    };
    if (teIruSuffixes[templateId]) {
      const teForm = conjugate(verb, "plain_te_form", exceptions);
      return teForm + teIruSuffixes[templateId];
    }

    if (verbClass === "irregular") {
      const table = IRREGULAR_TABLE[kana];
      if (!table) {
        throw new Error(`Irregular table missing for kana: ${kana}`);
      }
      if (!table[templateId]) {
        throw new Error(`Unsupported template for irregular: ${templateId}`);
      }
      return table[templateId];
    }

    if (verbClass === "ichidan") {
      const base = conjugateIchidan(kana, templateId);
      if (templateId === "plain_te_form" || templateId === "plain_past") {
        return applySpecialCase(templateId, kana, exceptions, base);
      }
      if (templateId === "polite_te_form") {
        const te = applySpecialCase(
          "plain_te_form",
          kana,
          exceptions,
          conjugateIchidan(kana, "plain_te_form")
        );
        return te + "ください";
      }
      return base;
    }

    if (verbClass === "godan") {
      return conjugateGodan(kana, templateId, exceptions);
    }

    throw new Error(`Unsupported verb_class: ${verbClass}`);
  }

  const STAGE_ORDER = ["LEARNING", "S1", "S2", "S3", "S4", "S5", "S6", "RETIRED"];
  const STAGE_INTERVALS_DAYS = {
    S1: 1,
    S2: 3,
    S3: 7,
    S4: 14,
    S5: 30,
    S6: 60,
  };

  const REQUEUE_SHORT = 8;
  const REQUEUE_LONG = 18;
  const LEECH_THRESHOLD_TOTAL = 4;

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function makeCardId(verbId, conjugationId) {
    return `${verbId}::${conjugationId}`;
  }

  function createCard(verbId, conjugationId, now) {
    const ts = now || new Date();
    const nowIso = ts.toISOString();
    return {
      card_id: makeCardId(verbId, conjugationId),
      verb_id: verbId,
      conjugation_id: conjugationId,
      stage: "LEARNING",
      learning_step: 0,
      due_at: nowIso,
      last_reviewed_at: null,
      success_count_total: 0,
      failure_count_total: 0,
      hint_used_last: false,
      is_leech: false,
    };
  }

  function isDue(card, now) {
    if (!card.due_at) return false;
    const ts = now || new Date();
    return new Date(card.due_at).getTime() <= ts.getTime();
  }

  function buildDailyReviewQueue(cards, now) {
    const ts = now || new Date();
    return cards
      .filter(function (card) {
        return isDue(card, ts);
      })
      .sort(function (a, b) {
        return new Date(a.due_at) - new Date(b.due_at);
      });
  }

  function buildFocusedDrillQueue(verbs, templateId, count, cardStore, now) {
    const ts = now || new Date();
    const max = Math.min(count, verbs.length);
    const shuffled = verbs.slice().sort(function () {
      return Math.random() - 0.5;
    });
    const selected = shuffled.slice(0, max);
    const cards = [];

    for (let i = 0; i < selected.length; i += 1) {
      const verb = selected[i];
      const cardId = makeCardId(verb.id, templateId);
      const existing = cardStore[cardId];
      cards.push(existing || createCard(verb.id, templateId, ts));
    }

    return cards;
  }

  function buildWeaknessQueue(cardStore, count) {
    const cards = Object.keys(cardStore)
      .map(function (key) {
        return cardStore[key];
      })
      .filter(function (card) {
        return card.failure_count_total > 0;
      });

    cards.sort(function (a, b) {
      if (a.is_leech !== b.is_leech) return a.is_leech ? -1 : 1;
      if (a.failure_count_total !== b.failure_count_total) {
        return b.failure_count_total - a.failure_count_total;
      }
      const aAttempts = a.success_count_total + a.failure_count_total;
      const bAttempts = b.success_count_total + b.failure_count_total;
      const aAcc = aAttempts ? a.success_count_total / aAttempts : 1;
      const bAcc = bAttempts ? b.success_count_total / bAttempts : 1;
      return aAcc - bAcc;
    });

    return cards.slice(0, count);
  }

  function nextStage(stage) {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) return stage;
    return STAGE_ORDER[idx + 1];
  }

  function applyReviewResult(card, options) {
    const opts = options || {};
    const ts = opts.now || new Date();
    const nowIso = ts.toISOString();
    const correct = Boolean(opts.correct);
    const hintUsed = Boolean(opts.hintUsed);

    card.last_reviewed_at = nowIso;
    card.hint_used_last = hintUsed;

    if (correct) {
      card.success_count_total = (card.success_count_total || 0) + 1;
      if (hintUsed) {
        if (card.stage === "LEARNING") {
          card.due_at = nowIso;
          return { card: card, requeueAfter: REQUEUE_SHORT };
        }
        const interval = STAGE_INTERVALS_DAYS[card.stage] || 1;
        const newInterval = Math.max(1, Math.floor(interval * 0.5));
        card.due_at = addDays(ts, newInterval).toISOString();
        return { card: card, requeueAfter: 0 };
      }

      if (card.stage === "LEARNING") {
        if (card.learning_step < 2) {
          card.learning_step += 1;
          card.due_at = nowIso;
          const delay = card.learning_step === 1 ? REQUEUE_SHORT : REQUEUE_LONG;
          return { card: card, requeueAfter: delay };
        }
        card.stage = "S1";
        card.learning_step = null;
        card.due_at = addDays(ts, STAGE_INTERVALS_DAYS.S1).toISOString();
        return { card: card, requeueAfter: 0 };
      }

      if (card.stage === "S6") {
        card.stage = "RETIRED";
        card.due_at = null;
        return { card: card, requeueAfter: 0 };
      }

      if (card.stage.indexOf("S") === 0) {
        const next = nextStage(card.stage);
        card.stage = next;
        const interval = STAGE_INTERVALS_DAYS[next] || 1;
        card.due_at = addDays(ts, interval).toISOString();
        return { card: card, requeueAfter: 0 };
      }

      return { card: card, requeueAfter: 0 };
    }

    card.failure_count_total = (card.failure_count_total || 0) + 1;
    if (card.failure_count_total >= LEECH_THRESHOLD_TOTAL) {
      card.is_leech = true;
    }
    if (card.stage && card.stage.indexOf("S") === 0) {
      let nextStageValue = card.stage;
      if (card.stage !== "S1") {
        const stageNum = Number(card.stage.slice(1));
        if (!Number.isNaN(stageNum)) {
          const demoted = Math.max(1, stageNum - 2);
          nextStageValue = `S${demoted}`;
        }
      }
      card.stage = nextStageValue;
      card.learning_step = null;
      card.due_at = addDays(ts, 1).toISOString();
      return { card: card, requeueAfter: 0 };
    }

    card.stage = "LEARNING";
    card.learning_step = 0;
    card.due_at = addDays(ts, STAGE_INTERVALS_DAYS.S1).toISOString();
    return { card: card, requeueAfter: REQUEUE_SHORT };
  }

  function normalizeEnabledForms(templates, enabledIds) {
    const eligible = (templates || [])
      .filter((tpl) => tpl && tpl.active && tpl.id !== "plain_dictionary")
      .map((tpl) => tpl.id);
    if (!Array.isArray(enabledIds)) {
      return eligible.slice();
    }
    if (enabledIds.length === 0) {
      return [];
    }
    const eligibleSet = new Set(eligible);
    return enabledIds.filter((id) => eligibleSet.has(id));
  }

  function isReviewLikeMode(mode) {
    return mode === "reviews" || mode === "focused";
  }

  return {
    romajiToKana: romajiToKana,
    normalizeAnswer: normalizeAnswer,
    toHiragana: toHiragana,
    conjugate: conjugate,
    makeCardId: makeCardId,
    createCard: createCard,
    isDue: isDue,
    buildDailyReviewQueue: buildDailyReviewQueue,
    buildFocusedDrillQueue: buildFocusedDrillQueue,
    buildWeaknessQueue: buildWeaknessQueue,
    applyReviewResult: applyReviewResult,
    normalizeEnabledForms: normalizeEnabledForms,
    isReviewLikeMode: isReviewLikeMode,
  };
});
